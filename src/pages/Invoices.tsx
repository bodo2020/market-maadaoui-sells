import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  FileText,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingBag,
  Truck,
  Undo2,
  UserRound,
  WalletCards,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import InvoiceDialog from "@/components/POS/InvoiceDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBranchStore } from "@/stores/branchStore";
import {
  getPosInvoiceSale,
  listPosInvoicesV2,
  type PosInvoiceListItem,
} from "@/services/supabase/posInvoiceService";
import {
  fetchSupplierPurchaseCenterV2,
  type SupplierPurchaseRow,
} from "@/services/supabase/supplierPurchasesV2Service";
import { printSaleInvoice } from "@/services/retailPrintService";
import type { Sale } from "@/types";
import { siteConfig } from "@/config/site";
import { toast } from "sonner";

type InvoiceTab = "sales" | "purchases";
type PaymentFilter = "all" | "cash" | "card" | "wallet" | "mixed";
type ReturnFilter = "all" | "returned" | "pending" | "clean";

function money(value: unknown) {
  return `${siteConfig.currency} ${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
}

function paymentKind(row: PosInvoiceListItem): Exclude<PaymentFilter, "all"> {
  const type = String(row.payment_method_type || "").toLowerCase();
  const code = String(row.payment_method_code || row.payment_method || "").toLowerCase();
  if (code === "mixed" || type === "mixed") return "mixed";
  if (code === "cash" || type === "cash") return "cash";
  if (type.includes("wallet") || code.includes("vodafone") || code.includes("instapay")) return "wallet";
  return "card";
}

function paymentBadge(row: PosInvoiceListItem) {
  const kind = paymentKind(row);
  const label = row.payment_method_name || (kind === "cash" ? "نقدي" : kind === "wallet" ? "محفظة إلكترونية" : kind === "mixed" ? "مختلط" : "بطاقة");
  const className = kind === "cash"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : kind === "wallet"
      ? "border-violet-200 bg-violet-50 text-violet-700"
      : kind === "mixed"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-sky-200 bg-sky-50 text-sky-700";
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

function Metric({ icon: Icon, title, value, note }: { icon: typeof ReceiptText; title: string; value: string; note: string }) {
  return (
    <Card className="border-slate-100 shadow-sm">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div><p className="text-xs font-bold text-slate-500">{title}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p><p className="mt-2 text-[11px] text-slate-400">{note}</p></div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></span>
      </CardContent>
    </Card>
  );
}

export default function Invoices() {
  const navigate = useNavigate();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const branchId = currentBranchId || localStorage.getItem("currentBranchId") || "";
  const [tab, setTab] = useState<InvoiceTab>("sales");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [returnFilter, setReturnFilter] = useState<ReturnFilter>("all");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loadingSaleId, setLoadingSaleId] = useState<string | null>(null);

  const salesQuery = useQuery({
    queryKey: ["invoice-center-v2", branchId, search.trim()],
    enabled: Boolean(branchId),
    queryFn: () => listPosInvoicesV2(branchId, search.trim(), 220),
    staleTime: 8_000,
  });

  const purchasesQuery = useQuery({
    queryKey: ["supplier-purchase-center-v2", branchId],
    enabled: Boolean(branchId),
    queryFn: () => fetchSupplierPurchaseCenterV2(branchId, 220),
    staleTime: 10_000,
  });

  const sales = salesQuery.data || [];
  const purchases = purchasesQuery.data?.purchases || [];

  const filteredSales = useMemo(() => sales.filter(row => {
    if (date && dayKey(row.sale_date) !== date) return false;
    if (paymentFilter !== "all" && paymentKind(row) !== paymentFilter) return false;
    if (returnFilter === "returned" && Number(row.return_count || 0) === 0) return false;
    if (returnFilter === "pending" && Number(row.pending_refund_count || 0) === 0) return false;
    if (returnFilter === "clean" && (Number(row.return_count || 0) > 0 || Number(row.pending_refund_count || 0) > 0)) return false;
    return true;
  }), [sales, date, paymentFilter, returnFilter]);

  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchases.filter(row => {
      if (date && dayKey(row.date) !== date) return false;
      if (!q) return true;
      return row.invoice_number.toLowerCase().includes(q) || row.supplier_name.toLowerCase().includes(q);
    });
  }, [purchases, search, date]);

  const salesSummary = useMemo(() => ({
    count: filteredSales.length,
    collected: filteredSales.reduce((sum, row) => sum + Number(row.amount_charged || 0), 0),
    returned: filteredSales.reduce((sum, row) => sum + Number(row.returned_amount || 0), 0),
    pending: filteredSales.reduce((sum, row) => sum + Number(row.pending_refund_count || 0), 0),
  }), [filteredSales]);

  const purchaseSummary = useMemo(() => ({
    count: filteredPurchases.length,
    total: filteredPurchases.reduce((sum, row) => sum + Number(row.total || 0), 0),
    outstanding: filteredPurchases.reduce((sum, row) => sum + Math.max(0, Number(row.outstanding || 0)), 0),
    overdue: filteredPurchases.filter(row => row.overdue && row.status !== "voided").length,
  }), [filteredPurchases]);

  const loadSale = async (row: PosInvoiceListItem) => {
    try {
      setLoadingSaleId(row.sale_id);
      return await getPosInvoiceSale(row.sale_id);
    } catch (error) {
      console.error(error);
      toast.error("تعذر تحميل نسخة الفاتورة المحفوظة");
      return null;
    } finally {
      setLoadingSaleId(null);
    }
  };

  const previewInvoice = async (row: PosInvoiceListItem) => {
    const sale = await loadSale(row);
    if (!sale) return;
    setSelectedSale(sale);
    setPreviewOpen(true);
  };

  const quickPrint = async (row: PosInvoiceListItem) => {
    const sale = await loadSale(row);
    if (!sale) return;
    if (!printSaleInvoice(sale)) toast.error("اسمح بالنوافذ المنبثقة لفتح شاشة الطباعة");
  };

  const resetFilters = () => {
    setSearch(""); setDate(""); setPaymentFilter("all"); setReturnFilter("all");
  };

  const refreshing = salesQuery.isFetching || purchasesQuery.isFetching;

  if (!branchId) {
    return <MainLayout><div dir="rtl" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">اختر فرعًا لعرض مركز الفواتير.</div></MainLayout>;
  }

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6 pb-16">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#005931] text-white shadow-lg shadow-emerald-900/10"><ReceiptText className="h-6 w-6" /></span><div><h1 className="text-2xl font-black text-slate-950 sm:text-3xl">مركز الفواتير</h1><p className="mt-1 text-sm text-slate-500">{currentBranchName || "الفرع الحالي"} · عرض وإعادة طباعة النسخ المحفوظة بدون تعديل التاريخ المالي.</p></div></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { salesQuery.refetch(); purchasesQuery.refetch(); }} disabled={refreshing}><RefreshCw className={`ml-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />تحديث</Button>
            <Button variant="outline" onClick={() => navigate("/it-center")}><Printer className="ml-2 h-4 w-4" />إعدادات الأجهزة والطابعات</Button>
          </div>
        </div>

        <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl border bg-white p-1.5 shadow-sm">
          <Button variant={tab === "sales" ? "default" : "ghost"} className={tab === "sales" ? "bg-[#005931] hover:bg-[#004725]" : ""} onClick={() => setTab("sales")}><ShoppingBag className="ml-2 h-4 w-4" />فواتير المبيعات</Button>
          <Button variant={tab === "purchases" ? "default" : "ghost"} className={tab === "purchases" ? "bg-[#005931] hover:bg-[#004725]" : ""} onClick={() => setTab("purchases")}><Truck className="ml-2 h-4 w-4" />فواتير المشتريات</Button>
        </div>

        {tab === "sales" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={ReceiptText} title="عدد الفواتير" value={salesSummary.count.toLocaleString("ar-EG")} note="حسب الفلاتر الحالية" />
            <Metric icon={WalletCards} title="المبلغ المحصل" value={money(salesSummary.collected)} note="Amount charged المسجل بالفواتير" />
            <Metric icon={Undo2} title="مرتجعات مسجلة" value={money(salesSummary.returned)} note="إجمالي قيمة المرتجعات المرتبطة" />
            <Metric icon={AlertTriangle} title="استردادات معلقة" value={salesSummary.pending.toLocaleString("ar-EG")} note="عمليات تحتاج متابعة" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={FileText} title="فواتير المشتريات" value={purchaseSummary.count.toLocaleString("ar-EG")} note="حسب الفلاتر الحالية" />
            <Metric icon={ShoppingBag} title="إجمالي المشتريات" value={money(purchaseSummary.total)} note="قيمة الفواتير المعروضة" />
            <Metric icon={WalletCards} title="المتبقي للموردين" value={money(purchaseSummary.outstanding)} note="الرصيد المفتوح على الفواتير" />
            <Metric icon={AlertTriangle} title="فواتير متأخرة" value={purchaseSummary.overdue.toLocaleString("ar-EG")} note="تجاوزت تاريخ الاستحقاق" />
          </div>
        )}

        <Card className="border-slate-100 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_180px_180px_auto]">
              <div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="h-11 pr-10" value={search} onChange={e => setSearch(e.target.value)} placeholder={tab === "sales" ? "رقم الفاتورة، العميل أو الهاتف..." : "رقم فاتورة الشراء أو المورد..."} /></div>
              <div className="relative"><CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="h-11 pr-10" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              {tab === "sales" && <select className="h-11 rounded-md border border-input bg-background px-3 text-sm" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value as PaymentFilter)}><option value="all">كل وسائل الدفع</option><option value="cash">نقدي</option><option value="card">بطاقات</option><option value="wallet">محافظ إلكترونية</option><option value="mixed">مختلط</option></select>}
              {tab === "sales" && <select className="h-11 rounded-md border border-input bg-background px-3 text-sm" value={returnFilter} onChange={e => setReturnFilter(e.target.value as ReturnFilter)}><option value="all">كل حالات المرتجع</option><option value="clean">بدون مرتجع</option><option value="returned">به مرتجعات</option><option value="pending">استرداد معلق</option></select>}
              <Button variant="ghost" className="h-11" onClick={resetFilters}>مسح الفلاتر</Button>
            </div>
          </CardContent>
        </Card>

        {tab === "sales" ? (
          <SalesInvoices rows={filteredSales} loading={salesQuery.isLoading} error={salesQuery.isError ? (salesQuery.error as Error).message : ""} loadingSaleId={loadingSaleId} onPreview={previewInvoice} onPrint={quickPrint} onRetry={() => salesQuery.refetch()} />
        ) : (
          <PurchaseInvoices rows={filteredPurchases} loading={purchasesQuery.isLoading} error={purchasesQuery.isError ? (purchasesQuery.error as Error).message : ""} onOpenCenter={() => navigate("/supplier-purchases")} onRetry={() => purchasesQuery.refetch()} />
        )}

        <InvoiceDialog isOpen={previewOpen} onClose={() => setPreviewOpen(false)} sale={selectedSale} previewMode />
      </div>
    </MainLayout>
  );
}

