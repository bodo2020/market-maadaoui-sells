import { useMemo, useState } from "react";
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
  Phone,
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
  type SupplierPurchaseRow,
  type SupplierRepresentative,
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

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(Number(value || 0));

const dateText = (value?: string | null) => (value ? new Date(value).toLocaleDateString("ar-EG") : "—");

const paymentLabel: Record<string, string> = {
  unpaid: "غير مدفوعة",
  partial: "مدفوعة جزئياً",
  paid: "مدفوعة",
  voided: "ملغاة",
};

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + Math.max(0, Number(days || 0)));
  return d.toISOString().slice(0, 10);
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
    return suppliers.filter((s) => [s.name, s.code, s.phone, s.contact_person, s.primary_representative?.name].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [search, suppliers]);

  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter((p) => [p.invoice_number, p.supplier_name, p.description].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [search, purchases]);

  const [supplierDialog, setSupplierDialog] = useState(false);
  const [supplierForm, setSupplierForm] = useState<Partial<SupplierCenterSupplier> & { name: string }>({ name: "", active: true, payment_terms_days: 0 });
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierCenterSupplier | null>(null);
  const [supplierSheet, setSupplierSheet] = useState(false);

  const openNewSupplier = () => {
    setSupplierForm({ name: "", active: true, payment_terms_days: 0 });
    setSupplierDialog(true);
  };

  const openEditSupplier = (supplier: SupplierCenterSupplier) => {
    setSupplierForm({ ...supplier });
    setSupplierDialog(true);
  };

  const saveSupplier = async () => {
    if (!supplierForm.name.trim()) return toast.error("اسم المورد مطلوب");
    try {
      await execute(() => saveSupplierV2(branchId, supplierForm as SupplierCenterSupplier & { name: string }), supplierForm.id ? "تم تحديث المورد" : "تم إضافة المورد");
      setSupplierDialog(false);
    } catch {}
  };

  const [repDialog, setRepDialog] = useState(false);
  const [repSupplier, setRepSupplier] = useState<SupplierCenterSupplier | null>(null);
  const [repForm, setRepForm] = useState<Partial<SupplierRepresentative> & { name: string }>({ name: "", active: true, can_receive_payments: false, is_primary: false });

  const openRepresentative = (supplier: SupplierCenterSupplier, rep?: SupplierRepresentative) => {
    setRepSupplier(supplier);
    setRepForm(rep ? { ...rep } : { name: "", active: true, can_receive_payments: false, is_primary: false });
    setRepDialog(true);
  };

  const saveRepresentative = async () => {
    if (!repSupplier || !repForm.name.trim()) return toast.error("اسم المندوب مطلوب");
    try {
      await execute(() => saveSupplierRepresentativeV2(branchId, repSupplier.id, repForm), "تم حفظ بيانات المندوب");
      setRepDialog(false);
    } catch {}
  };

  const ledgerQuery = useQuery({
    queryKey: ["supplierLedgerV1", branchId, selectedSupplier?.id],
    queryFn: () => fetchSupplierLedgerV1(branchId, selectedSupplier!.id),
    enabled: supplierSheet && Boolean(selectedSupplier?.id),
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
    resetPurchase();
    if (supplierId) {
      const supplier = suppliers.find((s) => s.id === supplierId);
      setPurchaseSupplierId(supplierId);
      setDueDate(addDays(today, supplier?.payment_terms_days || 0));
    }
    setPurchaseDialog(true);
  };

  const purchaseSupplier = suppliers.find((s) => s.id === purchaseSupplierId);
  const supplierReps = representatives.filter((r) => r.supplier_id === purchaseSupplierId && r.active);

  const purchaseProductResults = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || String(p.barcode || "").includes(q))
      .slice(0, 12);
  }, [productSearch, products]);

  const addProduct = (product: ProductRow) => {
    const existing = draftLines.findIndex((l) => l.product_id === product.id);
    if (existing >= 0) {
      setDraftLines((lines) => lines.map((line, i) => i === existing ? { ...line, quantity: Number(line.quantity) + 1 } : line));
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

  const updateLine = (index: number, patch: Partial<DraftLine>) => setDraftLines((lines) => lines.map((line, i) => i === index ? { ...line, ...patch } : line));
  const removeLine = (index: number) => setDraftLines((lines) => lines.filter((_, i) => i !== index));
  const draftTotal = draftLines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.price || 0), 0);

  const sourceOptions = [
    ...(center?.payment_sources.cash_accounts || []).map((x) => ({ ...x, key: `cash_account:${x.id}`, kind: "cash_account" as const })),
    ...(center?.payment_sources.payment_accounts || []).map((x) => ({ ...x, key: `payment_account:${x.id}`, kind: "payment_account" as const })),
  ];
  const selectedInitialSource = sourceOptions.find((s) => s.key === initialSource);

  const submitPurchase = async () => {
    if (!purchaseSupplierId) return toast.error("اختر المورد");
    if (!draftLines.length) return toast.error("أضف صنفاً واحداً على الأقل");
    if (draftLines.some((l) => Number(l.quantity) <= 0 || Number(l.price) < 0)) return toast.error("راجع الكمية وسعر الشراء");
    if (draftLines.some((l) => l.track_expiry && !l.expiry_date)) return toast.error("أدخل تاريخ الصلاحية للأصناف التي تتطلب ذلك");
    const payment = Number(initialPayment || 0);
    if (payment < 0 || payment > draftTotal) return toast.error("قيمة الدفعة الأولى غير صحيحة");
    if (payment > 0 && !initialSource) return toast.error("اختر مصدر الدفعة الأولى");
    const [sourceKind, sourceAccountId] = initialSource ? initialSource.split(":") : ["", ""];
    try {
      await execute(() => createPurchaseV2(branchId, {
        supplier_id: purchaseSupplierId,
        invoice_number: invoiceNumber,
        date: invoiceDate,
        due_date: dueDate,
        description: purchaseNote,
        items: draftLines.map(({ product_name: _n, barcode: _b, track_expiry: _e, unit_of_measure: _u, ...line }) => ({ ...line, quantity: Number(line.quantity), price: Number(line.price), sale_price: line.sale_price == null ? null : Number(line.sale_price) })),
        initial_payment: payment,
        payment_source_kind: payment > 0 ? sourceKind as "cash_account" | "payment_account" : null,
        payment_source_account_id: payment > 0 ? sourceAccountId : null,
        representative_id: initialRepresentative || null,
        provider_reference: initialReference || null,
        update_sale_prices: updateSalePrices,
      }), "تم ترحيل فاتورة الشراء وتحديث المخزون بنجاح");
      setPurchaseDialog(false);
      resetPurchase();
    } catch {}
  };

  const [purchaseSheet, setPurchaseSheet] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<SupplierPurchaseRow | null>(null);
  const openPurchaseDetails = (purchase: SupplierPurchaseRow) => { setSelectedPurchase(purchase); setPurchaseSheet(true); };

  const [paymentDialog, setPaymentDialog] = useState(false);
  const [paymentSupplierId, setPaymentSupplierId] = useState("");
  const [paymentPurchaseId, setPaymentPurchaseId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentSource, setPaymentSource] = useState("");
  const [paymentRep, setPaymentRep] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const openPayment = (supplierId: string, purchase?: SupplierPurchaseRow) => {
    setPaymentSupplierId(supplierId);
    setPaymentPurchaseId(purchase?.id || "");
    setPaymentAmount(purchase ? String(purchase.outstanding) : "");
    setPaymentSource("");
    setPaymentRep("");
    setPaymentReference("");
    setPaymentNote("");
    setPaymentDialog(true);
  };

  const paymentSupplier = suppliers.find((s) => s.id === paymentSupplierId);
  const paymentPurchase = purchases.find((p) => p.id === paymentPurchaseId);
  const paymentReps = representatives.filter((r) => r.supplier_id === paymentSupplierId && r.active && r.can_receive_payments);
  const selectedPaymentSource = sourceOptions.find((s) => s.key === paymentSource);
  const expectedFee = selectedPaymentSource?.kind === "payment_account"
    ? selectedPaymentSource.fee_type === "percent" ? Number(paymentAmount || 0) * Number(selectedPaymentSource.fee_value || 0) / 100
      : selectedPaymentSource.fee_type === "fixed" ? Number(selectedPaymentSource.fee_value || 0) : 0
    : 0;

  const submitPayment = async () => {
    const amount = Number(paymentAmount || 0);
    if (!paymentSupplierId || amount <= 0 || !paymentSource) return toast.error("راجع المورد والمبلغ ومصدر الدفع");
    if (paymentPurchase && amount > paymentPurchase.outstanding) return toast.error("المبلغ أكبر من المتبقي على الفاتورة");
    const [sourceKind, sourceAccountId] = paymentSource.split(":");
    try {
      await execute(() => paySupplierV2(branchId, {
        supplier_id: paymentSupplierId,
        purchase_id: paymentPurchaseId || null,
        source_kind: sourceKind as "cash_account" | "payment_account",
        source_account_id: sourceAccountId,
        amount,
        representative_id: paymentRep || null,
        provider_reference: paymentReference || null,
        note: paymentNote || null,
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
    setReturnPurchase(purchase);
    setReturnQuantities({});
    setReturnReason("");
    setReturnNote("");
    setReturnDialog(true);
  };

  const submitReturn = async () => {
    if (!returnPurchase || !returnReason.trim()) return toast.error("اكتب سبب المرتجع");
    const items = returnPurchase.items
      .map((item) => ({ purchase_item_id: item.id, quantity: Number(returnQuantities[item.id] || 0) }))
      .filter((item) => item.quantity > 0);
    if (!items.length) return toast.error("حدد كمية مرتجع لصنف واحد على الأقل");
    try {
      await execute(() => createSupplierReturnV2(returnPurchase.id, items, returnReason, returnNote), "تم تنفيذ مرتجع المورد وتحديث المخزون والـLedger");
      setReturnDialog(false);
    } catch {}
  };

  const voidPayment = async (payment: SupplierPaymentRow) => {
    const reason = window.prompt("سبب إلغاء الدفعة:");
    if (!reason?.trim()) return;
    try { await execute(() => voidSupplierPaymentV2(payment.id, reason), "تم عكس دفعة المورد بأمان"); } catch {}
  };

  const voidPurchase = async (purchase: SupplierPurchaseRow) => {
    const reason = window.prompt("سبب إلغاء فاتورة الشراء:");
    if (!reason?.trim()) return;
    if (!window.confirm("سيتم عكس المخزون ومديونية المورد. هل تريد المتابعة؟")) return;
    try { await execute(() => voidPurchaseV2(purchase.id, reason), "تم إلغاء الفاتورة وعكس آثارها بأمان"); } catch {}
  };

  if (!branchId) {
    return <Card><CardContent className="p-8 text-center text-muted-foreground">اختر فرعاً أولاً لفتح مركز الموردين والمشتريات.</CardContent></Card>;
  }

  if (centerQuery.isLoading) {
    return <div className="flex min-h-[420px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-[#005931]" /></div>;
  }

  if (centerQuery.isError || !center) {
    return <Card className="border-red-200 bg-red-50"><CardContent className="p-6 text-center"><CircleAlert className="mx-auto mb-2 h-7 w-7 text-red-600" /><p className="font-bold text-red-800">تعذر تحميل مركز الموردين والمشتريات</p><Button variant="outline" className="mt-4" onClick={() => centerQuery.refetch()}>إعادة المحاولة</Button></CardContent></Card>;
  }

  const tabs: Array<{ key: TabKey; label: string; icon: typeof Truck; count?: number }> = [
    { key: "overview", label: "نظرة عامة", icon: ShieldCheck },
    { key: "suppliers", label: "الموردون", icon: UsersRound, count: suppliers.length },
    { key: "purchases", label: "فواتير الشراء", icon: ReceiptText, count: purchases.filter((p) => p.status === "posted").length },
    { key: "payments", label: "المدفوعات", icon: HandCoins, count: center.recent_payments.length },
    { key: "returns", label: "المرتجعات", icon: RotateCcw, count: center.recent_returns.length },
  ];

  return (
    <div dir="rtl" className="space-y-5">
      <section className="overflow-hidden rounded-[28px] bg-[#005931] p-5 text-white shadow-[0_18px_50px_rgba(0,89,49,.20)] md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/12"><Truck className="h-6 w-6" /></div>
            <div><h1 className="text-2xl font-black md:text-3xl">مركز الموردين والمشتريات</h1><p className="mt-1 max-w-2xl text-sm text-emerald-100">من فاتورة المورد إلى المخزون والسداد والمرتجع وكشف الحساب — كل حركة مترابطة ومُرحّلة على الـLedger.</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {permissions?.can_manage_purchases && <Button onClick={() => openPurchase()} className="bg-white text-[#005931] hover:bg-emerald-50"><PackagePlus className="ml-2 h-4 w-4" />فاتورة شراء جديدة</Button>}
            {permissions?.can_manage_purchases && <Button onClick={openNewSupplier} variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"><UserRoundPlus className="ml-2 h-4 w-4" />مورد جديد</Button>}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {tabs.map((item) => <button key={item.key} onClick={() => setTab(item.key)} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${tab === item.key ? "bg-white text-[#005931]" : "bg-white/10 text-white hover:bg-white/20"}`}><item.icon className="h-4 w-4" />{item.label}{item.count != null && <span className={`rounded-full px-2 py-0.5 text-[11px] ${tab === item.key ? "bg-emerald-50" : "bg-white/10"}`}>{item.count}</span>}</button>)}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={BadgeDollarSign} label="مستحق للموردين" value={money(center.summary.payable_total)} note="من الـSupplier Ledger" />
        <Metric icon={WalletCards} label="رصيد لصالحنا" value={money(center.summary.supplier_credit_total)} note="دفعات مقدمة/أرصدة دائنة" />
        <Metric icon={FileText} label="فواتير مفتوحة" value={String(center.summary.open_purchases)} note="تحتاج سداداً" />
        <Metric icon={CalendarClock} label="متأخرة" value={String(center.summary.overdue_purchases)} note="تجاوزت تاريخ الاستحقاق" danger={center.summary.overdue_purchases > 0} />
        <Metric icon={ReceiptText} label="مشتريات الشهر" value={money(center.summary.month_purchases)} note={`${center.summary.active_suppliers} مورد نشط`} />
      </div>

      {Number(center.summary.legacy_unassigned_purchases || 0) > 0 && <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><CircleAlert className="h-5 w-5 shrink-0" /><div><b>يوجد {center.summary.legacy_unassigned_purchases} فاتورة تاريخية بدون فرع.</b> تم إبقاؤها كبيانات Legacy ولم يتم تعديلها تلقائياً.</div></div>}

      {(tab === "suppliers" || tab === "purchases") && <Card className="border-0 shadow-sm ring-1 ring-slate-200"><CardContent className="p-3 md:p-4"><div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tab === "suppliers" ? "ابحث باسم المورد، الكود، الهاتف أو المندوب..." : "ابحث برقم الفاتورة أو المورد أو الوصف..."} className="h-11 pr-10" /></div></CardContent></Card>}

      {tab === "overview" && <Overview center={center} purchases={purchases} onOpenPurchase={openPurchaseDetails} onPay={openPayment} setTab={setTab} />}
      {tab === "suppliers" && <SuppliersTable suppliers={filteredSuppliers} onOpen={(s) => { setSelectedSupplier(s); setSupplierSheet(true); }} onEdit={openEditSupplier} onRep={openRepresentative} onPurchase={(s) => openPurchase(s.id)} onPay={(s) => openPayment(s.id)} canFinance={Boolean(permissions?.can_manage_finance)} />}
      {tab === "purchases" && <PurchasesTable purchases={filteredPurchases} onOpen={openPurchaseDetails} onPay={openPayment} onReturn={openReturn} onVoid={voidPurchase} canFinance={Boolean(permissions?.can_manage_finance)} canManage={Boolean(permissions?.can_manage_purchases)} />}
      {tab === "payments" && <PaymentsTable rows={center.recent_payments} onVoid={voidPayment} canFinance={Boolean(permissions?.can_manage_finance)} />}
      {tab === "returns" && <ReturnsTable rows={center.recent_returns} />}

      <Dialog open={supplierDialog} onOpenChange={setSupplierDialog}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl" dir="rtl"><DialogHeader><DialogTitle>{supplierForm.id ? "تعديل بيانات المورد" : "إضافة مورد جديد"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <Field label="اسم المورد / الشركة *"><Input value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} /></Field>
            <Field label="كود المورد"><Input value={supplierForm.code || ""} onChange={(e) => setSupplierForm({ ...supplierForm, code: e.target.value })} /></Field>
            <Field label="جهة الاتصال"><Input value={supplierForm.contact_person || ""} onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })} /></Field>
            <Field label="رقم الهاتف"><Input value={supplierForm.phone || ""} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></Field>
            <Field label="البريد الإلكتروني"><Input type="email" value={supplierForm.email || ""} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} /></Field>
            <Field label="العنوان"><Input value={supplierForm.address || ""} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} /></Field>
            <Field label="الرقم الضريبي"><Input value={supplierForm.tax_number || ""} onChange={(e) => setSupplierForm({ ...supplierForm, tax_number: e.target.value })} /></Field>
            <Field label="السجل التجاري"><Input value={supplierForm.commercial_registration || ""} onChange={(e) => setSupplierForm({ ...supplierForm, commercial_registration: e.target.value })} /></Field>
            <Field label="أجل السداد (يوم)"><Input type="number" min="0" value={supplierForm.payment_terms_days || 0} onChange={(e) => setSupplierForm({ ...supplierForm, payment_terms_days: Number(e.target.value) })} /></Field>
            <Field label="حد الائتمان"><Input type="number" min="0" value={supplierForm.credit_limit ?? ""} onChange={(e) => setSupplierForm({ ...supplierForm, credit_limit: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
            <div className="md:col-span-2"><Field label="ملاحظات"><Textarea value={supplierForm.notes || ""} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })} /></Field></div>
            {supplierForm.id && <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={supplierForm.active ?? true} onChange={(e) => setSupplierForm({ ...supplierForm, active: e.target.checked })} /> المورد نشط</label>}
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setSupplierDialog(false)}>إلغاء</Button><Button disabled={busy} onClick={saveSupplier}>حفظ المورد</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={repDialog} onOpenChange={setRepDialog}>
        <DialogContent className="sm:max-w-xl" dir="rtl"><DialogHeader><DialogTitle>مندوب المورد — {repSupplier?.name}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <Field label="اسم المندوب *"><Input value={repForm.name} onChange={(e) => setRepForm({ ...repForm, name: e.target.value })} /></Field>
            <Field label="المسمى / الدور"><Input value={repForm.role_title || ""} onChange={(e) => setRepForm({ ...repForm, role_title: e.target.value })} placeholder="مندوب مبيعات / مشرف..." /></Field>
            <Field label="الهاتف"><Input value={repForm.phone || ""} onChange={(e) => setRepForm({ ...repForm, phone: e.target.value })} /></Field>
            <Field label="حد استلام الدفعة"><Input type="number" min="0" value={repForm.payment_limit ?? ""} onChange={(e) => setRepForm({ ...repForm, payment_limit: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
            <Field label="طريقة التحويل للمندوب"><Input value={repForm.payout_method || ""} onChange={(e) => setRepForm({ ...repForm, payout_method: e.target.value })} placeholder="نقدي / فودافون كاش..." /></Field>
            <Field label="رقم/وجهة التحويل"><Input value={repForm.payout_destination || ""} onChange={(e) => setRepForm({ ...repForm, payout_destination: e.target.value })} /></Field>
            <div className="md:col-span-2"><Field label="ملاحظات"><Textarea value={repForm.notes || ""} onChange={(e) => setRepForm({ ...repForm, notes: e.target.value })} /></Field></div>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={repForm.can_receive_payments ?? false} onChange={(e) => setRepForm({ ...repForm, can_receive_payments: e.target.checked })} /> مصرح له باستلام مدفوعات</label>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={repForm.is_primary ?? false} onChange={(e) => setRepForm({ ...repForm, is_primary: e.target.checked })} /> المندوب الأساسي</label>
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setRepDialog(false)}>إلغاء</Button><Button disabled={busy} onClick={saveRepresentative}>حفظ المندوب</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={purchaseDialog} onOpenChange={setPurchaseDialog}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-6xl" dir="rtl"><DialogHeader><DialogTitle className="text-xl">فاتورة شراء جديدة</DialogTitle></DialogHeader>
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              <Card><CardContent className="grid gap-3 p-4 md:grid-cols-2">
                <Field label="المورد *"><Select value={purchaseSupplierId} onValueChange={(value) => { setPurchaseSupplierId(value); const s = suppliers.find((x) => x.id === value); setDueDate(addDays(invoiceDate, s?.payment_terms_days || 0)); }}><SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger><SelectContent>{suppliers.filter((s) => s.active).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="رقم فاتورة المورد"><Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="سيتم توليد رقم داخلي لو تُرك فارغاً" /></Field>
                <Field label="تاريخ الفاتورة"><Input type="date" value={invoiceDate} onChange={(e) => { setInvoiceDate(e.target.value); setDueDate(addDays(e.target.value, purchaseSupplier?.payment_terms_days || 0)); }} /></Field>
                <Field label="تاريخ الاستحقاق"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
              </CardContent></Card>

              <Card><CardHeader className="pb-3"><CardTitle className="text-base">إضافة الأصناف</CardTitle></CardHeader><CardContent className="space-y-3">
                <div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input autoFocus value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="امسح الباركود أو اكتب اسم المنتج..." className="h-11 pr-10" /></div>
                {purchaseProductResults.length > 0 && <div className="grid gap-2 rounded-2xl border bg-white p-2 md:grid-cols-2">{purchaseProductResults.map((p) => <button type="button" key={p.id} onClick={() => addProduct(p)} className="flex items-center justify-between rounded-xl border p-3 text-right hover:border-[#005931] hover:bg-emerald-50"><div><div className="font-bold">{p.name}</div><div className="mt-1 text-xs text-muted-foreground">{p.barcode || "بدون باركود"} · مخزون {Number(p.quantity || 0)}</div></div><Plus className="h-4 w-4 text-[#005931]" /></button>)}</div>}
                <div className="space-y-2">{draftLines.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">ابدأ بمسح باركود أو البحث عن منتج.</div> : draftLines.map((line, index) => <div key={line.product_id} className="rounded-2xl border p-3"><div className="mb-3 flex items-start justify-between gap-2"><div><div className="font-bold">{line.product_name}</div><div className="text-xs text-muted-foreground">{line.barcode || "بدون باركود"}{line.unit_of_measure ? ` · ${line.unit_of_measure}` : ""}</div></div><Button variant="ghost" size="icon" onClick={() => removeLine(index)}><X className="h-4 w-4" /></Button></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><Field label="الكمية"><Input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })} /></Field><Field label="سعر الشراء"><Input type="number" min="0" step="0.01" value={line.price} onChange={(e) => updateLine(index, { price: Number(e.target.value) })} /></Field><Field label="سعر البيع"><Input type="number" min="0" step="0.01" value={line.sale_price ?? ""} onChange={(e) => updateLine(index, { sale_price: e.target.value === "" ? null : Number(e.target.value) })} /></Field><div className="flex items-end"><div className="flex h-10 w-full items-center justify-between rounded-md bg-slate-50 px-3 text-sm"><span>الإجمالي</span><b>{money(Number(line.quantity) * Number(line.price))}</b></div></div></div>{line.track_expiry && <div className="mt-3 grid gap-2 sm:grid-cols-3"><Field label="تاريخ الصلاحية *"><Input type="date" value={line.expiry_date || ""} onChange={(e) => updateLine(index, { expiry_date: e.target.value })} /></Field><Field label="رقم التشغيلة"><Input value={line.batch_number || ""} onChange={(e) => updateLine(index, { batch_number: e.target.value })} /></Field><Field label="مكان الرف"><Input value={line.shelf_location || ""} onChange={(e) => updateLine(index, { shelf_location: e.target.value })} /></Field></div>}</div>)}</div>
              </CardContent></Card>
            </div>

            <div className="space-y-4">
              <Card className="sticky top-0"><CardHeader><CardTitle className="text-base">ملخص وترحيل الفاتورة</CardTitle></CardHeader><CardContent className="space-y-4">
                <div className="rounded-2xl bg-slate-950 p-4 text-white"><div className="text-xs text-slate-300">إجمالي الفاتورة</div><div className="mt-1 text-2xl font-black">{money(draftTotal)}</div><div className="mt-2 text-xs text-slate-400">{draftLines.length} صنف</div></div>
                <Field label="دفعة أولى"><Input type="number" min="0" max={draftTotal} step="0.01" value={initialPayment} onChange={(e) => setInitialPayment(e.target.value)} /></Field>
                {Number(initialPayment || 0) > 0 && <><Field label="مصدر الدفع *"><Select value={initialSource} onValueChange={setInitialSource}><SelectTrigger><SelectValue placeholder="اختر الخزنة أو المحفظة" /></SelectTrigger><SelectContent>{sourceOptions.map((s) => <SelectItem key={s.key} value={s.key}>{s.name} — {money(s.balance)}</SelectItem>)}</SelectContent></Select></Field>{selectedInitialSource?.kind === "payment_account" && <Field label="مرجع العملية"><Input value={initialReference} onChange={(e) => setInitialReference(e.target.value)} placeholder={selectedInitialSource.require_reference ? "مطلوب حسب وسيلة الدفع" : "اختياري"} /></Field>}<Field label="المندوب المستلم"><Select value={initialRepresentative || "none"} onValueChange={(v) => setInitialRepresentative(v === "none" ? "" : v)}><SelectTrigger><SelectValue placeholder="بدون مندوب" /></SelectTrigger><SelectContent><SelectItem value="none">بدون مندوب</SelectItem>{supplierReps.filter((r) => r.can_receive_payments).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select></Field></>}
                {permissions?.can_manage_pricing && <label className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm"><input type="checkbox" className="mt-1" checked={updateSalePrices} onChange={(e) => setUpdateSalePrices(e.target.checked)} /><span><b>تحديث أسعار البيع</b><br/><span className="text-xs text-muted-foreground">ترحيل أسعار البيع المُدخلة لمصدر التسعير الصحيح للفرع.</span></span></label>}
                <Field label="ملاحظات الفاتورة"><Textarea value={purchaseNote} onChange={(e) => setPurchaseNote(e.target.value)} rows={3} /></Field>
                <div className="rounded-xl border p-3 text-xs text-muted-foreground"><b className="text-foreground">الترحيل Atomic:</b> الفاتورة + الأصناف + المخزون + الـbatch + المديونية + الدفعة الأولى تُنفذ كعملية واحدة أو لا يُحفظ شيء.</div>
                <Button disabled={busy || draftLines.length === 0} onClick={submitPurchase} className="h-12 w-full text-base font-black"><ReceiptText className="ml-2 h-5 w-5" />ترحيل فاتورة الشراء</Button>
              </CardContent></Card>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent className="sm:max-w-xl" dir="rtl"><DialogHeader><DialogTitle>سداد مورد</DialogTitle></DialogHeader><div className="space-y-4 py-2">
          <div className="rounded-2xl bg-slate-50 p-4"><div className="font-black">{paymentSupplier?.name}</div><div className="mt-1 text-sm text-muted-foreground">{paymentPurchase ? `فاتورة ${paymentPurchase.invoice_number} · متبقي ${money(paymentPurchase.outstanding)}` : `دفعة على الحساب · الرصيد ${money(paymentSupplier?.branch_balance)}`}</div></div>
          <Field label="المبلغ *"><Input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} /></Field>
          <Field label="مصدر الدفع *"><Select value={paymentSource} onValueChange={setPaymentSource}><SelectTrigger><SelectValue placeholder="الخزنة / العهدة / المحفظة" /></SelectTrigger><SelectContent>{sourceOptions.map((s) => <SelectItem key={s.key} value={s.key}>{s.name} — رصيد {money(s.balance)}</SelectItem>)}</SelectContent></Select></Field>
          {selectedPaymentSource?.kind === "payment_account" && <div className="rounded-xl border bg-slate-50 p-3 text-sm"><div className="flex justify-between"><span>العمولة المتوقعة</span><b>{money(expectedFee)}</b></div>{selectedPaymentSource.fee_type && <div className="mt-1 text-xs text-muted-foreground">{selectedPaymentSource.method_name || selectedPaymentSource.name} · {selectedPaymentSource.fee_type === "percent" ? `${selectedPaymentSource.fee_value}%` : money(selectedPaymentSource.fee_value)}</div>}</div>}
          <Field label="المندوب المستلم"><Select value={paymentRep || "none"} onValueChange={(v) => setPaymentRep(v === "none" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">بدون مندوب</SelectItem>{paymentReps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}{r.payment_limit ? ` · حد ${money(r.payment_limit)}` : ""}</SelectItem>)}</SelectContent></Select></Field>
          {selectedPaymentSource?.kind === "payment_account" && <Field label="مرجع العملية"><Input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} /></Field>}
          <Field label="ملاحظة"><Textarea value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} /></Field>
        </div><DialogFooter className="gap-2"><Button variant="outline" onClick={() => setPaymentDialog(false)}>إلغاء</Button><Button disabled={busy} onClick={submitPayment}><HandCoins className="ml-2 h-4 w-4" />تأكيد السداد</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={returnDialog} onOpenChange={setReturnDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" dir="rtl"><DialogHeader><DialogTitle>مرتجع إلى المورد — {returnPurchase?.invoice_number}</DialogTitle></DialogHeader><div className="space-y-3 py-2">
          {returnPurchase?.items.map((item) => { const available = Number(item.quantity) - Number(item.returned_quantity || 0); return <div key={item.id} className="grid items-end gap-3 rounded-2xl border p-3 sm:grid-cols-[1fr_160px]"><div><div className="font-bold">{item.product_name}</div><div className="mt-1 text-xs text-muted-foreground">المشتراة {item.quantity} · تم رد {item.returned_quantity || 0} · المتاح للرد {available}</div></div><Field label="كمية المرتجع"><Input type="number" min="0" max={available} step="0.001" value={returnQuantities[item.id] || ""} onChange={(e) => setReturnQuantities({ ...returnQuantities, [item.id]: e.target.value })} /></Field></div>; })}
          <Field label="سبب المرتجع *"><Input value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="تالف / صلاحية / خطأ توريد..." /></Field><Field label="ملاحظات"><Textarea value={returnNote} onChange={(e) => setReturnNote(e.target.value)} /></Field>
        </div><DialogFooter className="gap-2"><Button variant="outline" onClick={() => setReturnDialog(false)}>إلغاء</Button><Button disabled={busy} onClick={submitReturn}><RotateCcw className="ml-2 h-4 w-4" />تنفيذ المرتجع</Button></DialogFooter></DialogContent>
      </Dialog>

      <Sheet open={supplierSheet} onOpenChange={setSupplierSheet}><SheetContent className="w-full overflow-y-auto sm:max-w-2xl" side="left" dir="rtl"><SheetHeader><SheetTitle>ملف المورد</SheetTitle></SheetHeader>{selectedSupplier && <div className="space-y-5 py-5">
        <div className="rounded-3xl bg-[#005931] p-5 text-white"><div className="flex items-start justify-between"><div><div className="text-xl font-black">{selectedSupplier.name}</div><div className="mt-1 text-sm text-emerald-100">{selectedSupplier.code || "بدون كود"}</div></div><Badge className={selectedSupplier.active ? "bg-white text-[#005931]" : "bg-red-100 text-red-700"}>{selectedSupplier.active ? "نشط" : "موقوف"}</Badge></div><div className="mt-5 grid grid-cols-2 gap-3"><MiniStat label="رصيد الفرع" value={money(selectedSupplier.branch_balance)} /><MiniStat label="فواتير مفتوحة" value={String(selectedSupplier.open_invoices)} /></div></div>
        <div className="grid gap-3 sm:grid-cols-2"><Info label="الهاتف" value={selectedSupplier.phone} /><Info label="جهة الاتصال" value={selectedSupplier.contact_person} /><Info label="الرقم الضريبي" value={selectedSupplier.tax_number} /><Info label="أجل السداد" value={`${selectedSupplier.payment_terms_days || 0} يوم`} /></div>
        <div><div className="mb-2 flex items-center justify-between"><h3 className="font-black">المندوبون</h3><Button size="sm" variant="outline" onClick={() => openRepresentative(selectedSupplier)}><Plus className="ml-1 h-4 w-4" />مندوب</Button></div><div className="space-y-2">{representatives.filter((r) => r.supplier_id === selectedSupplier.id).map((r) => <button key={r.id} onClick={() => openRepresentative(selectedSupplier, r)} className="flex w-full items-center justify-between rounded-xl border p-3 text-right hover:bg-slate-50"><div><b>{r.name}</b><div className="text-xs text-muted-foreground">{r.role_title || "مندوب"} · {r.phone || "بدون هاتف"}</div></div><div className="flex gap-1">{r.is_primary && <Badge variant="outline">أساسي</Badge>}{r.can_receive_payments && <Badge className="bg-emerald-100 text-emerald-800">يستلم دفعات</Badge>}</div></button>)}</div></div>
        <div><h3 className="mb-2 font-black">كشف الحساب</h3>{ledgerQuery.isLoading ? <div className="p-6 text-center text-sm text-muted-foreground">جاري التحميل...</div> : <div className="space-y-2">{(ledgerQuery.data?.entries || []).slice(0, 30).map((entry) => <div key={entry.id} className="flex items-start justify-between gap-3 rounded-xl border p-3"><div><div className="font-bold">{entry.description || entry.entry_type}</div><div className="mt-1 text-xs text-muted-foreground">{dateText(entry.created_at)}{entry.invoice_number ? ` · ${entry.invoice_number}` : ""}{entry.representative_name ? ` · ${entry.representative_name}` : ""}</div></div><div className={`font-black ${Number(entry.signed_amount) > 0 ? "text-red-700" : "text-emerald-700"}`}>{Number(entry.signed_amount) > 0 ? "+" : ""}{money(entry.signed_amount)}</div></div>)}</div>}</div>
        <div className="flex flex-wrap gap-2"><Button onClick={() => openPurchase(selectedSupplier.id)}><PackagePlus className="ml-2 h-4 w-4" />فاتورة شراء</Button>{permissions?.can_manage_finance && <Button variant="outline" onClick={() => openPayment(selectedSupplier.id)}><HandCoins className="ml-2 h-4 w-4" />دفعة على الحساب</Button>}<Button variant="outline" onClick={() => openEditSupplier(selectedSupplier)}><Pencil className="ml-2 h-4 w-4" />تعديل الملف</Button></div>
      </div>}</SheetContent></Sheet>

      <Sheet open={purchaseSheet} onOpenChange={setPurchaseSheet}><SheetContent className="w-full overflow-y-auto sm:max-w-2xl" side="left" dir="rtl"><SheetHeader><SheetTitle>تفاصيل فاتورة الشراء</SheetTitle></SheetHeader>{selectedPurchase && <div className="space-y-5 py-5"><div className="rounded-3xl bg-slate-950 p-5 text-white"><div className="flex justify-between gap-3"><div><div className="text-xl font-black">{selectedPurchase.invoice_number}</div><div className="mt-1 text-sm text-slate-300">{selectedPurchase.supplier_name} · {dateText(selectedPurchase.date)}</div></div><StatusBadge purchase={selectedPurchase} /></div><div className="mt-5 grid grid-cols-3 gap-2"><MiniStat label="الإجمالي" value={money(selectedPurchase.total)} /><MiniStat label="المدفوع" value={money(selectedPurchase.paid)} /><MiniStat label="المتبقي" value={money(selectedPurchase.outstanding)} /></div></div><div className="space-y-2">{selectedPurchase.items.map((item) => <div key={item.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><b>{item.product_name}</b><div className="mt-1 text-xs text-muted-foreground">{item.quantity} × {money(item.price)}{item.expiry_date ? ` · صلاحية ${dateText(item.expiry_date)}` : ""}</div></div><b>{money(item.total)}</b></div>{item.returned_quantity > 0 && <Badge variant="outline" className="mt-2">مرتجع {item.returned_quantity}</Badge>}</div>)}</div><div className="grid gap-3 sm:grid-cols-2"><Info label="تاريخ الاستحقاق" value={dateText(selectedPurchase.due_date)} /><Info label="المخزون الفعلي" value={selectedPurchase.inventory_branch_id ? "مرتبط بمصدر مخزون الفرع" : "—"} /></div>{selectedPurchase.description && <div className="rounded-xl bg-slate-50 p-3 text-sm">{selectedPurchase.description}</div>}<div className="flex flex-wrap gap-2">{selectedPurchase.status === "posted" && selectedPurchase.outstanding > 0 && permissions?.can_manage_finance && <Button onClick={() => openPayment(selectedPurchase.supplier_id, selectedPurchase)}><HandCoins className="ml-2 h-4 w-4" />سداد</Button>}{selectedPurchase.status === "posted" && <Button variant="outline" onClick={() => openReturn(selectedPurchase)}><RotateCcw className="ml-2 h-4 w-4" />مرتجع مورد</Button>}{selectedPurchase.status === "posted" && permissions?.can_manage_purchases && <Button variant="outline" className="text-red-700" onClick={() => voidPurchase(selectedPurchase)}><Trash2 className="ml-2 h-4 w-4" />إلغاء الفاتورة</Button>}</div></div>}</SheetContent></Sheet>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label className="text-xs font-bold text-slate-600">{label}</Label>{children}</div>; }

function Metric({ icon: Icon, label, value, note, danger = false }: { icon: typeof Truck; label: string; value: string; note: string; danger?: boolean }) { return <Card className={`border-0 shadow-sm ring-1 ${danger ? "ring-red-200" : "ring-slate-200"}`}><CardContent className="p-4"><div className="flex items-start justify-between"><div><div className="text-xs font-bold text-slate-500">{label}</div><div className={`mt-2 text-xl font-black ${danger ? "text-red-700" : "text-slate-950"}`}>{value}</div><div className="mt-1 text-[11px] text-slate-400">{note}</div></div><div className={`rounded-xl p-2 ${danger ? "bg-red-50 text-red-700" : "bg-emerald-50 text-[#005931]"}`}><Icon className="h-5 w-5" /></div></div></CardContent></Card>; }
function MiniStat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-white/10 p-3"><div className="text-[10px] opacity-70">{label}</div><div className="mt-1 font-black">{value}</div></div>; }
function Info({ label, value }: { label: string; value?: string | null }) { return <div className="rounded-xl border bg-white p-3"><div className="text-[10px] font-bold text-slate-400">{label}</div><div className="mt-1 text-sm font-bold">{value || "—"}</div></div>; }

function StatusBadge({ purchase }: { purchase: SupplierPurchaseRow }) {
  if (purchase.status === "voided") return <Badge className="bg-slate-200 text-slate-700">ملغاة</Badge>;
  if (purchase.overdue) return <Badge className="bg-red-100 text-red-800">متأخرة</Badge>;
  if (purchase.payment_status === "paid") return <Badge className="bg-emerald-100 text-emerald-800">مدفوعة</Badge>;
  if (purchase.payment_status === "partial") return <Badge className="bg-amber-100 text-amber-800">جزئي</Badge>;
  return <Badge variant="outline">غير مدفوعة</Badge>;
}

function Overview({ center, purchases, onOpenPurchase, onPay, setTab }: { center: ReturnType<typeof useCenterShape>; purchases: SupplierPurchaseRow[]; onOpenPurchase: (p: SupplierPurchaseRow) => void; onPay: (supplierId: string, p?: SupplierPurchaseRow) => void; setTab: (tab: TabKey) => void }) {
  const urgent = purchases.filter((p) => p.status === "posted" && (p.overdue || p.outstanding > 0)).slice(0, 8);
  return <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]"><Card className="border-0 shadow-sm ring-1 ring-slate-200"><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-lg">فواتير تحتاج متابعة</CardTitle><Button size="sm" variant="ghost" onClick={() => setTab("purchases")}>عرض الكل<ChevronLeft className="mr-1 h-4 w-4" /></Button></CardHeader><CardContent className="space-y-2">{urgent.length === 0 ? <div className="rounded-2xl bg-emerald-50 p-8 text-center text-sm text-emerald-800">لا توجد فواتير مفتوحة تحتاج متابعة حالياً.</div> : urgent.map((p) => <div key={p.id} className="flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between"><button className="text-right" onClick={() => onOpenPurchase(p)}><div className="flex items-center gap-2"><b>{p.invoice_number}</b><StatusBadge purchase={p} /></div><div className="mt-1 text-xs text-muted-foreground">{p.supplier_name} · استحقاق {dateText(p.due_date)}</div></button><div className="flex items-center gap-3"><div className="text-left"><div className="text-[10px] text-muted-foreground">المتبقي</div><b>{money(p.outstanding)}</b></div>{p.outstanding > 0 && <Button size="sm" onClick={() => onPay(p.supplier_id, p)}>سداد</Button>}</div></div>)}</CardContent></Card><Card className="border-0 shadow-sm ring-1 ring-slate-200"><CardHeader><CardTitle className="text-lg">مصادر سداد الموردين</CardTitle></CardHeader><CardContent className="space-y-2">{[...(center.payment_sources?.cash_accounts || []), ...(center.payment_sources?.payment_accounts || [])].map((s: any) => <div key={s.id} className="flex items-center justify-between rounded-xl border p-3"><div className="flex items-center gap-2">{s.provider_code ? <WalletCards className="h-4 w-4 text-[#005931]" /> : <Banknote className="h-4 w-4 text-[#005931]" />}<div><div className="text-sm font-bold">{s.name}</div><div className="text-[10px] text-muted-foreground">{s.method_name || s.account_type || "حساب مالي"}</div></div></div><b>{money(s.balance)}</b></div>)}</CardContent></Card></div>;
}
function useCenterShape() { return {} as any; }

function SuppliersTable({ suppliers, onOpen, onEdit, onRep, onPurchase, onPay, canFinance }: { suppliers: SupplierCenterSupplier[]; onOpen: (s: SupplierCenterSupplier) => void; onEdit: (s: SupplierCenterSupplier) => void; onRep: (s: SupplierCenterSupplier) => void; onPurchase: (s: SupplierCenterSupplier) => void; onPay: (s: SupplierCenterSupplier) => void; canFinance: boolean }) {
  return <Card className="border-0 shadow-sm ring-1 ring-slate-200"><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>المورد</TableHead><TableHead>التواصل</TableHead><TableHead>المندوب الأساسي</TableHead><TableHead>رصيد الفرع</TableHead><TableHead>الفواتير المفتوحة</TableHead><TableHead>آخر شراء</TableHead><TableHead>إجراءات</TableHead></TableRow></TableHeader><TableBody>{suppliers.map((s) => <TableRow key={s.id} className={!s.active ? "opacity-60" : ""}><TableCell><button onClick={() => onOpen(s)} className="text-right"><div className="font-black">{s.name}</div><div className="text-xs text-muted-foreground">{s.code || "بدون كود"} {!s.active && "· موقوف"}</div></button></TableCell><TableCell><div className="text-sm">{s.phone || "—"}</div><div className="text-xs text-muted-foreground">{s.contact_person || ""}</div></TableCell><TableCell>{s.primary_representative ? <div><b className="text-sm">{s.primary_representative.name}</b><div className="text-xs text-muted-foreground">{s.primary_representative.phone || ""}</div></div> : "—"}</TableCell><TableCell><span className={Number(s.branch_balance) > 0 ? "font-black text-red-700" : Number(s.branch_balance) < 0 ? "font-black text-emerald-700" : "font-bold"}>{money(s.branch_balance)}</span></TableCell><TableCell>{s.open_invoices}</TableCell><TableCell>{dateText(s.last_purchase_at)}</TableCell><TableCell><div className="flex gap-1"><Button title="فتح الملف" variant="ghost" size="icon" onClick={() => onOpen(s)}><History className="h-4 w-4" /></Button><Button title="فاتورة شراء" variant="ghost" size="icon" onClick={() => onPurchase(s)}><PackagePlus className="h-4 w-4" /></Button>{canFinance && <Button title="دفعة" variant="ghost" size="icon" onClick={() => onPay(s)}><HandCoins className="h-4 w-4" /></Button>}<Button title="مندوب" variant="ghost" size="icon" onClick={() => onRep(s)}><UserRoundPlus className="h-4 w-4" /></Button><Button title="تعديل" variant="ghost" size="icon" onClick={() => onEdit(s)}><Pencil className="h-4 w-4" /></Button></div></TableCell></TableRow>)}</TableBody></Table></div>{suppliers.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">لا توجد نتائج.</div>}</CardContent></Card>;
}

function PurchasesTable({ purchases, onOpen, onPay, onReturn, onVoid, canFinance, canManage }: { purchases: SupplierPurchaseRow[]; onOpen: (p: SupplierPurchaseRow) => void; onPay: (s: string, p: SupplierPurchaseRow) => void; onReturn: (p: SupplierPurchaseRow) => void; onVoid: (p: SupplierPurchaseRow) => void; canFinance: boolean; canManage: boolean }) {
  return <Card className="border-0 shadow-sm ring-1 ring-slate-200"><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>الفاتورة</TableHead><TableHead>المورد</TableHead><TableHead>التاريخ</TableHead><TableHead>الإجمالي</TableHead><TableHead>المدفوع</TableHead><TableHead>المتبقي</TableHead><TableHead>الحالة</TableHead><TableHead>إجراءات</TableHead></TableRow></TableHeader><TableBody>{purchases.map((p) => <TableRow key={p.id}><TableCell><button className="font-black hover:underline" onClick={() => onOpen(p)}>{p.invoice_number}</button></TableCell><TableCell>{p.supplier_name}</TableCell><TableCell>{dateText(p.date)}</TableCell><TableCell>{money(p.total)}</TableCell><TableCell>{money(p.paid)}</TableCell><TableCell className="font-black">{money(p.outstanding)}</TableCell><TableCell><StatusBadge purchase={p} /></TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => onOpen(p)}><FileText className="h-4 w-4" /></Button>{p.status === "posted" && p.outstanding > 0 && canFinance && <Button variant="ghost" size="icon" onClick={() => onPay(p.supplier_id, p)}><HandCoins className="h-4 w-4" /></Button>}{p.status === "posted" && <Button variant="ghost" size="icon" onClick={() => onReturn(p)}><RotateCcw className="h-4 w-4" /></Button>}{p.status === "posted" && canManage && <Button variant="ghost" size="icon" className="text-red-700" onClick={() => onVoid(p)}><Trash2 className="h-4 w-4" /></Button>}</div></TableCell></TableRow>)}</TableBody></Table></div>{purchases.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">لا توجد فواتير مطابقة.</div>}</CardContent></Card>;
}

function PaymentsTable({ rows, onVoid, canFinance }: { rows: SupplierPaymentRow[]; onVoid: (p: SupplierPaymentRow) => void; canFinance: boolean }) {
  return <Card className="border-0 shadow-sm ring-1 ring-slate-200"><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>المورد</TableHead><TableHead>الفاتورة</TableHead><TableHead>المصدر</TableHead><TableHead>المبلغ</TableHead><TableHead>العمولة</TableHead><TableHead>المندوب</TableHead><TableHead>الحالة</TableHead><TableHead>إجراء</TableHead></TableRow></TableHeader><TableBody>{rows.map((p) => <TableRow key={p.id}><TableCell>{dateText(p.created_at)}</TableCell><TableCell className="font-bold">{p.supplier_name}</TableCell><TableCell>{p.invoice_number || "على الحساب"}</TableCell><TableCell>{p.source_name}</TableCell><TableCell className="font-black">{money(p.amount)}</TableCell><TableCell>{money(p.actual_fee_amount)}</TableCell><TableCell>{p.representative_name || "—"}</TableCell><TableCell>{p.status === "posted" ? <Badge className="bg-emerald-100 text-emerald-800">مرحلة</Badge> : <Badge variant="outline">معكوسة</Badge>}</TableCell><TableCell>{p.status === "posted" && canFinance && <Button variant="ghost" size="sm" className="text-red-700" onClick={() => onVoid(p)}>عكس</Button>}</TableCell></TableRow>)}</TableBody></Table></div>{rows.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">لا توجد مدفوعات موردين مسجلة.</div>}</CardContent></Card>;
}

function ReturnsTable({ rows }: { rows: any[] }) {
  return <Card className="border-0 shadow-sm ring-1 ring-slate-200"><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>المورد</TableHead><TableHead>الفاتورة</TableHead><TableHead>القيمة</TableHead><TableHead>السبب</TableHead><TableHead>منفذ العملية</TableHead><TableHead>الحالة</TableHead></TableRow></TableHeader><TableBody>{rows.map((r) => <TableRow key={r.id}><TableCell>{dateText(r.created_at)}</TableCell><TableCell className="font-bold">{r.supplier_name}</TableCell><TableCell>{r.invoice_number}</TableCell><TableCell className="font-black">{money(r.total)}</TableCell><TableCell>{r.reason}</TableCell><TableCell>{r.created_by_name || "—"}</TableCell><TableCell><Badge className="bg-amber-100 text-amber-800">{r.status === "posted" ? "مرحّل" : "ملغى"}</Badge></TableCell></TableRow>)}</TableBody></Table></div>{rows.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">لا توجد مرتجعات موردين.</div>}</CardContent></Card>;
}
