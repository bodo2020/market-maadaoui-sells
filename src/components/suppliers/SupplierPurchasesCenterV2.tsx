import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeDollarSign,
  Banknote,
  CalendarClock,
  ChevronLeft,
  CircleAlert,
  FileText,
  HandCoins,
  History,
  PackagePlus,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  UserRoundPlus,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchProducts } from "@/services/supabase/productService";
import {
  createPurchaseV2,
  createSupplierReturnV2,
  fetchSupplierLedgerV1,
  fetchSupplierPurchaseCenterV2,
  paySupplierV2,
  saveSupplierRepresentativeV2,
  saveSupplierV2,
  voidPurchaseV2,
  voidSupplierPaymentV2,
  type PurchaseDraftItem,
  type SupplierCenterSupplier,
  type SupplierPaymentRow,
  type SupplierPaymentSource,
  type SupplierPurchaseCenterV2,
  type SupplierPurchaseRow,
  type SupplierRepresentative,
  type SupplierReturnRow,
} from "@/services/supabase/supplierPurchasesV2Service";

type TabKey = "overview" | "suppliers" | "purchases" | "payments" | "returns";
type ProductRow = {
  id: string;
  name: string;
  barcode?: string | null;
  purchase_price?: number | null;
  price?: number | null;
  quantity?: number | null;
  track_expiry?: boolean | null;
  unit_of_measure?: string | null;
};

type DraftLine = PurchaseDraftItem & {
  product_name: string;
  barcode?: string | null;
  track_expiry?: boolean | null;
  unit_of_measure?: string | null;
};

type SourceOption = SupplierPaymentSource & {
  key: string;
  kind: "cash_account" | "payment_account";
};

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const dateText = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("ar-EG") : "—";

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + Math.max(0, Number(days || 0)));
  return d.toISOString().slice(0, 10);
}

function calculateFee(source: SourceOption | undefined, amount: number) {
  if (!source || source.kind !== "payment_account" || amount <= 0) return 0;
  if (source.fee_type === "percent") {
    return Math.round((amount * Number(source.fee_value || 0)) * 100) / 10000;
  }
  if (source.fee_type === "fixed") return Number(source.fee_value || 0);
  return 0;
}

function requiredDebit(source: SourceOption | undefined, amount: number) {
  return Math.round((amount + calculateFee(source, amount)) * 100) / 100;
}

function actionError(error: unknown) {
  toast.error(error instanceof Error ? error.message : "حدث خطأ غير متوقع");
}