function SalesInvoices({ rows, loading, error, loadingSaleId, onPreview, onPrint, onRetry }: {
  rows: PosInvoiceListItem[]; loading: boolean; error: string; loadingSaleId: string | null;
  onPreview: (row: PosInvoiceListItem) => void; onPrint: (row: PosInvoiceListItem) => void; onRetry: () => void;
}) {
  if (loading) return <Card><CardContent className="py-16 text-center text-slate-500">جارٍ تحميل الفواتير المحفوظة...</CardContent></Card>;
  if (error) return <Card className="border-red-200 bg-red-50"><CardContent className="flex flex-col items-center gap-3 py-10 text-center text-red-800"><AlertTriangle className="h-6 w-6" /><p>{error || "تعذر تحميل الفواتير"}</p><Button variant="outline" onClick={onRetry}>إعادة المحاولة</Button></CardContent></Card>;
  if (!rows.length) return <Card><CardContent className="py-16 text-center"><ReceiptText className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 font-bold text-slate-600">لا توجد فواتير مطابقة</p><p className="mt-1 text-xs text-slate-400">غيّر البحث أو الفلاتر لعرض نتائج أخرى.</p></CardContent></Card>;

  return <Card className="overflow-hidden border-slate-100 shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-4 text-right">الفاتورة</th><th className="px-4 py-4 text-right">التاريخ</th><th className="px-4 py-4 text-right">العميل</th><th className="px-4 py-4 text-right">الدفع</th><th className="px-4 py-4 text-left">المبلغ</th><th className="px-4 py-4 text-center">الأصناف</th><th className="px-4 py-4 text-center">المرتجعات</th><th className="px-4 py-4 text-left">الإجراءات</th></tr></thead><tbody>{rows.map(row => {
    const busy = loadingSaleId === row.sale_id;
    return <tr key={row.invoice_id} className="border-t border-slate-100 transition hover:bg-slate-50/70">
      <td className="px-4 py-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ReceiptText className="h-4 w-4" /></span><div><p className="font-black text-slate-900">#{row.invoice_number}</p>{row.payment_reference && <p className="mt-1 max-w-[170px] truncate text-[10px] text-slate-400">مرجع: {row.payment_reference}</p>}</div></div></td>
      <td className="px-4 py-4 text-slate-600">{formatDateTime(row.sale_date)}</td>
      <td className="px-4 py-4"><div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-slate-400" /><div><p className="font-bold">{row.customer_name || "عميل عام"}</p>{row.customer_phone && <p className="text-[10px] text-slate-400">{row.customer_phone}</p>}</div></div></td>
      <td className="px-4 py-4">{paymentBadge(row)}</td>
      <td className="px-4 py-4 text-left"><p className="font-black text-slate-950">{money(row.amount_charged)}</p>{Number(row.customer_payment_fee_amount || 0) > 0 && <p className="text-[10px] text-amber-600">يشمل رسوم عميل {money(row.customer_payment_fee_amount)}</p>}</td>
      <td className="px-4 py-4 text-center font-bold">{Number(row.item_count || 0).toLocaleString("ar-EG")}</td>
      <td className="px-4 py-4 text-center">{Number(row.pending_refund_count || 0) > 0 ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{row.pending_refund_count} معلق</Badge> : Number(row.return_count || 0) > 0 ? <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">{row.return_count} مرتجع · {money(row.returned_amount)}</Badge> : <span className="text-xs text-slate-400">—</span>}</td>
      <td className="px-4 py-4"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => onPreview(row)}><FileText className="ml-1.5 h-3.5 w-3.5" />عرض</Button><Button size="sm" className="bg-[#005931] hover:bg-[#004725]" disabled={busy} onClick={() => onPrint(row)}><Printer className="ml-1.5 h-3.5 w-3.5" />{busy ? "تحميل..." : "طباعة"}</Button></div></td>
    </tr>;
  })}</tbody></table></div></Card>;
}

