import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Coins,
  CreditCard,
  PackageCheck,
  Plus,
  RefreshCw,
  ScanLine,
  SplitSquareHorizontal,
  Ticket,
  Trash2,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import BarcodeScanner from "@/components/POS/BarcodeScanner";
import InvoiceDialog from "@/components/POS/InvoiceDialog";
import POSReceivablePaymentDialog, { type POSReceivableParty } from "@/components/POS/POSReceivablePaymentDialog";
import PaymentMethodBrand from "@/components/payments/PaymentMethodBrand";
import type { CartItem, Sale } from "@/types";
import { siteConfig } from "@/config/site";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { useToast } from "@/hooks/use-toast";
import { preflightPosCart } from "@/services/supabase/posPreflightService";
import { clearConfirmedModernPosSale, submitModernPosSale, type ModernPOSPaymentSplit } from "@/services/supabase/posCheckoutV2Service";
import { calculatePOSPaymentFee, fetchPOSPaymentMethods, type POSPaymentMethod } from "@/services/supabase/posPaymentMethodService";
import type { POSReceivableCollectionResult } from "@/services/supabase/posReceivableService";
import {
  isCustomerLoyaltyBarcode,
  isLoyaltyVoucherBarcode,
  lookupPOSLoyaltyCustomer,
  lookupPOSLoyaltyVoucher,
  type POSLoyaltyCustomer,
  type POSLoyaltyVoucher,
} from "@/services/supabase/loyaltyService";
import {
  isEmployeePurchaseBarcode,
  lookupEmployeePurchaseCard,
  type POSEmployeePurchaseCard,
} from "@/services/employeeWalletService";
import {
  posLoyaltyContextKey,
  posVoucherContextKey,
  readPOSLoyaltyCustomer,
  readPOSLoyaltyVoucher,
} from "@/components/POS/POSCustomerLoyaltyBridge";

type ScanTarget = "buyer" | "voucher" | null;
type SplitDraft = { methodId: string; amount: string; reference: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkoutId: string;
  items: CartItem[];
  total: number;
  onRepriced: (items: CartItem[]) => void;
  onSaleCommitted?: (sale: Sale) => void;
  onStartNewSale: () => void;
};

