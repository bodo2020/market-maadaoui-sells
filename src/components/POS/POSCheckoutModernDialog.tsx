import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Coins,
  CreditCard,
  Gift,
  PackageCheck,
  Plus,
  RefreshCw,
  ScanLine,
  SplitSquareHorizontal,
  Ticket,
  Trash2,
  UserRound,
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
import PaymentMethodBrand from "@/components/payments/PaymentMethodBrand";
import type { CartItem, Sale } from "@/types";
import { siteConfig } from "@/config/site";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { useToast } from "@/hooks/use-toast";
import { preflightPosCart } from "@/services/supabase/posPreflightService";
import { clearConfirmedModernPosSale, submitModernPosSale, type ModernPOSPaymentSplit } from "@/services/supabase/posCheckoutV2Service";
import { calculatePOSPaymentFee, fetchPOSPaymentMethods, type POSPaymentMethod } from "@/services/supabase/posPaymentMethodService";
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

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} ${siteConfig.currency}`;
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
  const scanTargetRef = useRef<ScanTarget>(null);

  const visibleMethods = useMemo(
    () => methods
      .filter(row => row.active && (row.code !== "employee_credit" || Boolean(employee)))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ar")),
    [methods, employee],
  );
  const mixedEligibleMethods = useMemo(() => visibleMethods.filter(row => row.code !== "employee_credit"), [visibleMethods]);
  const selectedMethod = useMemo(() => visibleMethods.find(row => row.id === methodId) || null, [visibleMethods, methodId]);
  const voucherAmount = voucher ? Math.max(0, Math.min(Number(voucher.remaining_value_egp || 0), Number(total || 0))) : 0;
  const baseDue = Math.max(0, Number((Number(total || 0) - voucherAmount).toFixed(2)));
  const isEmployeeCredit = !mixedMode && selectedMethod?.code === "employee_credit";
  const paymentPreview = useMemo(() => calculatePOSPaymentFee(selectedMethod, baseDue), [selectedMethod, baseDue]);

  const splitRows = useMemo(() => splitDrafts.map(draft => {
    const method = mixedEligibleMethods.find(row => row.id === draft.methodId) || null;
    const baseAmount = Math.max(0, Number(draft.amount || 0));
    const preview = calculatePOSPaymentFee(method, baseAmount);
    return { ...draft, method, baseAmount, preview };
  }), [splitDrafts, mixedEligibleMethods]);

  const splitBaseTotal = useMemo(() => Number(splitRows.reduce((sum, row) => sum + row.baseAmount, 0).toFixed(2)), [splitRows]);
  const splitRemaining = Number((baseDue - splitBaseTotal).toFixed(2));
  const splitCustomerFee = useMemo(() => Number(splitRows.reduce((sum, row) => sum + row.preview.customerFee, 0).toFixed(2)), [splitRows]);
  const splitMerchantFee = useMemo(() => Number(splitRows.reduce((sum, row) => sum + row.preview.merchantFee, 0).toFixed(2)), [splitRows]);
  const splitAmountToCollect = useMemo(() => Number(splitRows.reduce((sum, row) => sum + row.preview.amountCharged, 0).toFixed(2)), [splitRows]);
  const splitCashDue = useMemo(() => Number(splitRows.filter(row => row.method?.method_type === "cash").reduce((sum, row) => sum + row.preview.amountCharged, 0).toFixed(2)), [splitRows]);

  const amountToCollect = isEmployeeCredit ? 0 : mixedMode ? splitAmountToCollect : paymentPreview.amountCharged;
  const isCash = !mixedMode && selectedMethod?.method_type === "cash";
  const activeCashDue = mixedMode ? splitCashDue : (isCash ? amountToCollect : 0);
  const change = activeCashDue > 0 ? Math.max(0, Number(cashTendered || 0) - activeCashDue) : 0;
  const expectedCustomerPoints = customer ? Math.floor(baseDue) : 0;
  const expectedEmployeePoints = employee && !isEmployeeCredit ? Math.floor(baseDue * 5) : 0;

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
      const normalActive = rows.filter(row => row.active && row.code !== "employee_credit");
      setMethods(rows);
      const cash = normalActive.find(row => row.method_type === "cash");
      const fallback = cash || normalActive[0];
      setMethodId(current => normalActive.some(row => row.id === current) ? current : fallback?.id || "");
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
    if (!employee && selectedMethod?.code === "employee_credit") {
      const cash = methods.find(row => row.active && row.code !== "employee_credit" && row.method_type === "cash");
      const fallback = cash || methods.find(row => row.active && row.code !== "employee_credit");
      setMethodId(fallback?.id || "");
    }
  }, [employee, selectedMethod?.code, methods]);

  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent("pos:modern-checkout-state", { detail: { open: true } }));
    return () => { window.dispatchEvent(new CustomEvent("pos:modern-checkout-state", { detail: { open: false } })); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!mixedMode && selectedMethod?.method_type === "cash") setCashTendered(paymentPreview.amountCharged.toFixed(2));
    if (isEmployeeCredit) setCashTendered("");
  }, [open, mixedMode, selectedMethod?.id, selectedMethod?.method_type, paymentPreview.amountCharged, isEmployeeCredit]);

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
          toast({ title: `تم ربط ${linked.name || "الزبون"}`, description: `${Number(linked.points_balance || 0).toLocaleString("ar-EG")} نقطة متاحة` });
        } else if (isEmployeePurchaseBarcode(barcode)) {
          const linked = await lookupEmployeePurchaseCard(barcode, currentBranchId);
          if (!linked) throw new Error("باركود الموظف غير معروف أو الحساب غير نشط.");
          storeCustomer(null);
          setEmployee(linked);
          toast({
            title: `تم ربط الموظف ${linked.name}`,
            description: `آجل متاح ${money(linked.credit_available)} · ${Number(linked.points_balance || 0).toLocaleString("ar-EG")} نقطة`,
          });
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
      if (event.key === "Escape") {
        scanTargetRef.current = null;
        setScanTarget(null);
        return;
      }
      if (event.key === "Enter") {
        const code = buffer.trim();
        buffer = "";
        if (code) {
          event.preventDefault();
          event.stopImmediatePropagation();
          void handleBarcode(code);
        }
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
    return () => {
      delete document.documentElement.dataset.posCheckoutScanTarget;
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, scanTarget, handleBarcode]);

  const enableMixedMode = () => {
    if (mixedEligibleMethods.length < 2 || baseDue <= 0 || isEmployeeCredit) return;
    const firstId = selectedMethod && selectedMethod.code !== "employee_credit" ? selectedMethod.id : mixedEligibleMethods[0].id;
    const second = mixedEligibleMethods.find(row => row.id !== firstId);
    if (!second) return;
    setSplitDrafts(distributeEvenly([firstId, second.id], baseDue));
    setCashTendered("");
    setMixedMode(true);
    setError(null);
  };

  const disableMixedMode = () => {
    setMixedMode(false);
    setSplitDrafts([]);
    setCashTendered(selectedMethod?.method_type === "cash" ? paymentPreview.amountCharged.toFixed(2) : "");
    setError(null);
  };

  const addSplitMethod = (methodIdToAdd: string) => {
    if (splitDrafts.some(row => row.methodId === methodIdToAdd)) return;
    const ids = [...splitDrafts.map(row => row.methodId), methodIdToAdd];
    setSplitDrafts(distributeEvenly(ids, baseDue));
  };

  const removeSplitMethod = (methodIdToRemove: string) => {
    const ids = splitDrafts.filter(row => row.methodId !== methodIdToRemove).map(row => row.methodId);
    if (ids.length < 2) {
      disableMixedMode();
      if (ids[0]) setMethodId(ids[0]);
      return;
    }
    setSplitDrafts(distributeEvenly(ids, baseDue));
  };

  const updateSplit = (methodIdToUpdate: string, patch: Partial<SplitDraft>) => {
    setSplitDrafts(current => current.map(row => row.methodId === methodIdToUpdate ? { ...row, ...patch } : row));
  };

  const fillSplitRemainder = (methodIdToUpdate: string) => {
    const other = splitDrafts.filter(row => row.methodId !== methodIdToUpdate).reduce((sum, row) => sum + Math.max(0, Number(row.amount || 0)), 0);
    updateSplit(methodIdToUpdate, { amount: Math.max(0, Number((baseDue - other).toFixed(2))).toFixed(2) });
  };

  const mixedPaymentValid = useMemo(() => {
    if (baseDue <= 0) return true;
    if (!mixedMode || splitRows.length < 2 || Math.abs(splitRemaining) > 0.009) return false;
    if (splitRows.some(row => !row.method || row.baseAmount <= 0 || (row.method.require_reference && !row.reference.trim()))) return false;
    if (splitCashDue > 0 && Number(cashTendered || 0) < splitCashDue) return false;
    return true;
  }, [baseDue, mixedMode, splitRows, splitRemaining, splitCashDue, cashTendered]);

  const singlePaymentValid = useMemo(() => {
    if (baseDue <= 0) return true;
    if (!selectedMethod) return false;
    if (isEmployeeCredit) return Boolean(employee?.credit_active) && baseDue <= Number(employee?.credit_available || 0) + 0.009;
    if (selectedMethod.require_reference && !paymentReference.trim()) return false;
    if (selectedMethod.method_type === "cash") return Number(cashTendered || 0) >= paymentPreview.amountCharged;
    return true;
  }, [baseDue, selectedMethod, isEmployeeCredit, employee, paymentReference, cashTendered, paymentPreview.amountCharged]);

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
        date: new Date().toISOString(),
        items: checked.items,
        subtotal: checked.subtotal,
        discount: checked.discount,
        total: checked.total,
        profit,
        payment_method: isEmployeeCredit ? "mixed" : mixedMode ? "mixed" : selectedMethod?.method_type === "cash" ? "cash" : "card",
        cash_amount: 0,
        card_amount: 0,
        customer_name: customer?.name || undefined,
        customer_phone: customer?.phone || undefined,
        invoice_number: "PENDING",
        cashier_name: user.name,
        branch_id: currentBranchId,
      } as Omit<Sale, "id" | "created_at" | "updated_at">;

      const splits: ModernPOSPaymentSplit[] | undefined = mixedMode
        ? splitRows.map(row => ({ paymentMethodId: row.methodId, baseAmount: row.baseAmount, reference: row.reference.trim() || null }))
        : undefined;

      const selection = mixedMode
        ? { splits, employeeId: employee?.employee_id || null }
        : {
            paymentMethodId: selectedMethod?.id,
            paymentReference: paymentReference.trim() || null,
            employeeId: employee?.employee_id || null,
          };

      const confirmed = await submitModernPosSale(payload, checkoutId, selection);
      setSale(confirmed as Sale);
      setCustomer(null);
      setEmployee(null);
      setVoucher(null);
      onSaleCommitted?.(confirmed as Sale);
      const employeeCredit = Number((confirmed as any).employee_credit_amount || 0);
      toast({
        title: employeeCredit > 0 ? "تم تسجيل البيع الآجل" : "تم البيع بنجاح",
        description: employeeCredit > 0
          ? `فاتورة ${(confirmed as Sale).invoice_number} · آجل ${money(employeeCredit)}`
          : `فاتورة ${(confirmed as Sale).invoice_number}`,
      });
    } catch (err: any) {
      setError(err?.message || "تعذر إتمام البيع.");
      toast({ title: "تعذر إتمام البيع", description: err?.message || "راجع البيانات وحاول مرة أخرى.", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const startNewSale = () => {
    if (user?.id && currentBranchId) clearConfirmedModernPosSale(user.id, currentBranchId, checkoutId);
    setSale(null);
    setCustomer(null);
    setEmployee(null);
    setVoucher(null);
    setPaymentReference("");
    setMixedMode(false);
    setSplitDrafts([]);
    onStartNewSale();
  };

  const saleEmployeeCredit = Number((sale as any)?.employee_credit_amount || 0);
  const saleEmployeePoints = Number((sale as any)?.employee_points_earned || 0);

  return (
    <>
      <Dialog open={open} onOpenChange={next => { if (!processing) onOpenChange(next); }}>
        <DialogContent dir="rtl" className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{sale ? "تمت عملية البيع" : "إتمام البيع"}</DialogTitle>
          </DialogHeader>

          {sale ? (
            <div className="space-y-5 py-2">
              <div className="rounded-3xl bg-emerald-50 p-6 text-center text-emerald-950">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white"><Check className="h-7 w-7 text-[#005931]" /></div>
                <div className="text-xl font-black">{saleEmployeeCredit > 0 ? "تم تسجيل الفاتورة على حساب الموظف" : "تم تسجيل الفاتورة"}</div>
                <div className="mt-1 text-sm">{sale.invoice_number}</div>
                <div className="mt-3 text-2xl font-black">{money(saleEmployeeCredit > 0 ? saleEmployeeCredit : Number((sale as any).amount_charged ?? sale.amount_due ?? sale.total))}</div>
                <div className="mt-1 text-xs text-emerald-800">{saleEmployeeCredit > 0 ? "آجل موظف · المحصل فعليًا 0.00" : (sale as any).payment_method_name || (mixedMode ? "دفع مختلط" : selectedMethod?.name) || "وسيلة الدفع"}</div>
                {Array.isArray((sale as any).payment_breakdown) && (sale as any).payment_breakdown.length > 1 && (
                  <div className="mt-3 flex flex-wrap justify-center gap-2">{(sale as any).payment_breakdown.map((part: any, index: number) => <Badge key={`${part.payment_method_id}-${index}`} variant="outline" className="bg-white">{part.name} · {money(Number(part.charged_amount || 0))}</Badge>)}</div>
                )}
                {Number(sale.loyalty_points_earned || 0) > 0 && <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-sm font-bold">+ {Number(sale.loyalty_points_earned || 0).toLocaleString("ar-EG")} نقطة للعميل</div>}
                {saleEmployeePoints > 0 && <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-sm font-bold">+ {saleEmployeePoints.toLocaleString("ar-EG")} نقطة للموظف</div>}
              </div>
              <Button variant="outline" className="h-12 w-full" onClick={() => setInvoiceOpen(true)}><PackageCheck className="ml-2 h-4 w-4" />عرض وطباعة الفاتورة</Button>
              <Button className="h-12 w-full bg-[#005931]" onClick={startNewSale}>عملية بيع جديدة</Button>
            </div>
          ) : (
            <div className="space-y-5">
              {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

              <section className="rounded-3xl border p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div><div className="text-xs font-bold text-[#005931]">1 · هوية المشتري</div><div className="font-black">عميل، موظف، أو بيع مباشر</div></div>
                  <UserRound className="h-5 w-5 text-[#005931]" />
                </div>

                {employee ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-amber-800"><UserRound className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="font-black">{employee.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{employee.employee_code || employee.membership_number}</div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setEmployee(null)} aria-label="إزالة الموظف"><X className="h-4 w-4" /></Button>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-white p-2"><div className="text-[10px] text-muted-foreground">النقاط</div><div className="font-black text-[#005931]">{Number(employee.points_balance || 0).toLocaleString("ar-EG")}</div></div>
                      <div className="rounded-xl bg-white p-2"><div className="text-[10px] text-muted-foreground">الآجل المتاح</div><div className="font-black text-amber-900">{money(employee.credit_available)}</div></div>
                      <div className="rounded-xl bg-white p-2"><div className="text-[10px] text-muted-foreground">المستحق</div><div className="font-black">{money(employee.receivable_balance)}</div></div>
                    </div>
                    <div className="mt-3 text-xs text-amber-900">الدفع العادي يكسب <strong>5 نقاط لكل جنيه</strong>. البيع الآجل لا يكسب نقاط.</div>
                  </div>
                ) : customer ? (
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1"><div className="font-black">{customer.name || "عميل المعداوي"}</div><div className="mt-1 text-xs text-muted-foreground">{customer.membership_number || customer.phone || "عميل مرتبط"}</div></div>
                      <Button variant="ghost" size="icon" onClick={() => storeCustomer(null)} aria-label="إزالة العميل"><X className="h-4 w-4" /></Button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-center"><div className="rounded-xl bg-white p-2"><div className="text-[10px] text-muted-foreground">الرصيد</div><div className="font-black text-[#005931]">{Number(customer.points_balance || 0).toLocaleString("ar-EG")} نقطة</div></div><div className="rounded-xl bg-white p-2"><div className="text-[10px] text-muted-foreground">متوقع من الفاتورة</div><div className="font-black text-[#005931]">+ {expectedCustomerPoints.toLocaleString("ar-EG")} نقطة</div></div></div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">ممكن تكمل بدون هوية. اربط عميل للولاء أو موظف لتفعيل نقاط الموظفين وخيار الآجل.</div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant={scanTarget === "buyer" ? "default" : "outline"} className={scanTarget === "buyer" ? "bg-[#005931]" : ""} onClick={() => beginScan("buyer")}><ScanLine className="ml-2 h-4 w-4" />زبون / موظف</Button>
                      <Button variant="outline" onClick={() => beginScan("buyer", true)}>كاميرا الهوية</Button>
                    </div>
                    {scanTarget === "buyer" && <div className="text-center text-xs font-semibold text-[#005931]">امسح الباركود مباشرة؛ الكاشير يتعرف تلقائيًا على الزبون 299… أو الموظف 297…</div>}
                  </div>
                )}
              </section>

              <section className={`rounded-3xl border p-4 ${!customer ? "opacity-55" : ""}`}>
                <div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-xs font-bold text-[#005931]">2 · كوبون الخصم</div><div className="font-black">اسكان منفصل بعد العميل</div></div><Ticket className="h-5 w-5 text-[#005931]" /></div>
                {employee ? <div className="text-sm text-muted-foreground">بطاقة موظف مرتبطة؛ كوبونات العملاء غير متاحة على نفس الفاتورة.</div> : !customer ? <div className="text-sm text-muted-foreground">اربط العميل أولًا لتفعيل كوبون الخصم.</div> : voucher ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4"><Ticket className="h-5 w-5 text-[#005931]" /><div className="min-w-0 flex-1"><div className="font-black">{voucher.voucher_code}</div><div className="text-xs text-emerald-800">خصم حتى {money(voucherAmount)} · الرصيد {money(Number(voucher.remaining_value_egp || 0))}</div></div><Button variant="ghost" size="icon" onClick={() => storeVoucher(null)}><X className="h-4 w-4" /></Button></div>
                ) : (
                  <div className="space-y-3"><div className="grid grid-cols-2 gap-2"><Button variant={scanTarget === "voucher" ? "default" : "outline"} className={scanTarget === "voucher" ? "bg-[#005931]" : ""} onClick={() => beginScan("voucher")}><ScanLine className="ml-2 h-4 w-4" />{scanTarget === "voucher" ? "في انتظار الكوبون..." : "اسكان كوبون الخصم"}</Button><Button variant="outline" onClick={() => beginScan("voucher", true)}>كاميرا</Button></div>{scanTarget === "voucher" && <div className="text-center text-xs font-semibold text-[#005931]">القارئ مخصص الآن لكوبون الخصم 298… فقط</div>}</div>
                )}
              </section>

              <section className="rounded-3xl border p-4">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><div className="text-xs font-bold text-[#005931]">3 · وسيلة الدفع</div><div className="font-black">{mixedMode ? "قسّم الفاتورة على أكثر من وسيلة" : isEmployeeCredit ? "تسجيل الفاتورة آجل على الموظف" : "اختر طريقة التحصيل"}</div></div>
                  {baseDue > 0 && mixedEligibleMethods.length >= 2 && !isEmployeeCredit && (
                    <div className="flex rounded-xl border bg-slate-50 p-1">
                      <Button type="button" size="sm" variant={!mixedMode ? "default" : "ghost"} className={!mixedMode ? "bg-[#005931]" : ""} onClick={disableMixedMode}>وسيلة واحدة</Button>
                      <Button type="button" size="sm" variant={mixedMode ? "default" : "ghost"} className={mixedMode ? "bg-[#005931]" : ""} onClick={enableMixedMode}><SplitSquareHorizontal className="ml-1.5 h-4 w-4" />دفع مختلط</Button>
                    </div>
                  )}
                </div>

                {loadingMethods ? <div className="flex justify-center py-5"><RefreshCw className="h-5 w-5 animate-spin text-[#005931]" /></div> : visibleMethods.length === 0 ? <Alert variant="destructive"><AlertDescription>لا توجد وسيلة دفع مفعلة للفرع. فعّل واحدة من صفحة وسائل الدفع.</AlertDescription></Alert> : mixedMode ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">{mixedEligibleMethods.filter(method => !splitDrafts.some(row => row.methodId === method.id)).map(method => <Button key={method.id} type="button" variant="outline" size="sm" onClick={() => addSplitMethod(method.id)}><Plus className="ml-1 h-3.5 w-3.5" />{method.name}</Button>)}</div>
                    <div className="space-y-3">{splitRows.map(row => row.method && (
                      <div key={row.methodId} className="rounded-2xl border bg-white p-3 sm:p-4">
                        <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><PaymentMethodBrand method={row.method} compact className="border-0 p-0 shadow-none" /><div className="mt-1 text-sm font-black">{row.method.name}</div></div><Button type="button" variant="ghost" size="icon" className="text-red-600" onClick={() => removeSplitMethod(row.methodId)}><Trash2 className="h-4 w-4" /></Button></div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]"><div><Label>جزء الفاتورة على الوسيلة</Label><Input inputMode="decimal" className="mt-1 h-12 text-lg font-black" value={row.amount} onChange={e => updateSplit(row.methodId, { amount: e.target.value })} /></div><div className="flex items-end"><Button type="button" variant="outline" className="h-12" onClick={() => fillSplitRemainder(row.methodId)}>ضع المتبقي</Button></div></div>
                        {row.method.require_reference && <div className="mt-3"><Label>مرجع {row.method.name}</Label><Input className="mt-1" value={row.reference} onChange={e => updateSplit(row.methodId, { reference: e.target.value })} placeholder="رقم العملية / الإيصال" dir="ltr" /></div>}
                        {row.preview.fee > 0 && <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-950"><span>عمولة على الجزء {money(row.preview.fee)} · {row.method.fee_bearer === "customer" ? "على العميل" : "على المنشأة"}</span><strong>تحصيل {money(row.preview.amountCharged)}</strong></div>}
                      </div>
                    ))}</div>
                    <div className={`rounded-2xl p-4 ${Math.abs(splitRemaining) <= 0.009 ? "bg-emerald-50 text-emerald-950" : splitRemaining > 0 ? "bg-amber-50 text-amber-950" : "bg-red-50 text-red-900"}`}><div className="grid grid-cols-3 gap-3 text-center"><div><div className="text-[10px] opacity-70">أصل المطلوب</div><div className="font-black">{money(baseDue)}</div></div><div><div className="text-[10px] opacity-70">تم توزيعه</div><div className="font-black">{money(splitBaseTotal)}</div></div><div><div className="text-[10px] opacity-70">المتبقي</div><div className="font-black">{money(splitRemaining)}</div></div></div></div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{visibleMethods.map(method => {
                      const active = method.id === methodId;
                      const credit = method.code === "employee_credit";
                      return <button key={method.id} type="button" onClick={() => { setMethodId(method.id); setPaymentReference(""); setMixedMode(false); setSplitDrafts([]); }} className={`flex min-h-[104px] flex-col items-center justify-center rounded-2xl border p-3 text-center transition ${active ? credit ? "border-amber-500 bg-amber-50 text-amber-900 ring-1 ring-amber-400/30" : "border-[#005931] bg-emerald-50 text-[#005931] ring-1 ring-[#005931]/20" : "bg-white hover:bg-slate-50"}`}>
                        {credit ? <CreditCard className="h-6 w-6" /> : <PaymentMethodBrand method={method} compact className="border-0 shadow-none" />}
                        <div className="mt-2 text-sm font-black">{method.name}</div>
                        {credit ? <div className="mt-1 text-[10px]">لا يدخل تحصيل الوردية</div> : method.fee_type !== "none" && method.fee_value > 0 ? <div className="mt-1 text-[10px]">رسوم {method.fee_type === "percent" ? `${method.fee_value}%` : money(method.fee_value)}</div> : null}
                      </button>;
                    })}</div>
                    {isEmployeeCredit && employee && <div className={`mt-3 rounded-2xl border p-4 ${baseDue <= employee.credit_available + 0.009 ? "border-amber-200 bg-amber-50 text-amber-950" : "border-red-200 bg-red-50 text-red-900"}`}><div className="flex items-center justify-between gap-3"><span>سيُضاف على حساب {employee.name}</span><strong>{money(baseDue)}</strong></div><div className="mt-2 flex items-center justify-between text-xs"><span>المتاح قبل العملية</span><strong>{money(employee.credit_available)}</strong></div><div className="mt-2 text-xs font-bold">المحصل فعليًا: 0.00 · النقاط: 0</div>{baseDue > employee.credit_available + 0.009 && <div className="mt-2 text-xs font-black">المبلغ أكبر من حد الآجل المتاح.</div>}</div>}
                    {selectedMethod?.require_reference && !isEmployeeCredit && <div className="mt-3 space-y-2"><Label>الرقم المرجعي للعملية</Label><Input value={paymentReference} onChange={e => setPaymentReference(e.target.value)} placeholder="رقم العملية / الإيصال" dir="ltr" /></div>}
                    {selectedMethod && paymentPreview.fee > 0 && !isEmployeeCredit && <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-950"><div className="flex justify-between"><span>رسوم {selectedMethod.name}</span><strong>{money(paymentPreview.fee)}</strong></div><div className="mt-1 text-xs">{selectedMethod.fee_bearer === "customer" ? "تُضاف على المبلغ المطلوب من العميل." : "تتحملها المنشأة وتُخصم من صافي الربح."}</div></div>}
                  </>
                )}

                {activeCashDue > 0 && <div className="mt-4 space-y-2 rounded-2xl border bg-slate-50 p-3"><Label>{mixedMode ? `المبلغ النقدي المستلم · المطلوب كاش ${money(activeCashDue)}` : "المبلغ المستلم"}</Label><Input inputMode="decimal" value={cashTendered} onChange={e => setCashTendered(e.target.value)} className="h-12 bg-white text-xl font-black" /><div className="rounded-xl bg-emerald-50 p-3 text-center"><div className="text-xs text-emerald-800">الباقي للعميل</div><div className="text-2xl font-black text-[#005931]">{money(change)}</div></div></div>}
              </section>

              <div className="rounded-3xl bg-slate-50 p-4">
                <div className="flex items-center justify-between text-sm"><span>إجمالي المنتجات</span><strong>{money(total)}</strong></div>
                {voucherAmount > 0 && <div className="mt-2 flex items-center justify-between text-sm text-emerald-700"><span>كوبون خصم</span><strong>- {money(voucherAmount)}</strong></div>}
                {!isEmployeeCredit && (mixedMode ? splitCustomerFee : paymentPreview.customerFee) > 0 && <div className="mt-2 flex items-center justify-between text-sm text-amber-700"><span>رسوم وسائل الدفع على العميل</span><strong>+ {money(mixedMode ? splitCustomerFee : paymentPreview.customerFee)}</strong></div>}
                {mixedMode && splitMerchantFee > 0 && <div className="mt-2 text-[11px] text-muted-foreground">عمولات تتحملها المنشأة: {money(splitMerchantFee)} — لا تُضاف على العميل.</div>}
                <div className="mt-3 flex items-center justify-between border-t pt-3"><span className="font-black">{isEmployeeCredit ? "المسجل آجل" : "المطلوب تحصيله"}</span><strong className={`text-2xl ${isEmployeeCredit ? "text-amber-800" : "text-[#005931]"}`}>{money(isEmployeeCredit ? baseDue : amountToCollect)}</strong></div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {customer && <Badge className="bg-[#005931]">عميل مرتبط · +{expectedCustomerPoints} نقطة متوقعة</Badge>}
                  {employee && <Badge className={isEmployeeCredit ? "bg-amber-700" : "bg-[#005931]"}>{isEmployeeCredit ? "موظف · آجل · 0 نقطة" : `موظف · +${expectedEmployeePoints} نقطة متوقعة`}</Badge>}
                  {!customer && !employee && <Badge variant="secondary">بدون هوية · 0 نقطة</Badge>}
                  {voucher && <Badge variant="outline">كوبون خصم مطبق</Badge>}
                  {mixedMode && <Badge variant="outline">{splitRows.length} وسائل دفع</Badge>}
                </div>
              </div>

              <Button className={`h-14 w-full text-base ${isEmployeeCredit ? "bg-amber-700 hover:bg-amber-800" : "bg-[#005931] hover:bg-[#004a29]"}`} disabled={!paymentValid || processing || (baseDue > 0 && !visibleMethods.length)} onClick={() => void completeSale()}>{processing ? <RefreshCw className="ml-2 h-5 w-5 animate-spin" /> : isEmployeeCredit ? <CreditCard className="ml-2 h-5 w-5" /> : <Check className="ml-2 h-5 w-5" />}{processing ? "جاري تسجيل البيع..." : isEmployeeCredit ? `تسجيل آجل · ${money(baseDue)}` : `تأكيد البيع · ${money(amountToCollect)}`}</Button>
              <div className="text-center text-[11px] text-muted-foreground">{isEmployeeCredit ? "الآجل لا يدخل في نقدية أو محافظ الوردية، ويُسجل مباشرة في حساب الموظف." : employee ? <><Coins className="ml-1 inline h-3 w-3" />الموظف يحصل على 5 نقاط لكل جنيه مدفوع فعليًا.</> : "في الدفع المختلط يتم توزيع أصل الفاتورة أولًا، ثم تحسب عمولة كل وسيلة على الجزء الخاص بها فقط."}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <BarcodeScanner isOpen={cameraOpen} onClose={() => setCameraOpen(false)} onScan={barcode => { setCameraOpen(false); void handleBarcode(barcode); }} />
      <InvoiceDialog isOpen={invoiceOpen} onClose={() => setInvoiceOpen(false)} sale={sale} />
    </>
  );
}