export default function SupplierPurchasesCenterV2({ initialTab = "overview" }: { initialTab?: TabKey }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const branchId = typeof window !== "undefined" ? localStorage.getItem("currentBranchId") || "" : "";

  const centerQuery = useQuery({
    queryKey: ["supplierPurchaseCenterV2", branchId],
    queryFn: () => fetchSupplierPurchaseCenterV2(branchId),
    enabled: Boolean(branchId),
    refetchInterval: 60_000,
  });

  const productsQuery = useQuery({
    queryKey: ["products", branchId, "purchases-v2"],
    queryFn: () => fetchProducts() as Promise<ProductRow[]>,
    enabled: Boolean(branchId),
    staleTime: 60_000,
  });

  const center = centerQuery.data;
  const permissions = center?.permissions;
  const canManage = Boolean(permissions?.can_manage_purchases);
  const canFinance = Boolean(permissions?.can_manage_finance);
  const suppliers = center?.suppliers || [];
  const purchases = center?.purchases || [];
  const representatives = center?.representatives || [];
  const products = productsQuery.data || [];

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["supplierPurchaseCenterV2", branchId] });
    await queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const execute = async (fn: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      await refresh();
    } catch (error) {
      actionError(error);
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((supplier) =>
      [supplier.name, supplier.code, supplier.phone, supplier.contact_person, supplier.primary_representative?.name]
        .some((value) => String(value || "").toLowerCase().includes(q)),
    );
  }, [search, suppliers]);

  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter((purchase) =>
      [purchase.invoice_number, purchase.supplier_name, purchase.description]
        .some((value) => String(value || "").toLowerCase().includes(q)),
    );
  }, [search, purchases]);

  const [supplierDialog, setSupplierDialog] = useState(false);
  const [supplierForm, setSupplierForm] = useState<Partial<SupplierCenterSupplier> & { name: string }>({
    name: "",
    active: true,
    payment_terms_days: 0,
  });
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierCenterSupplier | null>(null);
  const activeSelectedSupplier = selectedSupplier
    ? suppliers.find((supplier) => supplier.id === selectedSupplier.id) || selectedSupplier
    : null;
  const [supplierSheet, setSupplierSheet] = useState(false);

  const openNewSupplier = () => {
    if (!canManage) return toast.error("ليس لديك صلاحية إدارة الموردين والمشتريات");
    setSupplierForm({ name: "", active: true, payment_terms_days: 0 });
    setSupplierDialog(true);
  };

  const openEditSupplier = (supplier: SupplierCenterSupplier) => {
    if (!canManage) return toast.error("ليس لديك صلاحية تعديل المورد");
    setSupplierForm({ ...supplier });
    setSupplierDialog(true);
  };

  const saveSupplier = async () => {
    if (!canManage) return toast.error("ليس لديك صلاحية إدارة الموردين والمشتريات");
    if (!supplierForm.name.trim()) return toast.error("اسم المورد مطلوب");
    if (Number(supplierForm.payment_terms_days || 0) < 0) return toast.error("أجل السداد لا يمكن أن يكون سالباً");
    if (supplierForm.credit_limit != null && Number(supplierForm.credit_limit) < 0) return toast.error("حد الائتمان لا يمكن أن يكون سالباً");
    try {
      await execute(
        () => saveSupplierV2(branchId, supplierForm as SupplierCenterSupplier & { name: string }),
        supplierForm.id ? "تم تحديث المورد" : "تم إضافة المورد",
      );
      setSupplierDialog(false);
    } catch {}
  };

  const [repDialog, setRepDialog] = useState(false);
  const [repSupplier, setRepSupplier] = useState<SupplierCenterSupplier | null>(null);
  const [repForm, setRepForm] = useState<Partial<SupplierRepresentative> & { name: string }>({
    name: "",
    active: true,
    can_receive_payments: false,
    is_primary: false,
  });

  const openRepresentative = (supplier: SupplierCenterSupplier, rep?: SupplierRepresentative) => {
    if (!canManage) return toast.error("ليس لديك صلاحية إدارة مندوبي الموردين");
    setRepSupplier(supplier);
    setRepForm(rep ? { ...rep } : { name: "", active: true, can_receive_payments: false, is_primary: false });
    setRepDialog(true);
  };

  const saveRepresentative = async () => {
    if (!canManage) return toast.error("ليس لديك صلاحية إدارة مندوبي الموردين");
    if (!repSupplier || !repForm.name.trim()) return toast.error("اسم المندوب مطلوب");
    if (repForm.payment_limit != null && Number(repForm.payment_limit) < 0) return toast.error("حد استلام الدفعة لا يمكن أن يكون سالباً");
    try {
      await execute(() => saveSupplierRepresentativeV2(branchId, repSupplier.id, repForm), "تم حفظ بيانات المندوب");
      setRepDialog(false);
    } catch {}
  };

  const ledgerQuery = useQuery({
    queryKey: ["supplierLedgerV1", branchId, activeSelectedSupplier?.id],
    queryFn: () => fetchSupplierLedgerV1(branchId, activeSelectedSupplier!.id),
    enabled: supplierSheet && Boolean(activeSelectedSupplier?.id),
  });

  const [purchaseDialog, setPurchaseDialog] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [purchaseSupplierId, setPurchaseSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [purchaseNote, setPurchaseNote] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [initialPayment, setInitialPayment] = useState("0");
  const [initialSource, setInitialSource] = useState("");
  const [initialRepresentative, setInitialRepresentative] = useState("");
  const [initialReference, setInitialReference] = useState("");
  const [updateSalePrices, setUpdateSalePrices] = useState(false);

  const resetPurchase = () => {
    setPurchaseSupplierId("");
    setInvoiceNumber("");
    setInvoiceDate(today);
    setDueDate(today);
    setPurchaseNote("");
    setProductSearch("");
    setDraftLines([]);
    setInitialPayment("0");
    setInitialSource("");
    setInitialRepresentative("");
    setInitialReference("");
    setUpdateSalePrices(false);
  };

  const openPurchase = (supplierId?: string) => {
    if (!canManage) return toast.error("ليس لديك صلاحية إنشاء فواتير شراء");
    resetPurchase();
    if (supplierId) {
      const supplier = suppliers.find((item) => item.id === supplierId);
      setPurchaseSupplierId(supplierId);
      setDueDate(addDays(today, supplier?.payment_terms_days || 0));
    }
    setPurchaseDialog(true);
  };

  const purchaseSupplier = suppliers.find((supplier) => supplier.id === purchaseSupplierId);
  const supplierReps = representatives.filter((rep) => rep.supplier_id === purchaseSupplierId && rep.active);

  const purchaseProductResults = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((product) => product.name.toLowerCase().includes(q) || String(product.barcode || "").includes(q))
      .slice(0, 12);
  }, [productSearch, products]);

  const addProduct = (product: ProductRow) => {
    const existing = draftLines.findIndex((line) => line.product_id === product.id);
    if (existing >= 0) {
      setDraftLines((lines) => lines.map((line, index) =>
        index === existing ? { ...line, quantity: Number(line.quantity) + 1 } : line,
      ));
    } else {
      setDraftLines((lines) => [...lines, {
        product_id: product.id,
        product_name: product.name,
        barcode: product.barcode,
        quantity: 1,
        price: Number(product.purchase_price || 0),
        sale_price: Number(product.price || 0),
        track_expiry: product.track_expiry,
        unit_of_measure: product.unit_of_measure,
      }]);
    }
    setProductSearch("");
  };

  const updateLine = (index: number, patch: Partial<DraftLine>) =>
    setDraftLines((lines) => lines.map((line, current) => current === index ? { ...line, ...patch } : line));
  const removeLine = (index: number) => setDraftLines((lines) => lines.filter((_, current) => current !== index));
  const draftTotal = draftLines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.price || 0), 0);

  const sourceOptions: SourceOption[] = [
    ...(center?.payment_sources.cash_accounts || []).map((source) => ({
      ...source,
      key: `cash_account:${source.id}`,
      kind: "cash_account" as const,
    })),
    ...(center?.payment_sources.payment_accounts || []).map((source) => ({
      ...source,
      key: `payment_account:${source.id}`,
      kind: "payment_account" as const,
    })),
  ];
  const selectedInitialSource = sourceOptions.find((source) => source.key === initialSource);
  const initialPaymentAmount = Number(initialPayment || 0);
  const initialExpectedFee = calculateFee(selectedInitialSource, initialPaymentAmount);
  const initialRequiredDebit = requiredDebit(selectedInitialSource, initialPaymentAmount);
  const initialSelectedRep = supplierReps.find((rep) => rep.id === initialRepresentative);

  const submitPurchase = async () => {
    if (!canManage) return toast.error("ليس لديك صلاحية إنشاء فواتير شراء");
    if (!purchaseSupplierId) return toast.error("اختر المورد");
    if (!purchaseSupplier?.active) return toast.error("المورد موقوف ولا يمكن إنشاء فاتورة جديدة له");
    if (!draftLines.length) return toast.error("أضف صنفاً واحداً على الأقل");
    if (draftLines.some((line) => !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0 || !Number.isFinite(Number(line.price)) || Number(line.price) < 0)) {
      return toast.error("راجع الكمية وسعر الشراء");
    }
    if (draftTotal <= 0) return toast.error("إجمالي الفاتورة يجب أن يكون أكبر من صفر");
    if (draftLines.some((line) => line.track_expiry && !line.expiry_date)) {
      return toast.error("أدخل تاريخ الصلاحية للأصناف التي تتطلب ذلك");
    }
    const payment = initialPaymentAmount;
    if (!Number.isFinite(payment) || payment < 0 || payment > draftTotal) return toast.error("قيمة الدفعة الأولى غير صحيحة");
    if (payment > 0 && !canFinance) return toast.error("الدفعة الأولى تحتاج صلاحية إدارة المالية");
    if (payment > 0 && !selectedInitialSource) return toast.error("اختر مصدر الدفعة الأولى");
    if (payment > 0 && selectedInitialSource?.require_reference && !initialReference.trim()) {
      return toast.error("مرجع العملية مطلوب لوسيلة الدفع المختارة");
    }
    if (payment > 0 && initialSelectedRep?.payment_limit != null && payment > Number(initialSelectedRep.payment_limit)) {
      return toast.error(`المبلغ يتجاوز حد استلام المندوب ${money(initialSelectedRep.payment_limit)}`);
    }
    if (payment > 0 && selectedInitialSource && Number(selectedInitialSource.balance) < initialRequiredDebit) {
      return toast.error(`رصيد المصدر غير كافٍ. المطلوب ${money(initialRequiredDebit)} بعد احتساب العمولة`);
    }
    const [sourceKind, sourceAccountId] = initialSource ? initialSource.split(":") : ["", ""];
    try {
      await execute(() => createPurchaseV2(branchId, {
        supplier_id: purchaseSupplierId,
        invoice_number: invoiceNumber.trim(),
        date: invoiceDate,
        due_date: dueDate,
        description: purchaseNote.trim(),
        items: draftLines.map(({ product_name: _name, barcode: _barcode, track_expiry: _expiry, unit_of_measure: _unit, ...line }) => ({
          ...line,
          quantity: Number(line.quantity),
          price: Number(line.price),
          sale_price: line.sale_price == null ? null : Number(line.sale_price),
        })),
        initial_payment: payment,
        payment_source_kind: payment > 0 ? sourceKind as "cash_account" | "payment_account" : null,
        payment_source_account_id: payment > 0 ? sourceAccountId : null,
        representative_id: payment > 0 ? initialRepresentative || null : null,
        provider_reference: payment > 0 ? initialReference.trim() || null : null,
        update_sale_prices: Boolean(permissions?.can_manage_pricing && updateSalePrices),
      }), "تم ترحيل فاتورة الشراء وتحديث المخزون بنجاح");
      setPurchaseDialog(false);
      resetPurchase();
    } catch {}
  };

  const [purchaseSheet, setPurchaseSheet] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<SupplierPurchaseRow | null>(null);
  const activeSelectedPurchase = selectedPurchase
    ? purchases.find((purchase) => purchase.id === selectedPurchase.id) || selectedPurchase
    : null;
  const openPurchaseDetails = (purchase: SupplierPurchaseRow) => {
    setSelectedPurchase(purchase);
    setPurchaseSheet(true);
  };

  const [paymentDialog, setPaymentDialog] = useState(false);
  const [paymentSupplierId, setPaymentSupplierId] = useState("");
  const [paymentPurchaseId, setPaymentPurchaseId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentSource, setPaymentSource] = useState("");
  const [paymentRep, setPaymentRep] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const openPayment = (supplierId: string, purchase?: SupplierPurchaseRow) => {
    if (!canFinance) return toast.error("ليس لديك صلاحية تنفيذ مدفوعات الموردين");
    setPaymentSupplierId(supplierId);
    setPaymentPurchaseId(purchase?.id || "");
    setPaymentAmount(purchase ? String(purchase.outstanding) : "");
    setPaymentSource("");
    setPaymentRep("");
    setPaymentReference("");
    setPaymentNote("");
    setPaymentDialog(true);
  };

  const paymentSupplier = suppliers.find((supplier) => supplier.id === paymentSupplierId);
  const paymentPurchase = purchases.find((purchase) => purchase.id === paymentPurchaseId);
  const paymentReps = representatives.filter((rep) =>
    rep.supplier_id === paymentSupplierId && rep.active && rep.can_receive_payments,
  );
  const selectedPaymentSource = sourceOptions.find((source) => source.key === paymentSource);
  const paymentNumericAmount = Number(paymentAmount || 0);
  const expectedFee = calculateFee(selectedPaymentSource, paymentNumericAmount);
  const paymentRequiredDebit = requiredDebit(selectedPaymentSource, paymentNumericAmount);
  const selectedPaymentRep = paymentReps.find((rep) => rep.id === paymentRep);

  const submitPayment = async () => {
    const amount = paymentNumericAmount;
    if (!canFinance) return toast.error("ليس لديك صلاحية تنفيذ مدفوعات الموردين");
    if (!paymentSupplierId || !Number.isFinite(amount) || amount <= 0 || !selectedPaymentSource) {
      return toast.error("راجع المورد والمبلغ ومصدر الدفع");
    }
    if (!paymentSupplier?.active) return toast.error("المورد موقوف ولا يمكن تسجيل دفعة جديدة له");
    if (paymentPurchase && amount > Number(paymentPurchase.outstanding)) return toast.error("المبلغ أكبر من المتبقي على الفاتورة");
    if (selectedPaymentSource.require_reference && !paymentReference.trim()) {
      return toast.error("مرجع العملية مطلوب لوسيلة الدفع المختارة");
    }
    if (selectedPaymentRep?.payment_limit != null && amount > Number(selectedPaymentRep.payment_limit)) {
      return toast.error(`المبلغ يتجاوز حد استلام المندوب ${money(selectedPaymentRep.payment_limit)}`);
    }
    if (Number(selectedPaymentSource.balance) < paymentRequiredDebit) {
      return toast.error(`رصيد المصدر غير كافٍ. المطلوب ${money(paymentRequiredDebit)} بعد احتساب العمولة`);
    }
    const [sourceKind, sourceAccountId] = paymentSource.split(":");
    try {
      await execute(() => paySupplierV2(branchId, {
        supplier_id: paymentSupplierId,
        purchase_id: paymentPurchaseId || null,
        source_kind: sourceKind as "cash_account" | "payment_account",
        source_account_id: sourceAccountId,
        amount,
        representative_id: paymentRep || null,
        provider_reference: paymentReference.trim() || null,
        note: paymentNote.trim() || null,
      }), "تم تسجيل دفعة المورد وتحديث الـLedger");
      setPaymentDialog(false);
    } catch {}
  };

  const [returnDialog, setReturnDialog] = useState(false);
  const [returnPurchase, setReturnPurchase] = useState<SupplierPurchaseRow | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState("");
  const [returnNote, setReturnNote] = useState("");

  const openReturn = (purchase: SupplierPurchaseRow) => {
    if (!canManage) return toast.error("ليس لديك صلاحية تنفيذ مرتجعات الموردين");
    setReturnPurchase(purchase);
    setReturnQuantities({});
    setReturnReason("");
    setReturnNote("");
    setReturnDialog(true);
  };

  const submitReturn = async () => {
    if (!canManage) return toast.error("ليس لديك صلاحية تنفيذ مرتجعات الموردين");
    if (!returnPurchase || !returnReason.trim()) return toast.error("اكتب سبب المرتجع");
    const items = returnPurchase.items
      .map((item) => ({
        purchase_item_id: item.id,
        quantity: Number(returnQuantities[item.id] || 0),
        available: Math.max(0, Number(item.quantity) - Number(item.returned_quantity || 0)),
      }))
      .filter((item) => item.quantity > 0);
    if (!items.length) return toast.error("حدد كمية مرتجع لصنف واحد على الأقل");
    if (items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > item.available)) {
      return toast.error("كمية المرتجع أكبر من الكمية المتاحة للرد أو غير صحيحة");
    }
    try {
      await execute(
        () => createSupplierReturnV2(
          returnPurchase.id,
          items.map(({ purchase_item_id, quantity }) => ({ purchase_item_id, quantity })),
          returnReason.trim(),
          returnNote.trim(),
        ),
        "تم تنفيذ مرتجع المورد وتحديث المخزون والـLedger",
      );
      setReturnDialog(false);
    } catch {}
  };

  const voidPayment = async (payment: SupplierPaymentRow) => {
    if (!canFinance) return toast.error("ليس لديك صلاحية عكس مدفوعات الموردين");
    const reason = window.prompt("سبب إلغاء الدفعة:");
    if (!reason?.trim()) return;
    try {
      await execute(() => voidSupplierPaymentV2(payment.id, reason.trim()), "تم عكس دفعة المورد بأمان");
    } catch {}
  };

  const voidPurchase = async (purchase: SupplierPurchaseRow) => {
    if (!canManage) return toast.error("ليس لديك صلاحية إلغاء فاتورة الشراء");
    const reason = window.prompt("سبب إلغاء فاتورة الشراء:");
    if (!reason?.trim()) return;
    if (!window.confirm("سيتم عكس المخزون ومديونية المورد. هل تريد المتابعة؟")) return;
    try {
      await execute(() => voidPurchaseV2(purchase.id, reason.trim()), "تم إلغاء الفاتورة وعكس آثارها بأمان");
    } catch {}
  };

  if (!branchId) {
    return <Card><CardContent className="p-8 text-center text-muted-foreground">اختر فرعاً أولاً لفتح مركز الموردين والمشتريات.</CardContent></Card>;
  }

  if (centerQuery.isLoading) {
    return <div className="flex min-h-[420px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-[#005931]" /></div>;
  }

  if (centerQuery.isError || !center) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6 text-center">
          <CircleAlert className="mx-auto mb-2 h-7 w-7 text-red-600" />
          <p className="font-bold text-red-800">تعذر تحميل مركز الموردين والمشتريات</p>
          <Button variant="outline" className="mt-4" onClick={() => centerQuery.refetch()}>إعادة المحاولة</Button>
        </CardContent>
      </Card>
    );
  }

  const tabs: Array<{ key: TabKey; label: string; icon: typeof Truck; count?: number }> = [
    { key: "overview", label: "نظرة عامة", icon: ShieldCheck },
    { key: "suppliers", label: "الموردون", icon: UsersRound, count: suppliers.length },
    { key: "purchases", label: "فواتير الشراء", icon: ReceiptText, count: purchases.filter((purchase) => purchase.status === "posted").length },
    { key: "payments", label: "المدفوعات", icon: HandCoins, count: center.recent_payments.length },
    { key: "returns", label: "المرتجعات", icon: RotateCcw, count: center.recent_returns.length },
  ];

  return (
    <div dir="rtl" className="space-y-5">
      <section className="overflow-hidden rounded-[28px] bg-[#005931] p-5 text-white shadow-[0_18px_50px_rgba(0,89,49,.20)] md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/12"><Truck className="h-6 w-6" /></div>
            <div>
              <h1 className="text-2xl font-black md:text-3xl">مركز الموردين والمشتريات</h1>
              <p className="mt-1 max-w-2xl text-sm text-emerald-100">من فاتورة المورد إلى المخزون والسداد والمرتجع وكشف الحساب — كل حركة مترابطة ومُرحّلة على الـLedger.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && <Button onClick={() => openPurchase()} disabled={busy} className="bg-white text-[#005931] hover:bg-emerald-50"><PackagePlus className="ml-2 h-4 w-4" />فاتورة شراء جديدة</Button>}
            {canManage && <Button onClick={openNewSupplier} disabled={busy} variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"><UserRoundPlus className="ml-2 h-4 w-4" />مورد جديد</Button>}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button key={item.key} onClick={() => setTab(item.key)} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${tab === item.key ? "bg-white text-[#005931]" : "bg-white/10 text-white hover:bg-white/20"}`}>
              <item.icon className="h-4 w-4" />{item.label}
              {item.count != null && <span className={`rounded-full px-2 py-0.5 text-[11px] ${tab === item.key ? "bg-emerald-50" : "bg-white/10"}`}>{item.count}</span>}
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={BadgeDollarSign} label="مستحق للموردين" value={money(center.summary.payable_total)} note="من الـSupplier Ledger" />
        <Metric icon={WalletCards} label="رصيد لصالحنا" value={money(center.summary.supplier_credit_total)} note="دفعات مقدمة/أرصدة دائنة" />
        <Metric icon={FileText} label="فواتير مفتوحة" value={String(center.summary.open_purchases)} note="تحتاج سداداً" />
        <Metric icon={CalendarClock} label="متأخرة" value={String(center.summary.overdue_purchases)} note="تجاوزت تاريخ الاستحقاق" danger={center.summary.overdue_purchases > 0} />
        <Metric icon={ReceiptText} label="مشتريات الشهر" value={money(center.summary.month_purchases)} note={`${center.summary.active_suppliers} مورد نشط`} />
      </div>

      {Number(center.summary.legacy_unassigned_purchases || 0) > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <CircleAlert className="h-5 w-5 shrink-0" />
          <div><b>يوجد {center.summary.legacy_unassigned_purchases} فاتورة تاريخية بدون فرع.</b> تم إبقاؤها كبيانات Legacy ولم يتم تعديلها تلقائياً.</div>
        </div>
      )}

      {(tab === "suppliers" || tab === "purchases") && (
        <Card className="border-0 shadow-sm ring-1 ring-slate-200">
          <CardContent className="p-3 md:p-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === "suppliers" ? "ابحث باسم المورد، الكود، الهاتف أو المندوب..." : "ابحث برقم الفاتورة أو المورد أو الوصف..."} className="h-11 pr-10" />
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "overview" && <Overview center={center} purchases={purchases} onOpenPurchase={openPurchaseDetails} onPay={openPayment} setTab={setTab} canFinance={canFinance} />}
      {tab === "suppliers" && <SuppliersTable suppliers={filteredSuppliers} onOpen={(supplier) => { setSelectedSupplier(supplier); setSupplierSheet(true); }} onEdit={openEditSupplier} onRep={openRepresentative} onPurchase={(supplier) => openPurchase(supplier.id)} onPay={(supplier) => openPayment(supplier.id)} canFinance={canFinance} canManage={canManage} />}
      {tab === "purchases" && <PurchasesTable purchases={filteredPurchases} onOpen={openPurchaseDetails} onPay={openPayment} onReturn={openReturn} onVoid={voidPurchase} canFinance={canFinance} canManage={canManage} />}
      {tab === "payments" && <PaymentsTable rows={center.recent_payments} onVoid={voidPayment} canFinance={canFinance} />}
      {tab === "returns" && <ReturnsTable rows={center.recent_returns} />}

      <Dialog open={supplierDialog} onOpenChange={setSupplierDialog}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl" dir="rtl">
          <DialogHeader><DialogTitle>{supplierForm.id ? "تعديل بيانات المورد" : "إضافة مورد جديد"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <Field label="اسم المورد / الشركة *"><Input value={supplierForm.name} onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })} /></Field>
            <Field label="كود المورد"><Input value={supplierForm.code || ""} onChange={(event) => setSupplierForm({ ...supplierForm, code: event.target.value })} /></Field>
            <Field label="جهة الاتصال"><Input value={supplierForm.contact_person || ""} onChange={(event) => setSupplierForm({ ...supplierForm, contact_person: event.target.value })} /></Field>
            <Field label="رقم الهاتف"><Input value={supplierForm.phone || ""} onChange={(event) => setSupplierForm({ ...supplierForm, phone: event.target.value })} /></Field>
            <Field label="البريد الإلكتروني"><Input type="email" value={supplierForm.email || ""} onChange={(event) => setSupplierForm({ ...supplierForm, email: event.target.value })} /></Field>
            <Field label="العنوان"><Input value={supplierForm.address || ""} onChange={(event) => setSupplierForm({ ...supplierForm, address: event.target.value })} /></Field>
            <Field label="الرقم الضريبي"><Input value={supplierForm.tax_number || ""} onChange={(event) => setSupplierForm({ ...supplierForm, tax_number: event.target.value })} /></Field>
            <Field label="السجل التجاري"><Input value={supplierForm.commercial_registration || ""} onChange={(event) => setSupplierForm({ ...supplierForm, commercial_registration: event.target.value })} /></Field>
            <Field label="أجل السداد (يوم)"><Input type="number" min="0" value={supplierForm.payment_terms_days || 0} onChange={(event) => setSupplierForm({ ...supplierForm, payment_terms_days: Number(event.target.value) })} /></Field>
            <Field label="حد الائتمان"><Input type="number" min="0" value={supplierForm.credit_limit ?? ""} onChange={(event) => setSupplierForm({ ...supplierForm, credit_limit: event.target.value === "" ? null : Number(event.target.value) })} /></Field>
            <div className="md:col-span-2"><Field label="ملاحظات"><Textarea value={supplierForm.notes || ""} onChange={(event) => setSupplierForm({ ...supplierForm, notes: event.target.value })} /></Field></div>
            {supplierForm.id && <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={supplierForm.active ?? true} onChange={(event) => setSupplierForm({ ...supplierForm, active: event.target.checked })} /> المورد نشط</label>}
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setSupplierDialog(false)}>إلغاء</Button><Button disabled={busy || !canManage} onClick={saveSupplier}>حفظ المورد</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={repDialog} onOpenChange={setRepDialog}>
        <DialogContent className="sm:max-w-xl" dir="rtl">
          <DialogHeader><DialogTitle>مندوب المورد — {repSupplier?.name}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <Field label="اسم المندوب *"><Input value={repForm.name} onChange={(event) => setRepForm({ ...repForm, name: event.target.value })} /></Field>
            <Field label="المسمى / الدور"><Input value={repForm.role_title || ""} onChange={(event) => setRepForm({ ...repForm, role_title: event.target.value })} placeholder="مندوب مبيعات / مشرف..." /></Field>
            <Field label="الهاتف"><Input value={repForm.phone || ""} onChange={(event) => setRepForm({ ...repForm, phone: event.target.value })} /></Field>
            <Field label="حد استلام الدفعة"><Input type="number" min="0" value={repForm.payment_limit ?? ""} onChange={(event) => setRepForm({ ...repForm, payment_limit: event.target.value === "" ? null : Number(event.target.value) })} /></Field>
            <Field label="طريقة التحويل للمندوب"><Input value={repForm.payout_method || ""} onChange={(event) => setRepForm({ ...repForm, payout_method: event.target.value })} placeholder="نقدي / فودافون كاش..." /></Field>
            <Field label="رقم/وجهة التحويل"><Input value={repForm.payout_destination || ""} onChange={(event) => setRepForm({ ...repForm, payout_destination: event.target.value })} /></Field>
            <div className="md:col-span-2"><Field label="ملاحظات"><Textarea value={repForm.notes || ""} onChange={(event) => setRepForm({ ...repForm, notes: event.target.value })} /></Field></div>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={repForm.can_receive_payments ?? false} onChange={(event) => setRepForm({ ...repForm, can_receive_payments: event.target.checked })} /> مصرح له باستلام مدفوعات</label>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={repForm.is_primary ?? false} onChange={(event) => setRepForm({ ...repForm, is_primary: event.target.checked })} /> المندوب الأساسي</label>
            {repForm.id && <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={repForm.active ?? true} onChange={(event) => setRepForm({ ...repForm, active: event.target.checked })} /> المندوب نشط</label>}
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setRepDialog(false)}>إلغاء</Button><Button disabled={busy || !canManage} onClick={saveRepresentative}>حفظ المندوب</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={purchaseDialog} onOpenChange={setPurchaseDialog}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-6xl" dir="rtl">
          <DialogHeader><DialogTitle className="text-xl">فاتورة شراء جديدة</DialogTitle></DialogHeader>
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              <Card><CardContent className="grid gap-3 p-4 md:grid-cols-2">
                <Field label="المورد *"><Select value={purchaseSupplierId} onValueChange={(value) => { setPurchaseSupplierId(value); const supplier = suppliers.find((item) => item.id === value); setDueDate(addDays(invoiceDate, supplier?.payment_terms_days || 0)); setInitialRepresentative(""); }}><SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger><SelectContent>{suppliers.filter((supplier) => supplier.active).map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="رقم فاتورة المورد"><Input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} placeholder="سيتم توليد رقم داخلي لو تُرك فارغاً" /></Field>
                <Field label="تاريخ الفاتورة"><Input type="date" value={invoiceDate} onChange={(event) => { setInvoiceDate(event.target.value); setDueDate(addDays(event.target.value, purchaseSupplier?.payment_terms_days || 0)); }} /></Field>
                <Field label="تاريخ الاستحقاق"><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
              </CardContent></Card>

              <Card><CardHeader className="pb-3"><CardTitle className="text-base">إضافة الأصناف</CardTitle></CardHeader><CardContent className="space-y-3">
                <div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input autoFocus value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="امسح الباركود أو اكتب اسم المنتج..." className="h-11 pr-10" /></div>
                {productsQuery.isError && <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><span>تعذر تحميل كتالوج المنتجات.</span><Button size="sm" variant="outline" onClick={() => productsQuery.refetch()}>إعادة المحاولة</Button></div>}
                {productSearch.trim() && !productsQuery.isLoading && !productsQuery.isError && purchaseProductResults.length === 0 && <div className="rounded-xl bg-slate-50 p-3 text-center text-sm text-muted-foreground">لا يوجد منتج مطابق للبحث.</div>}
                {purchaseProductResults.length > 0 && <div className="grid gap-2 rounded-2xl border bg-white p-2 md:grid-cols-2">{purchaseProductResults.map((product) => <button type="button" key={product.id} onClick={() => addProduct(product)} className="flex items-center justify-between rounded-xl border p-3 text-right hover:border-[#005931] hover:bg-emerald-50"><div><div className="font-bold">{product.name}</div><div className="mt-1 text-xs text-muted-foreground">{product.barcode || "بدون باركود"} · مخزون {Number(product.quantity || 0)}</div></div><Plus className="h-4 w-4 text-[#005931]" /></button>)}</div>}
                <div className="space-y-2">{draftLines.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">ابدأ بمسح باركود أو البحث عن منتج.</div> : draftLines.map((line, index) => <div key={line.product_id} className="rounded-2xl border p-3"><div className="mb-3 flex items-start justify-between gap-2"><div><div className="font-bold">{line.product_name}</div><div className="text-xs text-muted-foreground">{line.barcode || "بدون باركود"}{line.unit_of_measure ? ` · ${line.unit_of_measure}` : ""}</div></div><Button variant="ghost" size="icon" onClick={() => removeLine(index)}><X className="h-4 w-4" /></Button></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><Field label="الكمية"><Input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} /></Field><Field label="سعر الشراء"><Input type="number" min="0" step="0.01" value={line.price} onChange={(event) => updateLine(index, { price: Number(event.target.value) })} /></Field><Field label="سعر البيع"><Input type="number" min="0" step="0.01" value={line.sale_price ?? ""} onChange={(event) => updateLine(index, { sale_price: event.target.value === "" ? null : Number(event.target.value) })} /></Field><div className="flex items-end"><div className="flex h-10 w-full items-center justify-between rounded-md bg-slate-50 px-3 text-sm"><span>الإجمالي</span><b>{money(Number(line.quantity) * Number(line.price))}</b></div></div></div>{line.track_expiry && <div className="mt-3 grid gap-2 sm:grid-cols-3"><Field label="تاريخ الصلاحية *"><Input type="date" value={line.expiry_date || ""} onChange={(event) => updateLine(index, { expiry_date: event.target.value })} /></Field><Field label="رقم التشغيلة"><Input value={line.batch_number || ""} onChange={(event) => updateLine(index, { batch_number: event.target.value })} /></Field><Field label="مكان الرف"><Input value={line.shelf_location || ""} onChange={(event) => updateLine(index, { shelf_location: event.target.value })} /></Field></div>}</div>)}</div>
              </CardContent></Card>
            </div>

            <div className="space-y-4">
              <Card className="sticky top-0"><CardHeader><CardTitle className="text-base">ملخص وترحيل الفاتورة</CardTitle></CardHeader><CardContent className="space-y-4">
                <div className="rounded-2xl bg-slate-950 p-4 text-white"><div className="text-xs text-slate-300">إجمالي الفاتورة</div><div className="mt-1 text-2xl font-black">{money(draftTotal)}</div><div className="mt-2 text-xs text-slate-400">{draftLines.length} صنف</div></div>
                {canFinance ? <>
                  <Field label="دفعة أولى"><Input type="number" min="0" max={draftTotal} step="0.01" value={initialPayment} onChange={(event) => setInitialPayment(event.target.value)} /></Field>
                  {initialPaymentAmount > 0 && <>
                    <Field label="مصدر الدفع *"><Select value={initialSource} onValueChange={(value) => { setInitialSource(value); setInitialReference(""); }}><SelectTrigger><SelectValue placeholder="اختر الخزنة أو المحفظة" /></SelectTrigger><SelectContent>{sourceOptions.map((source) => <SelectItem key={source.key} value={source.key}>{source.name} — {money(source.balance)}</SelectItem>)}</SelectContent></Select></Field>
                    {selectedInitialSource?.kind === "payment_account" && <div className="rounded-xl border bg-slate-50 p-3 text-sm"><div className="flex justify-between"><span>العمولة المتوقعة</span><b>{money(initialExpectedFee)}</b></div><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>إجمالي الخصم من المصدر</span><b>{money(initialRequiredDebit)}</b></div></div>}
                    {selectedInitialSource?.kind === "payment_account" && <Field label={`مرجع العملية${selectedInitialSource.require_reference ? " *" : ""}`}><Input value={initialReference} onChange={(event) => setInitialReference(event.target.value)} placeholder={selectedInitialSource.require_reference ? "مطلوب حسب وسيلة الدفع" : "اختياري"} /></Field>}
                    <Field label="المندوب المستلم"><Select value={initialRepresentative || "none"} onValueChange={(value) => setInitialRepresentative(value === "none" ? "" : value)}><SelectTrigger><SelectValue placeholder="بدون مندوب" /></SelectTrigger><SelectContent><SelectItem value="none">بدون مندوب</SelectItem>{supplierReps.filter((rep) => rep.can_receive_payments).map((rep) => <SelectItem key={rep.id} value={rep.id}>{rep.name}{rep.payment_limit != null ? ` · حد ${money(rep.payment_limit)}` : ""}</SelectItem>)}</SelectContent></Select></Field>
                  </>}
                </> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">سيتم إنشاء الفاتورة آجلة بدون دفعة أولى لأن حسابك لا يملك صلاحية إدارة المالية.</div>}
                {permissions?.can_manage_pricing && <label className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm"><input type="checkbox" className="mt-1" checked={updateSalePrices} onChange={(event) => setUpdateSalePrices(event.target.checked)} /><span><b>تحديث أسعار البيع</b><br/><span className="text-xs text-muted-foreground">ترحيل أسعار البيع المُدخلة لمصدر التسعير الصحيح للفرع.</span></span></label>}
                <Field label="ملاحظات الفاتورة"><Textarea value={purchaseNote} onChange={(event) => setPurchaseNote(event.target.value)} rows={3} /></Field>
                <div className="rounded-xl border p-3 text-xs text-muted-foreground"><b className="text-foreground">الترحيل Atomic:</b> الفاتورة + الأصناف + المخزون + الـbatch + المديونية + الدفعة الأولى تُنفذ كعملية واحدة أو لا يُحفظ شيء.</div>
                <Button disabled={busy || !canManage || draftLines.length === 0 || productsQuery.isError} onClick={submitPurchase} className="h-12 w-full text-base font-black"><ReceiptText className="ml-2 h-5 w-5" />ترحيل فاتورة الشراء</Button>
              </CardContent></Card>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent className="sm:max-w-xl" dir="rtl">
          <DialogHeader><DialogTitle>سداد مورد</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-2xl bg-slate-50 p-4"><div className="font-black">{paymentSupplier?.name}</div><div className="mt-1 text-sm text-muted-foreground">{paymentPurchase ? `فاتورة ${paymentPurchase.invoice_number} · متبقي ${money(paymentPurchase.outstanding)}` : `دفعة على الحساب · الرصيد ${money(paymentSupplier?.branch_balance)}`}</div></div>
            <Field label="المبلغ *"><Input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></Field>
            <Field label="مصدر الدفع *"><Select value={paymentSource} onValueChange={(value) => { setPaymentSource(value); setPaymentReference(""); }}><SelectTrigger><SelectValue placeholder="الخزنة / العهدة / المحفظة" /></SelectTrigger><SelectContent>{sourceOptions.map((source) => <SelectItem key={source.key} value={source.key}>{source.name} — رصيد {money(source.balance)}</SelectItem>)}</SelectContent></Select></Field>
            {selectedPaymentSource?.kind === "payment_account" && <div className="rounded-xl border bg-slate-50 p-3 text-sm"><div className="flex justify-between"><span>العمولة المتوقعة</span><b>{money(expectedFee)}</b></div><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>إجمالي الخصم من المصدر</span><b>{money(paymentRequiredDebit)}</b></div>{selectedPaymentSource.fee_type && <div className="mt-1 text-xs text-muted-foreground">{selectedPaymentSource.method_name || selectedPaymentSource.name} · {selectedPaymentSource.fee_type === "percent" ? `${selectedPaymentSource.fee_value}%` : money(selectedPaymentSource.fee_value)}</div>}</div>}
            {selectedPaymentSource && paymentNumericAmount > 0 && Number(selectedPaymentSource.balance) < paymentRequiredDebit && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">الرصيد غير كافٍ. المطلوب {money(paymentRequiredDebit)} والمتاح {money(selectedPaymentSource.balance)}.</div>}
            <Field label="المندوب المستلم"><Select value={paymentRep || "none"} onValueChange={(value) => setPaymentRep(value === "none" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">بدون مندوب</SelectItem>{paymentReps.map((rep) => <SelectItem key={rep.id} value={rep.id}>{rep.name}{rep.payment_limit != null ? ` · حد ${money(rep.payment_limit)}` : ""}</SelectItem>)}</SelectContent></Select></Field>
            {selectedPaymentSource?.kind === "payment_account" && <Field label={`مرجع العملية${selectedPaymentSource.require_reference ? " *" : ""}`}><Input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder={selectedPaymentSource.require_reference ? "مطلوب حسب وسيلة الدفع" : "اختياري"} /></Field>}
            <Field label="ملاحظة"><Textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} /></Field>
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setPaymentDialog(false)}>إلغاء</Button><Button disabled={busy || !canFinance || !selectedPaymentSource || paymentNumericAmount <= 0} onClick={submitPayment}><HandCoins className="ml-2 h-4 w-4" />تأكيد السداد</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={returnDialog} onOpenChange={setReturnDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" dir="rtl">
          <DialogHeader><DialogTitle>مرتجع إلى المورد — {returnPurchase?.invoice_number}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {returnPurchase?.items.map((item) => {
              const available = Math.max(0, Number(item.quantity) - Number(item.returned_quantity || 0));
              return <div key={item.id} className="grid items-end gap-3 rounded-2xl border p-3 sm:grid-cols-[1fr_160px]"><div><div className="font-bold">{item.product_name}</div><div className="mt-1 text-xs text-muted-foreground">المشتراة {item.quantity} · تم رد {item.returned_quantity || 0} · المتاح للرد {available}</div></div><Field label="كمية المرتجع"><Input type="number" min="0" max={available} step="0.001" disabled={available <= 0} value={returnQuantities[item.id] || ""} onChange={(event) => setReturnQuantities({ ...returnQuantities, [item.id]: event.target.value })} /></Field></div>;
            })}
            <Field label="سبب المرتجع *"><Input value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="تالف / صلاحية / خطأ توريد..." /></Field>
            <Field label="ملاحظات"><Textarea value={returnNote} onChange={(event) => setReturnNote(event.target.value)} /></Field>
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setReturnDialog(false)}>إلغاء</Button><Button disabled={busy || !canManage} onClick={submitReturn}><RotateCcw className="ml-2 h-4 w-4" />تنفيذ المرتجع</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={supplierSheet} onOpenChange={setSupplierSheet}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl" side="left" dir="rtl">
          <SheetHeader><SheetTitle>ملف المورد</SheetTitle></SheetHeader>
          {activeSelectedSupplier && <div className="space-y-5 py-5">
            <div className="rounded-3xl bg-[#005931] p-5 text-white"><div className="flex items-start justify-between"><div><div className="text-xl font-black">{activeSelectedSupplier.name}</div><div className="mt-1 text-sm text-emerald-100">{activeSelectedSupplier.code || "بدون كود"}</div></div><Badge className={activeSelectedSupplier.active ? "bg-white text-[#005931]" : "bg-red-100 text-red-700"}>{activeSelectedSupplier.active ? "نشط" : "موقوف"}</Badge></div><div className="mt-5 grid grid-cols-2 gap-3"><MiniStat label="رصيد الفرع" value={money(activeSelectedSupplier.branch_balance)} /><MiniStat label="فواتير مفتوحة" value={String(activeSelectedSupplier.open_invoices)} /></div></div>
            <div className="grid gap-3 sm:grid-cols-2"><Info label="الهاتف" value={activeSelectedSupplier.phone} /><Info label="جهة الاتصال" value={activeSelectedSupplier.contact_person} /><Info label="الرقم الضريبي" value={activeSelectedSupplier.tax_number} /><Info label="أجل السداد" value={`${activeSelectedSupplier.payment_terms_days || 0} يوم`} /></div>
            <div>
              <div className="mb-2 flex items-center justify-between"><h3 className="font-black">المندوبون</h3>{canManage && <Button size="sm" variant="outline" onClick={() => openRepresentative(activeSelectedSupplier)}><Plus className="ml-1 h-4 w-4" />مندوب</Button>}</div>
              <div className="space-y-2">{representatives.filter((rep) => rep.supplier_id === activeSelectedSupplier.id).length === 0 ? <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">لا يوجد مندوبون مسجلون لهذا المورد.</div> : representatives.filter((rep) => rep.supplier_id === activeSelectedSupplier.id).map((rep) => <button key={rep.id} disabled={!canManage} onClick={() => canManage && openRepresentative(activeSelectedSupplier, rep)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-right ${canManage ? "hover:bg-slate-50" : "cursor-default"}`}><div><b>{rep.name}</b><div className="text-xs text-muted-foreground">{rep.role_title || "مندوب"} · {rep.phone || "بدون هاتف"}{!rep.active ? " · موقوف" : ""}</div></div><div className="flex flex-wrap gap-1">{rep.is_primary && <Badge variant="outline">أساسي</Badge>}{rep.can_receive_payments && <Badge className="bg-emerald-100 text-emerald-800">يستلم دفعات</Badge>}{!rep.active && <Badge variant="outline">موقوف</Badge>}</div></button>)}</div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between"><h3 className="font-black">كشف الحساب</h3>{!ledgerQuery.isLoading && <Button size="sm" variant="ghost" onClick={() => ledgerQuery.refetch()}><RefreshCw className="ml-1 h-4 w-4" />تحديث</Button>}</div>
              {ledgerQuery.isLoading ? <div className="p-6 text-center text-sm text-muted-foreground">جاري التحميل...</div> : ledgerQuery.isError ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-800"><div>تعذر تحميل كشف الحساب.</div><Button size="sm" variant="outline" className="mt-3" onClick={() => ledgerQuery.refetch()}>إعادة المحاولة</Button></div> : (ledgerQuery.data?.entries || []).length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد حركات في كشف حساب المورد حتى الآن.</div> : <div className="space-y-2">{(ledgerQuery.data?.entries || []).slice(0, 30).map((entry) => <div key={entry.id} className="flex items-start justify-between gap-3 rounded-xl border p-3"><div><div className="font-bold">{entry.description || entry.entry_type}</div><div className="mt-1 text-xs text-muted-foreground">{dateText(entry.created_at)}{entry.invoice_number ? ` · ${entry.invoice_number}` : ""}{entry.representative_name ? ` · ${entry.representative_name}` : ""}</div></div><div className={`font-black ${Number(entry.signed_amount) > 0 ? "text-red-700" : "text-emerald-700"}`}>{Number(entry.signed_amount) > 0 ? "+" : ""}{money(entry.signed_amount)}</div></div>)}</div>}
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage && activeSelectedSupplier.active && <Button onClick={() => openPurchase(activeSelectedSupplier.id)}><PackagePlus className="ml-2 h-4 w-4" />فاتورة شراء</Button>}
              {canFinance && activeSelectedSupplier.active && <Button variant="outline" onClick={() => openPayment(activeSelectedSupplier.id)}><HandCoins className="ml-2 h-4 w-4" />دفعة على الحساب</Button>}
              {canManage && <Button variant="outline" onClick={() => openEditSupplier(activeSelectedSupplier)}><Pencil className="ml-2 h-4 w-4" />تعديل الملف</Button>}
            </div>
          </div>}
        </SheetContent>
      </Sheet>

      <Sheet open={purchaseSheet} onOpenChange={setPurchaseSheet}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl" side="left" dir="rtl">
          <SheetHeader><SheetTitle>تفاصيل فاتورة الشراء</SheetTitle></SheetHeader>
          {activeSelectedPurchase && <div className="space-y-5 py-5">
            <div className="rounded-3xl bg-slate-950 p-5 text-white"><div className="flex justify-between gap-3"><div><div className="text-xl font-black">{activeSelectedPurchase.invoice_number}</div><div className="mt-1 text-sm text-slate-300">{activeSelectedPurchase.supplier_name} · {dateText(activeSelectedPurchase.date)}</div></div><StatusBadge purchase={activeSelectedPurchase} /></div><div className="mt-5 grid grid-cols-3 gap-2"><MiniStat label="الإجمالي" value={money(activeSelectedPurchase.total)} /><MiniStat label="المدفوع" value={money(activeSelectedPurchase.paid)} /><MiniStat label="المتبقي" value={money(activeSelectedPurchase.outstanding)} /></div></div>
            <div className="space-y-2">{activeSelectedPurchase.items.map((item) => <div key={item.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><b>{item.product_name}</b><div className="mt-1 text-xs text-muted-foreground">{item.quantity} × {money(item.price)}{item.expiry_date ? ` · صلاحية ${dateText(item.expiry_date)}` : ""}</div></div><b>{money(item.total)}</b></div>{item.returned_quantity > 0 && <Badge variant="outline" className="mt-2">مرتجع {item.returned_quantity}</Badge>}</div>)}</div>
            <div className="grid gap-3 sm:grid-cols-2"><Info label="تاريخ الاستحقاق" value={dateText(activeSelectedPurchase.due_date)} /><Info label="المخزون الفعلي" value={activeSelectedPurchase.inventory_branch_id ? "مرتبط بمصدر مخزون الفرع" : "—"} /></div>
            {activeSelectedPurchase.description && <div className="rounded-xl bg-slate-50 p-3 text-sm">{activeSelectedPurchase.description}</div>}
            {activeSelectedPurchase.status === "voided" && activeSelectedPurchase.void_reason && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><b>سبب الإلغاء:</b> {activeSelectedPurchase.void_reason}</div>}
            <div className="flex flex-wrap gap-2">
              {activeSelectedPurchase.status === "posted" && activeSelectedPurchase.outstanding > 0 && canFinance && <Button onClick={() => openPayment(activeSelectedPurchase.supplier_id, activeSelectedPurchase)}><HandCoins className="ml-2 h-4 w-4" />سداد</Button>}
              {activeSelectedPurchase.status === "posted" && canManage && activeSelectedPurchase.items.some((item) => Number(item.quantity) - Number(item.returned_quantity || 0) > 0) && <Button variant="outline" onClick={() => openReturn(activeSelectedPurchase)}><RotateCcw className="ml-2 h-4 w-4" />مرتجع مورد</Button>}
              {activeSelectedPurchase.status === "posted" && canManage && <Button variant="outline" className="text-red-700" onClick={() => voidPurchase(activeSelectedPurchase)}><Trash2 className="ml-2 h-4 w-4" />إلغاء الفاتورة</Button>}
            </div>
          </div>}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs font-bold text-slate-600">{label}</Label>{children}</div>;
}

function Metric({ icon: Icon, label, value, note, danger = false }: { icon: typeof Truck; label: string; value: string; note: string; danger?: boolean }) {
  return <Card className={`border-0 shadow-sm ring-1 ${danger ? "ring-red-200" : "ring-slate-200"}`}><CardContent className="p-4"><div className="flex items-start justify-between"><div><div className="text-xs font-bold text-slate-500">{label}</div><div className={`mt-2 text-xl font-black ${danger ? "text-red-700" : "text-slate-950"}`}>{value}</div><div className="mt-1 text-[11px] text-slate-400">{note}</div></div><div className={`rounded-xl p-2 ${danger ? "bg-red-50 text-red-700" : "bg-emerald-50 text-[#005931]"}`}><Icon className="h-5 w-5" /></div></div></CardContent></Card>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/10 p-3"><div className="text-[10px] opacity-70">{label}</div><div className="mt-1 font-black">{value}</div></div>;
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return <div className="rounded-xl border bg-white p-3"><div className="text-[10px] font-bold text-slate-400">{label}</div><div className="mt-1 text-sm font-bold">{value || "—"}</div></div>;
}

function StatusBadge({ purchase }: { purchase: SupplierPurchaseRow }) {
  if (purchase.status === "voided") return <Badge className="bg-slate-200 text-slate-700">ملغاة</Badge>;
  if (purchase.overdue) return <Badge className="bg-red-100 text-red-800">متأخرة</Badge>;
  if (purchase.payment_status === "paid") return <Badge className="bg-emerald-100 text-emerald-800">مدفوعة</Badge>;
  if (purchase.payment_status === "partial") return <Badge className="bg-amber-100 text-amber-800">جزئي</Badge>;
  return <Badge variant="outline">غير مدفوعة</Badge>;
}

function Overview({ center, purchases, onOpenPurchase, onPay, setTab, canFinance }: {
  center: SupplierPurchaseCenterV2;
  purchases: SupplierPurchaseRow[];
  onOpenPurchase: (purchase: SupplierPurchaseRow) => void;
  onPay: (supplierId: string, purchase?: SupplierPurchaseRow) => void;
  setTab: (tab: TabKey) => void;
  canFinance: boolean;
}) {
  const urgent = purchases.filter((purchase) => purchase.status === "posted" && (purchase.overdue || purchase.outstanding > 0)).slice(0, 8);
  const sources = [...(center.payment_sources?.cash_accounts || []), ...(center.payment_sources?.payment_accounts || [])];
  return <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
    <Card className="border-0 shadow-sm ring-1 ring-slate-200"><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-lg">فواتير تحتاج متابعة</CardTitle><Button size="sm" variant="ghost" onClick={() => setTab("purchases")}>عرض الكل<ChevronLeft className="mr-1 h-4 w-4" /></Button></CardHeader><CardContent className="space-y-2">{urgent.length === 0 ? <div className="rounded-2xl bg-emerald-50 p-8 text-center text-sm text-emerald-800">لا توجد فواتير مفتوحة تحتاج متابعة حالياً.</div> : urgent.map((purchase) => <div key={purchase.id} className="flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between"><button className="text-right" onClick={() => onOpenPurchase(purchase)}><div className="flex items-center gap-2"><b>{purchase.invoice_number}</b><StatusBadge purchase={purchase} /></div><div className="mt-1 text-xs text-muted-foreground">{purchase.supplier_name} · استحقاق {dateText(purchase.due_date)}</div></button><div className="flex items-center gap-3"><div className="text-left"><div className="text-[10px] text-muted-foreground">المتبقي</div><b>{money(purchase.outstanding)}</b></div>{canFinance && purchase.outstanding > 0 && <Button size="sm" onClick={() => onPay(purchase.supplier_id, purchase)}>سداد</Button>}</div></div>)}</CardContent></Card>
    <Card className="border-0 shadow-sm ring-1 ring-slate-200"><CardHeader><CardTitle className="text-lg">مصادر سداد الموردين</CardTitle></CardHeader><CardContent className="space-y-2">{sources.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد مصادر دفع متاحة لهذا الفرع.</div> : sources.map((source) => <div key={source.id} className="flex items-center justify-between rounded-xl border p-3"><div className="flex items-center gap-2">{source.provider_code ? <WalletCards className="h-4 w-4 text-[#005931]" /> : <Banknote className="h-4 w-4 text-[#005931]" />}<div><div className="text-sm font-bold">{source.name}</div><div className="text-[10px] text-muted-foreground">{source.method_name || source.account_type || "حساب مالي"}</div></div></div><b>{money(source.balance)}</b></div>)}</CardContent></Card>
  </div>;
}

function SuppliersTable({ suppliers, onOpen, onEdit, onRep, onPurchase, onPay, canFinance, canManage }: {
  suppliers: SupplierCenterSupplier[];
  onOpen: (supplier: SupplierCenterSupplier) => void;
  onEdit: (supplier: SupplierCenterSupplier) => void;
  onRep: (supplier: SupplierCenterSupplier) => void;
  onPurchase: (supplier: SupplierCenterSupplier) => void;
  onPay: (supplier: SupplierCenterSupplier) => void;
  canFinance: boolean;
  canManage: boolean;
}) {
  return <Card className="border-0 shadow-sm ring-1 ring-slate-200"><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>المورد</TableHead><TableHead>التواصل</TableHead><TableHead>المندوب الأساسي</TableHead><TableHead>رصيد الفرع</TableHead><TableHead>الفواتير المفتوحة</TableHead><TableHead>آخر شراء</TableHead><TableHead>إجراءات</TableHead></TableRow></TableHeader><TableBody>{suppliers.map((supplier) => <TableRow key={supplier.id} className={!supplier.active ? "opacity-60" : ""}><TableCell><button onClick={() => onOpen(supplier)} className="text-right"><div className="font-black">{supplier.name}</div><div className="text-xs text-muted-foreground">{supplier.code || "بدون كود"} {!supplier.active && "· موقوف"}</div></button></TableCell><TableCell><div className="text-sm">{supplier.phone || "—"}</div><div className="text-xs text-muted-foreground">{supplier.contact_person || ""}</div></TableCell><TableCell>{supplier.primary_representative ? <div><b className="text-sm">{supplier.primary_representative.name}</b><div className="text-xs text-muted-foreground">{supplier.primary_representative.phone || ""}</div></div> : "—"}</TableCell><TableCell><span className={Number(supplier.branch_balance) > 0 ? "font-black text-red-700" : Number(supplier.branch_balance) < 0 ? "font-black text-emerald-700" : "font-bold"}>{money(supplier.branch_balance)}</span></TableCell><TableCell>{supplier.open_invoices}</TableCell><TableCell>{dateText(supplier.last_purchase_at)}</TableCell><TableCell><div className="flex gap-1"><Button title="فتح الملف" variant="ghost" size="icon" onClick={() => onOpen(supplier)}><History className="h-4 w-4" /></Button>{canManage && supplier.active && <Button title="فاتورة شراء" variant="ghost" size="icon" onClick={() => onPurchase(supplier)}><PackagePlus className="h-4 w-4" /></Button>}{canFinance && supplier.active && <Button title="دفعة" variant="ghost" size="icon" onClick={() => onPay(supplier)}><HandCoins className="h-4 w-4" /></Button>}{canManage && <Button title="مندوب" variant="ghost" size="icon" onClick={() => onRep(supplier)}><UserRoundPlus className="h-4 w-4" /></Button>}{canManage && <Button title="تعديل" variant="ghost" size="icon" onClick={() => onEdit(supplier)}><Pencil className="h-4 w-4" /></Button>}</div></TableCell></TableRow>)}</TableBody></Table></div>{suppliers.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">لا توجد نتائج.</div>}</CardContent></Card>;
}

function PurchasesTable({ purchases, onOpen, onPay, onReturn, onVoid, canFinance, canManage }: {
  purchases: SupplierPurchaseRow[];
  onOpen: (purchase: SupplierPurchaseRow) => void;
  onPay: (supplierId: string, purchase: SupplierPurchaseRow) => void;
  onReturn: (purchase: SupplierPurchaseRow) => void;
  onVoid: (purchase: SupplierPurchaseRow) => void;
  canFinance: boolean;
  canManage: boolean;
}) {
  return <Card className="border-0 shadow-sm ring-1 ring-slate-200"><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>الفاتورة</TableHead><TableHead>المورد</TableHead><TableHead>التاريخ</TableHead><TableHead>الإجمالي</TableHead><TableHead>المدفوع</TableHead><TableHead>المتبقي</TableHead><TableHead>الحالة</TableHead><TableHead>إجراءات</TableHead></TableRow></TableHeader><TableBody>{purchases.map((purchase) => <TableRow key={purchase.id}><TableCell><button className="font-black hover:underline" onClick={() => onOpen(purchase)}>{purchase.invoice_number}</button></TableCell><TableCell>{purchase.supplier_name}</TableCell><TableCell>{dateText(purchase.date)}</TableCell><TableCell>{money(purchase.total)}</TableCell><TableCell>{money(purchase.paid)}</TableCell><TableCell className="font-black">{money(purchase.outstanding)}</TableCell><TableCell><StatusBadge purchase={purchase} /></TableCell><TableCell><div className="flex gap-1"><Button title="التفاصيل" variant="ghost" size="icon" onClick={() => onOpen(purchase)}><FileText className="h-4 w-4" /></Button>{purchase.status === "posted" && purchase.outstanding > 0 && canFinance && <Button title="سداد" variant="ghost" size="icon" onClick={() => onPay(purchase.supplier_id, purchase)}><HandCoins className="h-4 w-4" /></Button>}{purchase.status === "posted" && canManage && purchase.items.some((item) => Number(item.quantity) - Number(item.returned_quantity || 0) > 0) && <Button title="مرتجع مورد" variant="ghost" size="icon" onClick={() => onReturn(purchase)}><RotateCcw className="h-4 w-4" /></Button>}{purchase.status === "posted" && canManage && <Button title="إلغاء الفاتورة" variant="ghost" size="icon" className="text-red-700" onClick={() => onVoid(purchase)}><Trash2 className="h-4 w-4" /></Button>}</div></TableCell></TableRow>)}</TableBody></Table></div>{purchases.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">لا توجد فواتير مطابقة.</div>}</CardContent></Card>;
}

function PaymentsTable({ rows, onVoid, canFinance }: { rows: SupplierPaymentRow[]; onVoid: (payment: SupplierPaymentRow) => void; canFinance: boolean }) {
  return <Card className="border-0 shadow-sm ring-1 ring-slate-200"><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>المورد</TableHead><TableHead>الفاتورة</TableHead><TableHead>المصدر</TableHead><TableHead>المبلغ</TableHead><TableHead>العمولة</TableHead><TableHead>المندوب</TableHead><TableHead>الحالة</TableHead><TableHead>إجراء</TableHead></TableRow></TableHeader><TableBody>{rows.map((payment) => <TableRow key={payment.id}><TableCell>{dateText(payment.created_at)}</TableCell><TableCell className="font-bold">{payment.supplier_name}</TableCell><TableCell>{payment.invoice_number || "على الحساب"}</TableCell><TableCell>{payment.source_name}</TableCell><TableCell className="font-black">{money(payment.amount)}</TableCell><TableCell>{money(payment.actual_fee_amount)}</TableCell><TableCell>{payment.representative_name || "—"}</TableCell><TableCell>{payment.status === "posted" ? <Badge className="bg-emerald-100 text-emerald-800">مرحلة</Badge> : <Badge variant="outline">معكوسة</Badge>}</TableCell><TableCell>{payment.status === "posted" && canFinance && <Button variant="ghost" size="sm" className="text-red-700" onClick={() => onVoid(payment)}>عكس</Button>}</TableCell></TableRow>)}</TableBody></Table></div>{rows.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">لا توجد مدفوعات موردين مسجلة.</div>}</CardContent></Card>;
}

function ReturnsTable({ rows }: { rows: SupplierReturnRow[] }) {
  return <Card className="border-0 shadow-sm ring-1 ring-slate-200"><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>المورد</TableHead><TableHead>الفاتورة</TableHead><TableHead>القيمة</TableHead><TableHead>السبب</TableHead><TableHead>منفذ العملية</TableHead><TableHead>الحالة</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{dateText(row.created_at)}</TableCell><TableCell className="font-bold">{row.supplier_name}</TableCell><TableCell>{row.invoice_number}</TableCell><TableCell className="font-black">{money(row.total)}</TableCell><TableCell>{row.reason}</TableCell><TableCell>{row.created_by_name || "—"}</TableCell><TableCell><Badge className={row.status === "posted" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700"}>{row.status === "posted" ? "مرحّل" : "ملغى"}</Badge></TableCell></TableRow>)}</TableBody></Table></div>{rows.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">لا توجد مرتجعات موردين.</div>}</CardContent></Card>;
}