function PurchaseInvoices({ rows, loading, error, onOpenCenter, onRetry }: { rows: SupplierPurchaseRow[]; loading: boolean; error: string; onOpenCenter: () => void; onRetry: () => void }) {
  if (loading) return <Card><CardContent className="py-16 text-center text-slate-500">جارٍ تحميل فواتير المشتريات...</CardContent></Card>;
  if (error) return <Card className="border-red-200 bg-red-50"><CardContent className="flex flex-col items-center gap-3 py-10 text-center text-red-800"><AlertTriangle className="h-6 w-6" /><p>{error || "تعذر تحميل فواتير المشتريات"}</p><Button variant="outline" onClick={onRetry}>إعادة المحاولة</Button></CardContent></Card>;
  if (!rows.length) return <Card><CardContent className="py-16 text-center"><Truck className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 font-bold text-slate-600">لا توجد فواتير مشتريات مطابقة</p></CardContent></Card>;

  return <Card className="overflow-hidden border-slate-100 shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-4 text-right">الفاتورة</th><th className="px-4 py-4 text-right">المورد</th><th className="px-4 py-4 text-right">التاريخ</th><th className="px-4 py-4 text-left">الإجمالي</th><th className="px-4 py-4 text-left">المدفوع</th><th className="px-4 py-4 text-left">المتبقي</th><th className="px-4 py-4 text-center">الحالة</th><th className="px-4 py-4 text-left">إجراء</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-slate-100 transition hover:bg-slate-50/70"><td className="px-4 py-4 font-black">#{row.invoice_number}</td><td className="px-4 py-4 font-bold">{row.supplier_name}</td><td className="px-4 py-4 text-slate-600">{formatDateTime(row.date)}</td><td className="px-4 py-4 text-left font-bold">{money(row.total)}</td><td className="px-4 py-4 text-left text-emerald-700">{money(row.paid)}</td><td className="px-4 py-4 text-left font-black">{money(row.outstanding)}</td><td className="px-4 py-4 text-center">{row.status === "voided" ? <Badge variant="secondary">ملغاة</Badge> : row.payment_status === "paid" ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">مدفوعة</Badge> : row.overdue ? <Badge className="bg-red-100 text-red-800 hover:bg-red-100">متأخرة</Badge> : <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{row.payment_status === "partial" ? "مدفوعة جزئيًا" : "غير مدفوعة"}</Badge>}</td><td className="px-4 py-4 text-left"><Button size="sm" variant="outline" onClick={onOpenCenter}>فتح مركز الموردين</Button></td></tr>)}</tbody></table></div></Card>;
}