type PaymentPreview = {
  fee: number;
  customerFee: number;
  merchantFee: number;
  amountCharged: number;
  estimatedNetSettlement: number;
};

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} ${siteConfig.currency}`;
}

function isCreditMethod(method: POSPaymentMethod | null | undefined) {
  return method?.code === "employee_credit" || method?.code === "customer_credit";
}

function previewFor(method: POSPaymentMethod | null | undefined, baseAmount: number): PaymentPreview {
  if (isCreditMethod(method)) return { fee: 0, customerFee: 0, merchantFee: 0, amountCharged: 0, estimatedNetSettlement: 0 };
  return calculatePOSPaymentFee(method, baseAmount);
}

function distributeEvenly(methodIds: string[], total: number): SplitDraft[] {
  if (!methodIds.length || total <= 0) return [];
  const cents = Math.round(total * 100);
  const each = Math.floor(cents / methodIds.length);
  let used = 0;
  return methodIds.map((methodId, index) => {
    const part = index === methodIds.length - 1 ? cents - used : each;
    used += part;
    return { methodId, amount: (part / 100).toFixed(2), reference: "" };
  });
}

export default function POSCheckoutModernDialog({ open, onOpenChange, checkoutId, items, total, onRepriced, onSaleCommitted, onStartNewSale }: Props) {
  const { user } = useAuth();
  const { currentBranchId } = useBranchStore();
  const { toast } = useToast();
  const [customer, setCustomer] = useState<POSLoyaltyCustomer | null>(null);
  const [employee, setEmployee] = useState<POSEmployeePurchaseCard | null>(null);
  const [voucher, setVoucher] = useState<POSLoyaltyVoucher | null>(null);
  const [methods, setMethods] = useState<POSPaymentMethod[]>([]);
  const [methodId, setMethodId] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [cashTendered, setCashTendered] = useState("");
  const [mixedMode, setMixedMode] = useState(false);
  const [splitDrafts, setSplitDrafts] = useState<SplitDraft[]>([]);
  const [scanTarget, setScanTarget] = useState<ScanTarget>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [receivableOpen, setReceivableOpen] = useState(false);
  const scanTargetRef = useRef<ScanTarget>(null);

  const customerCreditMethod = useMemo<POSPaymentMethod | null>(() => {
    if (!currentBranchId || !customer?.credit_active || !customer.credit_payment_method_id) return null;
    return {
      id: customer.credit_payment_method_id,
      branch_id: currentBranchId,
      code: "customer_credit",
      name: "آجل عميل",
      method_type: "other",
      active: true,
      sort_order: 960,
      fee_type: "none",
      fee_value: 0,
      fee_bearer: "business",
      require_reference: false,
      settlement_account_id: null,
      metadata: { internal_only: true, customer_credit: true },
    };
  }, [currentBranchId, customer]);

  const allMethods = useMemo(() => {
    if (!customerCreditMethod || methods.some(row => row.id === customerCreditMethod.id)) return methods;
    return [...methods, customerCreditMethod];
  }, [methods, customerCreditMethod]);

  const visibleMethods = useMemo(
    () => allMethods
      .filter(row => row.active
        && (row.code !== "employee_credit" || Boolean(employee?.credit_active))
        && (row.code !== "customer_credit" || Boolean(customer?.credit_active)))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ar")),
    [allMethods, employee?.credit_active, customer?.credit_active],
  );
  const normalMethods = useMemo(() => methods.filter(row => row.active && row.code !== "employee_credit" && row.code !== "customer_credit" && !Boolean(row.metadata?.internal_only)), [methods]);
  const selectedMethod = useMemo(() => visibleMethods.find(row => row.id === methodId) || null, [visibleMethods, methodId]);
  const voucherAmount = voucher ? Math.max(0, Math.min(Number(voucher.remaining_value_egp || 0), Number(total || 0))) : 0;
  const baseDue = Math.max(0, Number((Number(total || 0) - voucherAmount).toFixed(2)));
  const isEmployeeCredit = !mixedMode && selectedMethod?.code === "employee_credit";
  const isCustomerCredit = !mixedMode && selectedMethod?.code === "customer_credit";
  const isSingleCredit = isEmployeeCredit || isCustomerCredit;
  const singlePreview = useMemo(() => previewFor(selectedMethod, baseDue), [selectedMethod, baseDue]);

  const splitRows = useMemo(() => splitDrafts.map(draft => {
    const method = visibleMethods.find(row => row.id === draft.methodId) || null;
    const baseAmount = Math.max(0, Number(draft.amount || 0));
    return { ...draft, method, baseAmount, preview: previewFor(method, baseAmount) };
  }), [splitDrafts, visibleMethods]);

  const splitBaseTotal = Number(splitRows.reduce((sum, row) => sum + row.baseAmount, 0).toFixed(2));
  const splitRemaining = Number((baseDue - splitBaseTotal).toFixed(2));
  const splitCustomerFee = Number(splitRows.reduce((sum, row) => sum + row.preview.customerFee, 0).toFixed(2));
  const splitMerchantFee = Number(splitRows.reduce((sum, row) => sum + row.preview.merchantFee, 0).toFixed(2));
  const splitAmountToCollect = Number(splitRows.reduce((sum, row) => sum + row.preview.amountCharged, 0).toFixed(2));
  const splitCashDue = Number(splitRows.filter(row => row.method?.method_type === "cash").reduce((sum, row) => sum + row.preview.amountCharged, 0).toFixed(2));
  const splitCreditAmount = Number(splitRows.filter(row => isCreditMethod(row.method)).reduce((sum, row) => sum + row.baseAmount, 0).toFixed(2));
  const splitPaidBase = Number(splitRows.filter(row => !isCreditMethod(row.method)).reduce((sum, row) => sum + row.baseAmount, 0).toFixed(2));

  const creditAmount = isSingleCredit ? baseDue : mixedMode ? splitCreditAmount : 0;
  const paidBase = isSingleCredit ? 0 : mixedMode ? splitPaidBase : baseDue;
  const amountToCollect = isSingleCredit ? 0 : mixedMode ? splitAmountToCollect : singlePreview.amountCharged;
  const activeCashDue = mixedMode ? splitCashDue : selectedMethod?.method_type === "cash" ? singlePreview.amountCharged : 0;
  const change = activeCashDue > 0 ? Math.max(0, Number(cashTendered || 0) - activeCashDue) : 0;
  const expectedCustomerPoints = customer ? Math.floor(paidBase) : 0;
  const expectedEmployeePoints = employee ? Math.floor(paidBase * 5) : 0;

  const receivableParty = useMemo<POSReceivableParty | null>(() => {
    if (customer && Number(customer.receivable_balance || 0) > 0) return { kind: "customer", id: customer.customer_id, name: customer.name || "عميل المعداوي", balance: Number(customer.receivable_balance || 0) };
    if (employee && Number(employee.receivable_balance || 0) > 0) return { kind: "employee", id: employee.employee_id, name: employee.name, balance: Number(employee.receivable_balance || 0) };
    return null;
  }, [customer, employee]);

  const syncContexts = useCallback(() => {
    if (!currentBranchId) return;
    setCustomer(readPOSLoyaltyCustomer(currentBranchId, checkoutId));
    setVoucher(readPOSLoyaltyVoucher(currentBranchId, checkoutId));
  }, [currentBranchId, checkoutId]);

  const notifyContextChanged = () => window.dispatchEvent(new CustomEvent("pos:loyalty-voucher-changed"));

  const storeCustomer = useCallback((next: POSLoyaltyCustomer | null) => {
    if (!currentBranchId) return;
    try {
      if (next) localStorage.setItem(posLoyaltyContextKey(currentBranchId, checkoutId), JSON.stringify(next));
      else localStorage.removeItem(posLoyaltyContextKey(currentBranchId, checkoutId));
      localStorage.removeItem(posVoucherContextKey(currentBranchId, checkoutId));
    } catch { /* server payload remains authoritative */ }
    setCustomer(next);
    setVoucher(null);
    if (next) setEmployee(null);
    notifyContextChanged();
  }, [currentBranchId, checkoutId]);

  const updateCustomerCredit = useCallback((balance: number, available: number) => {
    if (!currentBranchId) return;
    setCustomer(current => {
      if (!current) return current;
      const next = { ...current, receivable_balance: balance, credit_available: available };
      try { localStorage.setItem(posLoyaltyContextKey(currentBranchId, checkoutId), JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
    notifyContextChanged();
  }, [currentBranchId, checkoutId]);

  const storeVoucher = useCallback((next: POSLoyaltyVoucher | null) => {
    if (!currentBranchId) return;
    try {
      if (next) localStorage.setItem(posVoucherContextKey(currentBranchId, checkoutId), JSON.stringify(next));
      else localStorage.removeItem(posVoucherContextKey(currentBranchId, checkoutId));
    } catch { /* noop */ }
    setVoucher(next);
    notifyContextChanged();
  }, [currentBranchId, checkoutId]);

  const loadMethods = useCallback(async () => {
    if (!currentBranchId) return;
    setLoadingMethods(true);
    try {
      const rows = await fetchPOSPaymentMethods(currentBranchId);
      setMethods(rows);
      const normal = rows.filter(row => row.active && row.code !== "employee_credit" && row.code !== "customer_credit" && !Boolean(row.metadata?.internal_only));
      const cash = normal.find(row => row.method_type === "cash");
      const fallback = cash || normal[0];
      setMethodId(current => rows.some(row => row.id === current && row.active) ? current : fallback?.id || "");
    } catch (err: any) {
      setError(err?.message || "تعذر تحميل وسائل الدفع.");
    } finally {
      setLoadingMethods(false);
    }
  }, [currentBranchId]);

  useEffect(() => {
    if (!open) return;
    setSale(null);
    setEmployee(null);
    setError(null);
    setPaymentReference("");
    setMixedMode(false);
    setSplitDrafts([]);
    setScanTarget(null);
    syncContexts();
    void loadMethods();
  }, [open, syncContexts, loadMethods]);

  useEffect(() => {
    if (!methodId || visibleMethods.some(row => row.id === methodId)) return;
    const cash = normalMethods.find(row => row.method_type === "cash") || normalMethods[0];
    setMethodId(cash?.id || "");
    setMixedMode(false);
    setSplitDrafts([]);
  }, [methodId, visibleMethods, normalMethods]);

  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent("pos:modern-checkout-state", { detail: { open: true } }));
    return () => { window.dispatchEvent(new CustomEvent("pos:modern-checkout-state", { detail: { open: false } })); };
  }, [open]);

  useEffect(() => {
    if (!open || mixedMode) return;
    if (selectedMethod?.method_type === "cash") setCashTendered(singlePreview.amountCharged.toFixed(2));
    else setCashTendered("");
  }, [open, mixedMode, selectedMethod?.id, selectedMethod?.method_type, singlePreview.amountCharged]);

  useEffect(() => {
    if (!mixedMode || splitCashDue <= 0) return;
    setCashTendered(current => !current || Number(current) < splitCashDue ? splitCashDue.toFixed(2) : current);
  }, [mixedMode, splitCashDue]);

  const handleBarcode = useCallback(async (raw: string) => {
    const barcode = raw.trim();
    const target = scanTargetRef.current;
    if (!currentBranchId || !barcode || !target) return;
    setError(null);
    try {
      if (target === "buyer") {
        if (isCustomerLoyaltyBarcode(barcode)) {
          const linked = await lookupPOSLoyaltyCustomer(barcode, currentBranchId);
          if (!linked) throw new Error("باركود الزبون غير معروف.");
          setEmployee(null);
          storeCustomer(linked);
          toast({
            title: `تم ربط ${linked.name || "الزبون"}`,
            description: `رصيد سابق ${money(linked.receivable_balance)}${linked.credit_active ? ` · آجل متاح ${money(linked.credit_available)}` : ""}`,
          });
        } else if (isEmployeePurchaseBarcode(barcode)) {
          const linked = await lookupEmployeePurchaseCard(barcode, currentBranchId);
          if (!linked) throw new Error("باركود الموظف غير معروف أو الحساب غير نشط.");
          storeCustomer(null);
          setEmployee(linked);
          toast({ title: `تم ربط الموظف ${linked.name}`, description: `رصيد سابق ${money(linked.receivable_balance)} · آجل متاح ${money(linked.credit_available)}` });
        } else {
          throw new Error("الباركود مش هوية زبون أو موظف. امسح بطاقة 299… أو 297….");
        }
      } else {
        if (!customer) throw new Error("امسح بطاقة العميل الأول قبل كوبون الخصم.");
        if (!isLoyaltyVoucherBarcode(barcode)) throw new Error("ده مش باركود كوبون خصم. امسح كوبون الخصم اللي يبدأ بـ 298.");
        const linked = await lookupPOSLoyaltyVoucher(barcode, currentBranchId, customer.customer_id);
        if (!linked) throw new Error("كوبون الخصم غير موجود أو غير متاح.");
        storeVoucher(linked);
        toast({ title: "تم إضافة كوبون الخصم", description: `${linked.voucher_code} · رصيد ${money(Number(linked.remaining_value_egp || 0))}` });
      }
      setScanTarget(null);
      scanTargetRef.current = null;
    } catch (err: any) {
      setError(err?.message || "تعذر قراءة الباركود.");
    }
  }, [currentBranchId, customer, storeCustomer, storeVoucher, toast]);

  const beginScan = (target: Exclude<ScanTarget, null>, camera = false) => {
    scanTargetRef.current = target;
    setScanTarget(target);
    if (camera) setCameraOpen(true);
  };

  useEffect(() => {
    if (!open || !scanTarget) return;
    document.documentElement.dataset.posCheckoutScanTarget = scanTarget;
    let buffer = "";
    let lastKeyAt = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { scanTargetRef.current = null; setScanTarget(null); return; }
      if (event.key === "Enter") {
        const code = buffer.trim();
        buffer = "";
        if (code) { event.preventDefault(); event.stopImmediatePropagation(); void handleBarcode(code); }
        return;
      }
      if (/^[0-9]$/.test(event.key)) {
        const now = Date.now();
        if (now - lastKeyAt > 140) buffer = "";
        buffer += event.key;
        lastKeyAt = now;
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => { delete document.documentElement.dataset.posCheckoutScanTarget; document.removeEventListener("keydown", onKeyDown, true); };
  }, [open, scanTarget, handleBarcode]);

  const enableMixedMode = (preferCredit = false) => {
    if (visibleMethods.length < 2 || baseDue <= 0) return;
    const credit = visibleMethods.find(isCreditMethod) || null;
    const current = selectedMethod || normalMethods.find(row => row.method_type === "cash") || visibleMethods[0];
    let first = current;
    let second = visibleMethods.find(row => row.id !== first.id) || null;
    if ((preferCredit || isCreditMethod(first)) && credit) {
      if (isCreditMethod(first)) second = normalMethods.find(row => row.method_type === "cash") || normalMethods[0] || second;
      else second = credit;
    } else if (credit && !isCreditMethod(first)) {
      second = credit;
    }
    if (!second) return;
    setSplitDrafts(distributeEvenly([first.id, second.id], baseDue));
    setCashTendered("");
    setMixedMode(true);
    setError(null);
  };

  const disableMixedMode = () => {
    setMixedMode(false);
    setSplitDrafts([]);
    setError(null);
  };

  const addSplitMethod = (id: string) => {
    if (splitDrafts.some(row => row.methodId === id)) return;
    setSplitDrafts(distributeEvenly([...splitDrafts.map(row => row.methodId), id], baseDue));
  };

  const removeSplitMethod = (id: string) => {
    const ids = splitDrafts.filter(row => row.methodId !== id).map(row => row.methodId);
    if (ids.length < 2) { disableMixedMode(); if (ids[0]) setMethodId(ids[0]); return; }
    setSplitDrafts(distributeEvenly(ids, baseDue));
  };

  const updateSplit = (id: string, patch: Partial<SplitDraft>) => setSplitDrafts(current => current.map(row => row.methodId === id ? { ...row, ...patch } : row));
  const fillSplitRemainder = (id: string) => {
    const other = splitDrafts.filter(row => row.methodId !== id).reduce((sum, row) => sum + Math.max(0, Number(row.amount || 0)), 0);
    updateSplit(id, { amount: Math.max(0, Number((baseDue - other).toFixed(2))).toFixed(2) });
  };

  const creditLimitValid = useMemo(() => splitRows.every(row => {
    if (row.method?.code === "customer_credit") return Boolean(customer?.credit_active) && row.baseAmount <= Number(customer?.credit_available || 0) + 0.009;
    if (row.method?.code === "employee_credit") return Boolean(employee?.credit_active) && row.baseAmount <= Number(employee?.credit_available || 0) + 0.009;
    return true;
  }), [splitRows, customer, employee]);

  const mixedPaymentValid = useMemo(() => {
    if (baseDue <= 0) return true;
    if (!mixedMode || splitRows.length < 2 || Math.abs(splitRemaining) > 0.009 || !creditLimitValid) return false;
    if (splitRows.some(row => !row.method || row.baseAmount <= 0 || (!isCreditMethod(row.method) && row.method.require_reference && !row.reference.trim()))) return false;
    if (splitCashDue > 0 && Number(cashTendered || 0) < splitCashDue) return false;
    return true;
  }, [baseDue, mixedMode, splitRows, splitRemaining, creditLimitValid, splitCashDue, cashTendered]);

  const singlePaymentValid = useMemo(() => {
    if (baseDue <= 0) return true;
    if (!selectedMethod) return false;
    if (isEmployeeCredit) return Boolean(employee?.credit_active) && baseDue <= Number(employee?.credit_available || 0) + 0.009;
    if (isCustomerCredit) return Boolean(customer?.credit_active) && baseDue <= Number(customer?.credit_available || 0) + 0.009;
    if (selectedMethod.require_reference && !paymentReference.trim()) return false;
    if (selectedMethod.method_type === "cash") return Number(cashTendered || 0) >= singlePreview.amountCharged;
    return true;
  }, [baseDue, selectedMethod, isEmployeeCredit, employee, isCustomerCredit, customer, paymentReference, cashTendered, singlePreview.amountCharged]);

  const paymentValid = mixedMode ? mixedPaymentValid : singlePaymentValid;

  const completeSale = async () => {
    if (!currentBranchId || !user?.id || !paymentValid || processing || !items.length) return;
    if (baseDue > 0 && !mixedMode && !selectedMethod) return;
    setProcessing(true);
    setError(null);
    try {
      const checked = await preflightPosCart(currentBranchId, items);
      if (checked.repriced || Math.abs(Number(checked.total) - Number(total)) > 0.009) {
        onRepriced(checked.items);
        setError("تم تحديث سعر أو عرض في السلة. راجع الإجمالي ثم أكد البيع مرة أخرى.");
        return;
      }
      const profit = checked.items.reduce((sum, item) => {
        const qty = item.weight ?? item.quantity;
        return sum + Number(item.total || 0) - Number(item.product.purchase_price || 0) * Number(qty || 0);
      }, 0);
      const payload = {
        date: new Date().toISOString(), items: checked.items, subtotal: checked.subtotal, discount: checked.discount,
        total: checked.total, profit, payment_method: mixedMode || isSingleCredit ? "mixed" : selectedMethod?.method_type === "cash" ? "cash" : "card",
        cash_amount: 0, card_amount: 0, customer_name: customer?.name || undefined, customer_phone: customer?.phone || undefined,
        invoice_number: "PENDING", cashier_name: user.name, branch_id: currentBranchId,
      } as Omit<Sale, "id" | "created_at" | "updated_at">;

      const splits: ModernPOSPaymentSplit[] | undefined = mixedMode
        ? splitRows.map(row => ({ paymentMethodId: row.methodId, baseAmount: row.baseAmount, reference: row.reference.trim() || null }))
        : undefined;
      const selection = mixedMode
        ? { splits, employeeId: employee?.employee_id || null }
        : { paymentMethodId: selectedMethod?.id, paymentReference: paymentReference.trim() || null, employeeId: employee?.employee_id || null };

      const confirmed = await submitModernPosSale(payload, checkoutId, selection);
      setSale(confirmed as Sale);
      setCustomer(null);
      setEmployee(null);
      setVoucher(null);
      onSaleCommitted?.(confirmed as Sale);
      const customerCredit = Number((confirmed as any).customer_credit_amount || 0);
      const employeeCredit = Number((confirmed as any).employee_credit_amount || 0);
      const paid = Number((confirmed as any).paid_base_amount ?? Math.max(0, baseDue - customerCredit - employeeCredit));
      toast({
        title: customerCredit > 0 ? "تم تسجيل آجل العميل" : employeeCredit > 0 ? "تم تسجيل آجل الموظف" : "تم البيع بنجاح",
        description: customerCredit + employeeCredit > 0
          ? `فاتورة ${(confirmed as Sale).invoice_number} · مدفوع ${money(paid)} · آجل ${money(customerCredit + employeeCredit)}`
          : `فاتورة ${(confirmed as Sale).invoice_number}`,
      });
    } catch (err: any) {
      setError(err?.message || "تعذر إتمام البيع.");
      toast({ title: "تعذر إتمام البيع", description: err?.message || "راجع البيانات وحاول مرة أخرى.", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleReceivableCollected = (result: POSReceivableCollectionResult) => {
    if (result.party_kind === "customer") updateCustomerCredit(Number(result.balance_after || 0), Number(result.credit_available || 0));
    else setEmployee(current => current ? { ...current, receivable_balance: Number(result.balance_after || 0), credit_available: Number(result.credit_available || 0) } : current);
    toast({ title: "تم تسجيل سداد الرصيد السابق", description: `تم تحصيل ${money(result.amount)} · المتبقي ${money(result.balance_after)}` });
  };

  const startNewSale = () => {
    if (user?.id && currentBranchId) clearConfirmedModernPosSale(user.id, currentBranchId, checkoutId);
    setSale(null); setCustomer(null); setEmployee(null); setVoucher(null); setPaymentReference(""); setMixedMode(false); setSplitDrafts([]);
    onStartNewSale();
  };

  const saleCustomerCredit = Number((sale as any)?.customer_credit_amount || 0);
  const saleEmployeeCredit = Number((sale as any)?.employee_credit_amount || 0);
  const saleCredit = saleCustomerCredit + saleEmployeeCredit;
  const salePaidBase = Number((sale as any)?.paid_base_amount ?? Math.max(0, Number(sale?.total || 0) - Number((sale as any)?.loyalty_voucher_amount || 0) - saleCredit));
  const saleCollected = Number((sale as any)?.amount_collected ?? (sale as any)?.amount_charged ?? salePaidBase);

  return (
    <>
      <Dialog open={open} onOpenChange={next => { if (!processing) onOpenChange(next); }}>
        <DialogContent dir="rtl" className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{sale ? "تمت عملية البيع" : "إتمام البيع"}</DialogTitle></DialogHeader>

          {sale ? (
            <div className="space-y-5 py-2">
              <div className="rounded-3xl bg-emerald-50 p-6 text-center text-emerald-950">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white"><Check className="h-7 w-7 text-[#005931]" /></div>
                <div className="text-xl font-black">{saleCredit > 0 ? "تم تسجيل الفاتورة والدفع الآجل" : "تم تسجيل الفاتورة"}</div>
                <div className="mt-1 text-sm">{sale.invoice_number}</div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-2xl bg-white p-3"><div className="text-[10px] text-muted-foreground">مدفوع من أصل الفاتورة</div><div className="text-xl font-black text-[#005931]">{money(salePaidBase)}</div></div>
                  <div className="rounded-2xl bg-white p-3"><div className="text-[10px] text-muted-foreground">مسجل آجل</div><div className="text-xl font-black text-amber-800">{money(saleCredit)}</div></div>
                </div>
                {Math.abs(saleCollected - salePaidBase) > 0.009 && <div className="mt-2 text-xs">المحصل فعليًا بعد رسوم وسائل الدفع: {money(saleCollected)}</div>}
                {Number(sale.loyalty_points_earned || 0) > 0 && <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-sm font-bold">+ {Number(sale.loyalty_points_earned || 0).toLocaleString("ar-EG")} نقطة للعميل</div>}
                {Number((sale as any).employee_points_earned || 0) > 0 && <div className="mt-2 rounded-xl bg-white/80 px-3 py-2 text-sm font-bold">+ {Number((sale as any).employee_points_earned || 0).toLocaleString("ar-EG")} نقطة للموظف</div>}
              </div>
              <Button variant="outline" className="h-12 w-full" onClick={() => setInvoiceOpen(true)}><PackageCheck className="ml-2 h-4 w-4" />عرض وطباعة الفاتورة</Button>
              <Button className="h-12 w-full bg-[#005931]" onClick={startNewSale}>عملية بيع جديدة</Button>
            </div>
          ) : (
            <div className="space-y-5">
              {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

              <section className="rounded-3xl border p-4">
                <div className="mb-3 flex items-center justify-between"><div><div className="text-xs font-bold text-[#005931]">1 · هوية المشتري</div><div className="font-black">عميل، موظف، أو بيع مباشر</div></div><UserRound className="h-5 w-5 text-[#005931]" /></div>
                {employee ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="font-black">{employee.name}</div><div className="text-xs text-muted-foreground">{employee.employee_code || employee.membership_number}</div></div><Button variant="ghost" size="icon" onClick={() => setEmployee(null)}><X className="h-4 w-4" /></Button></div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-white p-2"><div className="text-[10px] text-muted-foreground">الرصيد السابق</div><div className="font-black text-red-700">{money(employee.receivable_balance)}</div></div>
                      <div className="rounded-xl bg-white p-2"><div className="text-[10px] text-muted-foreground">حد الآجل</div><div className="font-black">{money(employee.credit_limit)}</div></div>
                      <div className="rounded-xl bg-white p-2"><div className="text-[10px] text-muted-foreground">المتاح</div><div className="font-black text-amber-800">{money(employee.credit_available)}</div></div>
                    </div>
                    {employee.receivable_balance > 0 && <Button variant="outline" className="mt-3 w-full border-amber-300 bg-white" onClick={() => setReceivableOpen(true)}><WalletCards className="ml-2 h-4 w-4" />سداد رصيد سابق · {money(employee.receivable_balance)}</Button>}
                    <div className="mt-2 text-xs text-amber-900">الشراء المدفوع فعليًا يكسب 5 نقاط لكل جنيه. الجزء الآجل لا يكسب نقاط.</div>
                  </div>
                ) : customer ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="font-black">{customer.name || "عميل المعداوي"}</div><div className="text-xs text-muted-foreground">{customer.membership_number || customer.phone || "عميل مرتبط"}</div></div><Button variant="ghost" size="icon" onClick={() => storeCustomer(null)}><X className="h-4 w-4" /></Button></div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-white p-2"><div className="text-[10px] text-muted-foreground">الرصيد السابق</div><div className="font-black text-red-700">{money(customer.receivable_balance)}</div></div>
                      <div className="rounded-xl bg-white p-2"><div className="text-[10px] text-muted-foreground">حد الآجل</div><div className="font-black">{money(customer.credit_limit)}</div></div>
                      <div className="rounded-xl bg-white p-2"><div className="text-[10px] text-muted-foreground">المتاح</div><div className="font-black text-[#005931]">{money(customer.credit_available)}</div></div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2"><Badge className={customer.credit_active ? "bg-[#005931]" : "bg-slate-600"}>{customer.credit_active ? "الآجل مفعل" : "الآجل غير مفعل"}</Badge>{customer.online_registered && <Badge variant="outline" className="bg-white">حساب أونلاين</Badge>}<Badge variant="outline" className="bg-white">{Number(customer.points_balance || 0).toLocaleString("ar-EG")} نقطة</Badge></div>
                    {customer.receivable_balance > 0 && <Button variant="outline" className="mt-3 w-full border-emerald-300 bg-white" onClick={() => setReceivableOpen(true)}><WalletCards className="ml-2 h-4 w-4" />سداد رصيد سابق · {money(customer.receivable_balance)}</Button>}
                  </div>
                ) : (
                  <div className="space-y-3"><div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">ممكن تكمل بدون هوية. امسح بطاقة العميل أو الموظف لعرض الرصيد السابق وتفعيل السداد أو الآجل حسب الصلاحية.</div><div className="grid grid-cols-2 gap-2"><Button variant={scanTarget === "buyer" ? "default" : "outline"} className={scanTarget === "buyer" ? "bg-[#005931]" : ""} onClick={() => beginScan("buyer")}><ScanLine className="ml-2 h-4 w-4" />زبون / موظف</Button><Button variant="outline" onClick={() => beginScan("buyer", true)}>كاميرا الهوية</Button></div>{scanTarget === "buyer" && <div className="text-center text-xs font-semibold text-[#005931]">امسح بطاقة 299… للعميل أو 297… للموظف</div>}</div>
                )}
              </section>

              <section className={`rounded-3xl border p-4 ${!customer ? "opacity-55" : ""}`}>
                <div className="mb-3 flex items-center justify-between"><div><div className="text-xs font-bold text-[#005931]">2 · كوبون الخصم</div><div className="font-black">اسكان منفصل بعد العميل</div></div><Ticket className="h-5 w-5 text-[#005931]" /></div>
                {employee ? <div className="text-sm text-muted-foreground">بطاقة موظف مرتبطة؛ كوبونات العملاء غير متاحة على نفس الفاتورة.</div> : !customer ? <div className="text-sm text-muted-foreground">اربط العميل أولًا لتفعيل كوبون الخصم.</div> : voucher ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4"><Ticket className="h-5 w-5 text-[#005931]" /><div className="min-w-0 flex-1"><div className="font-black">{voucher.voucher_code}</div><div className="text-xs text-emerald-800">خصم حتى {money(voucherAmount)} · الرصيد {money(Number(voucher.remaining_value_egp || 0))}</div></div><Button variant="ghost" size="icon" onClick={() => storeVoucher(null)}><X className="h-4 w-4" /></Button></div>
                ) : <div className="grid grid-cols-2 gap-2"><Button variant={scanTarget === "voucher" ? "default" : "outline"} className={scanTarget === "voucher" ? "bg-[#005931]" : ""} onClick={() => beginScan("voucher")}><ScanLine className="ml-2 h-4 w-4" />اسكان كوبون</Button><Button variant="outline" onClick={() => beginScan("voucher", true)}>كاميرا</Button></div>}
              </section>

              <section className="rounded-3xl border p-4">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><div className="text-xs font-bold text-[#005931]">3 · وسيلة الدفع</div><div className="font-black">{mixedMode ? "دفع جزئي / مختلط" : isSingleCredit ? "تسجيل الفاتورة آجل" : "اختر طريقة التحصيل"}</div></div>
                  <div className="flex flex-wrap gap-2">
                    {baseDue > 0 && visibleMethods.length >= 2 && <Button type="button" size="sm" variant={mixedMode ? "default" : "outline"} className={mixedMode ? "bg-[#005931]" : ""} onClick={() => mixedMode ? disableMixedMode() : enableMixedMode()}><SplitSquareHorizontal className="ml-1 h-4 w-4" />{mixedMode ? "إلغاء المختلط" : "دفع مختلط"}</Button>}
                    {baseDue > 0 && visibleMethods.some(isCreditMethod) && !mixedMode && <Button type="button" size="sm" variant="outline" className="border-amber-300 text-amber-900" onClick={() => enableMixedMode(true)}><CreditCard className="ml-1 h-4 w-4" />جزء مدفوع + آجل</Button>}
                  </div>
                </div>

                {loadingMethods ? <div className="flex justify-center py-5"><RefreshCw className="h-5 w-5 animate-spin text-[#005931]" /></div> : visibleMethods.length === 0 ? <Alert variant="destructive"><AlertDescription>لا توجد وسيلة دفع مفعلة للفرع.</AlertDescription></Alert> : mixedMode ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">{visibleMethods.filter(method => !splitDrafts.some(row => row.methodId === method.id)).map(method => <Button key={method.id} type="button" variant="outline" size="sm" onClick={() => addSplitMethod(method.id)}><Plus className="ml-1 h-3.5 w-3.5" />{method.name}</Button>)}</div>
                    {splitRows.map(row => row.method && <div key={row.methodId} className={`rounded-2xl border p-3 sm:p-4 ${isCreditMethod(row.method) ? "border-amber-200 bg-amber-50" : "bg-white"}`}>
                      <div className="flex items-start gap-3"><div className="min-w-0 flex-1">{isCreditMethod(row.method) ? <div className="flex items-center gap-2 font-black text-amber-900"><CreditCard className="h-5 w-5" />{row.method.name}</div> : <><PaymentMethodBrand method={row.method} compact className="border-0 p-0 shadow-none" /><div className="mt-1 text-sm font-black">{row.method.name}</div></>}</div><Button type="button" variant="ghost" size="icon" className="text-red-600" onClick={() => removeSplitMethod(row.methodId)}><Trash2 className="h-4 w-4" /></Button></div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><Input inputMode="decimal" className="h-12 text-lg font-black" value={row.amount} onChange={event => updateSplit(row.methodId, { amount: event.target.value })} /><Button type="button" variant="outline" className="h-12" onClick={() => fillSplitRemainder(row.methodId)}>ضع المتبقي</Button></div>
                      {!isCreditMethod(row.method) && row.method.require_reference && <Input className="mt-2" dir="ltr" placeholder="مرجع العملية" value={row.reference} onChange={event => updateSplit(row.methodId, { reference: event.target.value })} />}
                      {row.method.code === "customer_credit" && <div className={`mt-2 text-xs font-bold ${row.baseAmount <= Number(customer?.credit_available || 0) + 0.009 ? "text-amber-900" : "text-red-700"}`}>المتاح للعميل: {money(Number(customer?.credit_available || 0))}</div>}
                      {row.method.code === "employee_credit" && <div className={`mt-2 text-xs font-bold ${row.baseAmount <= Number(employee?.credit_available || 0) + 0.009 ? "text-amber-900" : "text-red-700"}`}>المتاح للموظف: {money(Number(employee?.credit_available || 0))}</div>}
                      {!isCreditMethod(row.method) && row.preview.fee > 0 && <div className="mt-2 text-xs text-amber-800">رسوم {money(row.preview.fee)} · التحصيل {money(row.preview.amountCharged)}</div>}
                    </div>)}
                    <div className={`rounded-2xl p-4 ${Math.abs(splitRemaining) <= 0.009 && creditLimitValid ? "bg-emerald-50 text-emerald-950" : "bg-red-50 text-red-900"}`}><div className="grid grid-cols-3 gap-2 text-center"><div><div className="text-[10px] opacity-70">أصل المطلوب</div><div className="font-black">{money(baseDue)}</div></div><div><div className="text-[10px] opacity-70">مدفوع الآن</div><div className="font-black">{money(splitPaidBase)}</div></div><div><div className="text-[10px] opacity-70">آجل</div><div className="font-black">{money(splitCreditAmount)}</div></div></div>{Math.abs(splitRemaining) > 0.009 && <div className="mt-2 text-center text-xs font-bold">متبقي في التوزيع {money(splitRemaining)}</div>}{!creditLimitValid && <div className="mt-2 text-center text-xs font-bold">جزء الآجل أكبر من الحد المتاح.</div>}</div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{visibleMethods.map(method => {
                      const active = method.id === methodId;
                      const credit = isCreditMethod(method);
                      return <button key={method.id} type="button" onClick={() => { setMethodId(method.id); setPaymentReference(""); }} className={`flex min-h-[104px] flex-col items-center justify-center rounded-2xl border p-3 text-center ${active ? credit ? "border-amber-500 bg-amber-50 text-amber-900" : "border-[#005931] bg-emerald-50 text-[#005931]" : "bg-white"}`}>
                        {credit ? <CreditCard className="h-6 w-6" /> : <PaymentMethodBrand method={method} compact className="border-0 shadow-none" />}
                        <div className="mt-2 text-sm font-black">{method.name}</div>
                        {credit && <div className="mt-1 text-[10px]">لا يدخل تحصيل الوردية</div>}
                      </button>;
                    })}</div>
                    {isCustomerCredit && customer && <div className={`mt-3 rounded-2xl p-4 ${baseDue <= customer.credit_available + 0.009 ? "bg-amber-50 text-amber-950" : "bg-red-50 text-red-900"}`}><div className="flex justify-between"><span>الرصيد السابق</span><strong>{money(customer.receivable_balance)}</strong></div><div className="mt-2 flex justify-between"><span>سيضاف آجل</span><strong>{money(baseDue)}</strong></div><div className="mt-2 flex justify-between"><span>الرصيد بعد الفاتورة</span><strong>{money(customer.receivable_balance + baseDue)}</strong></div><div className="mt-2 text-xs">المتاح قبل العملية {money(customer.credit_available)} · المحصل الآن 0.00</div></div>}
                    {isEmployeeCredit && employee && <div className={`mt-3 rounded-2xl p-4 ${baseDue <= employee.credit_available + 0.009 ? "bg-amber-50 text-amber-950" : "bg-red-50 text-red-900"}`}><div className="flex justify-between"><span>الرصيد السابق</span><strong>{money(employee.receivable_balance)}</strong></div><div className="mt-2 flex justify-between"><span>سيضاف آجل</span><strong>{money(baseDue)}</strong></div><div className="mt-2 flex justify-between"><span>الرصيد بعد الفاتورة</span><strong>{money(employee.receivable_balance + baseDue)}</strong></div><div className="mt-2 text-xs">المتاح قبل العملية {money(employee.credit_available)} · المحصل الآن 0.00</div></div>}
                    {selectedMethod?.require_reference && !isSingleCredit && <div className="mt-3"><Label>الرقم المرجعي للعملية</Label><Input className="mt-1" dir="ltr" value={paymentReference} onChange={event => setPaymentReference(event.target.value)} /></div>}
                    {!isSingleCredit && singlePreview.fee > 0 && <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-950">رسوم {selectedMethod?.name}: {money(singlePreview.fee)} · {selectedMethod?.fee_bearer === "customer" ? "على العميل" : "على المنشأة"}</div>}
                  </>
                )}

                {activeCashDue > 0 && <div className="mt-4 rounded-2xl border bg-slate-50 p-3"><Label>النقدي المستلم · المطلوب {money(activeCashDue)}</Label><Input inputMode="decimal" className="mt-2 h-12 bg-white text-xl font-black" value={cashTendered} onChange={event => setCashTendered(event.target.value)} /><div className="mt-2 text-center text-sm">الباقي للعميل <strong className="text-[#005931]">{money(change)}</strong></div></div>}
              </section>

              <div className="rounded-3xl bg-slate-50 p-4">
                <div className="flex justify-between text-sm"><span>إجمالي المنتجات</span><strong>{money(total)}</strong></div>
                {voucherAmount > 0 && <div className="mt-2 flex justify-between text-sm text-emerald-700"><span>كوبون الخصم</span><strong>- {money(voucherAmount)}</strong></div>}
                {(mixedMode ? splitCustomerFee : singlePreview.customerFee) > 0 && <div className="mt-2 flex justify-between text-sm text-amber-700"><span>رسوم على العميل</span><strong>+ {money(mixedMode ? splitCustomerFee : singlePreview.customerFee)}</strong></div>}
                {mixedMode && splitMerchantFee > 0 && <div className="mt-2 text-[11px] text-muted-foreground">عمولات تتحملها المنشأة: {money(splitMerchantFee)}</div>}
                {(customer || employee) && <div className="mt-3 flex justify-between border-t pt-3 text-sm"><span>الرصيد السابق</span><strong>{money(Number(customer?.receivable_balance ?? employee?.receivable_balance ?? 0))}</strong></div>}
                <div className="mt-2 flex justify-between"><span className="font-black">مدفوع من أصل الفاتورة</span><strong className="text-lg text-[#005931]">{money(paidBase)}</strong></div>
                {creditAmount > 0 && <div className="mt-2 flex justify-between"><span className="font-black">مسجل آجل</span><strong className="text-lg text-amber-800">{money(creditAmount)}</strong></div>}
                {creditAmount > 0 && (customer || employee) && <div className="mt-2 flex justify-between text-sm"><span>الرصيد المتوقع بعد الفاتورة</span><strong>{money(Number(customer?.receivable_balance ?? employee?.receivable_balance ?? 0) + creditAmount)}</strong></div>}
                <div className="mt-3 flex justify-between border-t pt-3"><span className="font-black">المطلوب تحصيله فعليًا</span><strong className="text-2xl text-[#005931]">{money(amountToCollect)}</strong></div>
                <div className="mt-2 flex flex-wrap gap-2">{customer && <Badge className="bg-[#005931]">عميل · +{expectedCustomerPoints} نقطة متوقعة</Badge>}{employee && <Badge className="bg-[#005931]">موظف · +{expectedEmployeePoints} نقطة متوقعة</Badge>}{creditAmount > 0 && <Badge className="bg-amber-700">آجل {money(creditAmount)}</Badge>}{mixedMode && <Badge variant="outline">{splitRows.length} وسائل</Badge>}</div>
              </div>

              <Button className={`h-14 w-full text-base ${creditAmount > 0 ? "bg-amber-700 hover:bg-amber-800" : "bg-[#005931] hover:bg-[#004a29]"}`} disabled={!paymentValid || processing || (baseDue > 0 && !visibleMethods.length)} onClick={() => void completeSale()}>
                {processing ? <RefreshCw className="ml-2 h-5 w-5 animate-spin" /> : creditAmount > 0 ? <CreditCard className="ml-2 h-5 w-5" /> : <Check className="ml-2 h-5 w-5" />}
                {processing ? "جاري تسجيل البيع..." : creditAmount > 0 ? `تأكيد · تحصيل ${money(amountToCollect)} · آجل ${money(creditAmount)}` : `تأكيد البيع · ${money(amountToCollect)}`}
              </Button>
              <div className="text-center text-[11px] text-muted-foreground">{creditAmount > 0 ? "الجزء الآجل يضاف للمديونية فقط، والوردية تستلم الجزء المدفوع فعليًا." : employee ? <><Coins className="ml-1 inline h-3 w-3" />نقاط الموظف على الجزء المدفوع فعليًا.</> : "رسوم كل وسيلة تُحسب على الجزء الخاص بها فقط."}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <BarcodeScanner isOpen={cameraOpen} onClose={() => setCameraOpen(false)} onScan={barcode => { setCameraOpen(false); void handleBarcode(barcode); }} />
      <InvoiceDialog isOpen={invoiceOpen} onClose={() => setInvoiceOpen(false)} sale={sale} />
      {currentBranchId && <POSReceivablePaymentDialog open={receivableOpen} onOpenChange={setReceivableOpen} branchId={currentBranchId} party={receivableParty} methods={normalMethods} onCollected={handleReceivableCollected} />}
    </>
  );
}
