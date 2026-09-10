import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import JsBarcode from "jsbarcode";
import {
  AlertTriangle,
  Barcode as BarcodeIcon,
  Bluetooth,
  ChevronLeft,
  ChevronRight,
  Package,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  Tags,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useBranchStore } from "@/stores/branchStore";
import {
  fetchAllProductManagementRows,
  fetchProductManagementPage,
  type ProductManagementRow,
} from "@/services/supabase/productManagementService";
import {
  BARCODE_LABEL_SIZES,
  getBarcodeLabelPreferences,
  printBarcodeLabels,
  saveBarcodeLabelPreferences,
  type BarcodeLabelItem,
  type BarcodeLabelPreferences,
  type BarcodeLabelSize,
} from "@/services/barcodeLabelPrintService";
import { bluetoothPrinterService } from "@/services/bluetoothPrinterService";
import { siteConfig } from "@/config/site";
import { toast } from "sonner";

type BarcodeFilter = "all" | "ready" | "missing" | "scale";

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;
}

function toLabelItem(row: ProductManagementRow): BarcodeLabelItem {
  return {
    id: row.row_key,
    name: row.name,
    barcode: row.barcode || "",
    price: Number(row.offer_price && row.is_offer ? row.offer_price : row.price || 0),
    unit: row.unit_of_measure,
    barcodeType: row.barcode_type,
  };
}

function BarcodePreview({ row, preferences }: { row: ProductManagementRow | null; preferences: BarcodeLabelPreferences }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = BARCODE_LABEL_SIZES[preferences.size];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !row?.barcode) return;
    try {
      JsBarcode(canvas, row.barcode, {
        format: "CODE128",
        width: size.width <= 30 ? 1.1 : 1.35,
        height: size.height <= 20 ? 26 : 38,
        displayValue: false,
        margin: 0,
      });
    } catch {
      const context = canvas.getContext("2d");
      context?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [row, preferences.size, size.height, size.width]);

  if (!row) return <div className="flex h-52 items-center justify-center rounded-2xl border border-dashed text-sm text-slate-400">اختر منتجًا لمعاينة الملصق</div>;
  if (!row.barcode) return <div className="flex h-52 flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-center text-sm text-amber-800"><AlertTriangle className="mb-2 h-6 w-6" /><strong>{row.name}</strong><span className="mt-1">هذا المنتج ليس له باركود قابل للطباعة.</span></div>;

  return (
    <div className="flex min-h-56 items-center justify-center rounded-2xl bg-slate-100 p-5">
      <div className="flex flex-col items-center justify-center overflow-hidden border border-slate-200 bg-white p-2 text-center shadow-lg" style={{ width: `${Math.max(180, size.width * 6)}px`, aspectRatio: `${size.width}/${size.height}` }}>
        {preferences.showStoreName && <div className="mb-1 max-w-full truncate text-[9px] font-black text-[#005931]">{siteConfig.name}</div>}
        {preferences.showProductName && <div className="mb-1 max-w-full truncate text-xs font-black">{row.name}</div>}
        <canvas ref={canvasRef} className="max-h-[55%] max-w-full" />
        {preferences.showBarcodeText && <div className="mt-1 text-[9px] tracking-wide" dir="ltr">{row.barcode}</div>}
        {preferences.showPrice && <div className="mt-1 text-sm font-black">{money(row.is_offer && row.offer_price ? row.offer_price : row.price)}{row.unit_of_measure ? <span className="mr-1 text-[8px] font-bold text-slate-500">/ {row.unit_of_measure}</span> : null}</div>}
      </div>
    </div>
  );
}

export default function Barcode() {
  const navigate = useNavigate();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const branchId = currentBranchId || localStorage.getItem("currentBranchId") || "";
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<BarcodeFilter>("all");
  const [selected, setSelected] = useState<Map<string, ProductManagementRow>>(new Map());
  const [previewRow, setPreviewRow] = useState<ProductManagementRow | null>(null);
  const [preferences, setPreferences] = useState<BarcodeLabelPreferences>(() => getBarcodeLabelPreferences());
  const [printingAll, setPrintingAll] = useState(false);
  const pageSize = 80;

  useEffect(() => setPage(1), [search, filter, branchId]);

  const query = useQuery({
    queryKey: ["barcode-print-center-v2", branchId, search.trim(), page],
    enabled: Boolean(branchId),
    queryFn: () => fetchProductManagementPage({ search: search.trim(), page, pageSize }),
    staleTime: 8_000,
  });

  const rows = query.data?.rows || [];
  const total = Number(query.data?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const visibleRows = useMemo(() => rows.filter(row => {
    if (filter === "ready") return Boolean(row.barcode);
    if (filter === "missing") return !row.barcode;
    if (filter === "scale") return row.barcode_type === "scale";
    return true;
  }), [rows, filter]);

  useEffect(() => {
    if (!previewRow || !visibleRows.some(row => row.row_key === previewRow.row_key)) {
      setPreviewRow(visibleRows.find(row => row.barcode) || visibleRows[0] || null);
    }
  }, [visibleRows, previewRow]);

  const printerStatus = bluetoothPrinterService.getStatus();
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every(row => selected.has(row.row_key));
  const selectedPrintable = Array.from(selected.values()).filter(row => Boolean(row.barcode));

  const updatePreference = <K extends keyof BarcodeLabelPreferences>(key: K, value: BarcodeLabelPreferences[K]) => {
    setPreferences(prev => saveBarcodeLabelPreferences({ ...prev, [key]: value }));
  };

  const toggleRow = (row: ProductManagementRow) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(row.row_key)) next.delete(row.row_key);
      else next.set(row.row_key, row);
      return next;
    });
    setPreviewRow(row);
  };

  const togglePage = () => {
    setSelected(prev => {
      const next = new Map(prev);
      if (allVisibleSelected) visibleRows.forEach(row => next.delete(row.row_key));
      else visibleRows.forEach(row => next.set(row.row_key, row));
      return next;
    });
  };

  const printRows = (items: ProductManagementRow[]) => {
    const printable = items.filter(row => row.barcode).map(toLabelItem);
    if (!printable.length) return toast.error("لا توجد باركودات صالحة للطباعة في الاختيار الحالي.");
    if (!printBarcodeLabels(printable, preferences)) return toast.error("المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة للموقع.");
    toast.success(`تم تجهيز ${printable.length.toLocaleString("ar-EG")} منتج للطباعة × ${preferences.copies.toLocaleString("ar-EG")} نسخة`);
  };

  const printAllResults = async () => {
    try {
      setPrintingAll(true);
      let result = await fetchAllProductManagementRows({ search: search.trim() });
      if (filter === "ready") result = result.filter(row => Boolean(row.barcode));
      if (filter === "missing") result = result.filter(row => !row.barcode);
      if (filter === "scale") result = result.filter(row => row.barcode_type === "scale");
      printRows(result);
    } catch (error) {
      console.error(error);
      toast.error("تعذر تجهيز كل النتائج للطباعة.");
    } finally {
      setPrintingAll(false);
    }
  };

  if (!branchId) return <MainLayout><div dir="rtl" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">اختر فرعًا أولًا لفتح مركز طباعة الباركود.</div></MainLayout>;

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6 pb-16">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#005931] text-white shadow-lg shadow-emerald-900/10"><BarcodeIcon className="h-6 w-6" /></span>
            <div><h1 className="text-2xl font-black text-slate-950 sm:text-3xl">مركز طباعة الباركود</h1><p className="mt-1 text-sm text-slate-500">{currentBranchName || "الفرع الحالي"} · ملصقات منتجات دقيقة ومهيأة لطابعات الرول.</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
            <Button variant="outline" onClick={() => navigate("/it-center")}><Settings2 className="ml-2 h-4 w-4" />الطابعات والأجهزة</Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-slate-100 shadow-sm"><CardContent className="p-5"><p className="text-xs font-bold text-slate-500">نتائج الكتالوج</p><p className="mt-2 text-2xl font-black">{total.toLocaleString("ar-EG")}</p><p className="mt-2 text-[11px] text-slate-400">من كتالوج الفرع الفعلي</p></CardContent></Card>
          <Card className="border-slate-100 shadow-sm"><CardContent className="p-5"><p className="text-xs font-bold text-slate-500">المحدد</p><p className="mt-2 text-2xl font-black">{selected.size.toLocaleString("ar-EG")}</p><p className="mt-2 text-[11px] text-slate-400">منها {selectedPrintable.length.toLocaleString("ar-EG")} صالح للطباعة</p></CardContent></Card>
          <Card className="border-slate-100 shadow-sm"><CardContent className="p-5"><p className="text-xs font-bold text-slate-500">مقاس الملصق</p><p className="mt-2 text-2xl font-black">{BARCODE_LABEL_SIZES[preferences.size].label}</p><p className="mt-2 text-[11px] text-slate-400">محفوظ على الجهاز الحالي</p></CardContent></Card>
          <Card className="border-slate-100 shadow-sm"><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-slate-500">الطابعة</p><p className="mt-2 font-black">{printerStatus.name || "طباعة المتصفح"}</p><p className="mt-2 text-[11px] text-slate-400">{printerStatus.connected ? "متصلة حاليًا" : "اختر الطابعة من نافذة الطباعة"}</p></div><Bluetooth className={`h-5 w-5 ${printerStatus.connected ? "text-emerald-600" : "text-slate-300"}`} /></div></CardContent></Card>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <Card className="border-slate-100 shadow-sm"><CardContent className="p-4 sm:p-5"><div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_auto_auto]">
              <div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="h-11 pr-10" value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث بالاسم أو الباركود..." /></div>
              <select className="h-11 rounded-md border border-input bg-background px-3 text-sm" value={filter} onChange={e => setFilter(e.target.value as BarcodeFilter)}><option value="all">كل المنتجات والوحدات</option><option value="ready">بباركود فقط</option><option value="missing">بدون باركود</option><option value="scale">باركود ميزان</option></select>
              <Button className="h-11 bg-[#005931] hover:bg-[#004725]" disabled={!selectedPrintable.length} onClick={() => printRows(selectedPrintable)}><Printer className="ml-2 h-4 w-4" />طباعة المحدد ({selectedPrintable.length})</Button>
              <Button variant="outline" className="h-11" disabled={printingAll || filter === "missing"} onClick={printAllResults}><Tags className="ml-2 h-4 w-4" />{printingAll ? "تجهيز..." : "طباعة كل النتائج"}</Button>
            </div></CardContent></Card>

            <Card className="overflow-hidden border-slate-100 shadow-sm">
              <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3"><label className="flex cursor-pointer items-center gap-2 text-sm font-bold"><Checkbox checked={allVisibleSelected} onCheckedChange={togglePage} />تحديد الصفحة الحالية</label><span className="text-xs text-slate-500">{visibleRows.length.toLocaleString("ar-EG")} عنصر في الصفحة</span></div>
              {query.isLoading ? <div className="py-16 text-center text-slate-500">جارٍ تحميل الكتالوج...</div> : query.isError ? <div className="flex flex-col items-center gap-3 py-12 text-center text-red-700"><AlertTriangle className="h-6 w-6" /><p>{(query.error as Error).message}</p><Button variant="outline" onClick={() => query.refetch()}>إعادة المحاولة</Button></div> : visibleRows.length === 0 ? <div className="py-16 text-center text-slate-500">لا توجد نتائج مطابقة.</div> : <div className="divide-y divide-slate-100">{visibleRows.map(row => {
                const checked = selected.has(row.row_key);
                return <div key={row.row_key} className={`grid cursor-pointer gap-3 p-4 transition sm:grid-cols-[auto_minmax(0,1fr)_150px_130px_auto] sm:items-center ${checked ? "bg-emerald-50/60" : "hover:bg-slate-50"}`} onClick={() => toggleRow(row)}>
                  <Checkbox checked={checked} onCheckedChange={() => toggleRow(row)} onClick={event => event.stopPropagation()} />
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-black text-slate-900">{row.name}</p>{row.record_type === "sale_unit" && <Badge variant="outline">وحدة بيع</Badge>}{row.barcode_type === "scale" && <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100">ميزان</Badge>}</div><p className="mt-1 text-xs text-slate-400">{row.parent_name ? `${row.parent_name} · ` : ""}{row.unit_of_measure || "قطعة"}</p></div>
                  <div><span className="text-[10px] text-slate-400">الباركود</span>{row.barcode ? <p className="mt-1 truncate font-mono text-xs font-bold" dir="ltr">{row.barcode}</p> : <Badge className="mt-1 bg-amber-100 text-amber-800 hover:bg-amber-100">غير مسجل</Badge>}</div>
                  <div><span className="text-[10px] text-slate-400">سعر البيع</span><p className="mt-1 font-black">{money(row.is_offer && row.offer_price ? row.offer_price : row.price)}</p></div>
                  <div className="flex justify-end"><Button size="sm" variant="outline" disabled={!row.barcode} onClick={event => { event.stopPropagation(); setPreviewRow(row); printRows([row]); }}><Printer className="ml-1.5 h-3.5 w-3.5" />طباعة</Button></div>
                </div>;
              })}</div>}
              <div className="flex items-center justify-between border-t bg-white px-4 py-3"><span className="text-xs text-slate-500">صفحة {page.toLocaleString("ar-EG")} من {totalPages.toLocaleString("ar-EG")}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronRight className="h-4 w-4" />السابق</Button><Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>التالي<ChevronLeft className="h-4 w-4" /></Button></div></div>
            </Card>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <Card className="border-slate-100 shadow-sm"><CardContent className="space-y-5 p-5"><div><div className="flex items-center gap-2"><Package className="h-5 w-5 text-emerald-700" /><h2 className="font-black">تصميم الملصق</h2></div><p className="mt-1 text-xs leading-5 text-slate-500">المقاس والنسخ محفوظان محليًا لهذا الجهاز والطابعة.</p></div>
              <label className="block space-y-2"><span className="text-xs font-bold text-slate-600">المقاس</span><select className="h-11 w-full rounded-xl border bg-white px-3 text-sm font-bold" value={preferences.size} onChange={e => updatePreference("size", e.target.value as BarcodeLabelSize)}>{Object.entries(BARCODE_LABEL_SIZES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
              <label className="block space-y-2"><span className="text-xs font-bold text-slate-600">عدد النسخ لكل منتج</span><Input type="number" min={1} max={20} value={preferences.copies} onChange={e => updatePreference("copies", Number(e.target.value))} /></label>
              <div className="space-y-3 rounded-2xl border p-4">
                <label className="flex cursor-pointer items-center justify-between gap-3"><span className="text-sm font-bold">اسم المنتج</span><Checkbox checked={preferences.showProductName} onCheckedChange={v => updatePreference("showProductName", Boolean(v))} /></label>
                <label className="flex cursor-pointer items-center justify-between gap-3"><span className="text-sm font-bold">السعر</span><Checkbox checked={preferences.showPrice} onCheckedChange={v => updatePreference("showPrice", Boolean(v))} /></label>
                <label className="flex cursor-pointer items-center justify-between gap-3"><span className="text-sm font-bold">اسم الماركت</span><Checkbox checked={preferences.showStoreName} onCheckedChange={v => updatePreference("showStoreName", Boolean(v))} /></label>
                <label className="flex cursor-pointer items-center justify-between gap-3"><span className="text-sm font-bold">رقم الباركود</span><Checkbox checked={preferences.showBarcodeText} onCheckedChange={v => updatePreference("showBarcodeText", Boolean(v))} /></label>
              </div>
              <BarcodePreview row={previewRow} preferences={preferences} />
              {previewRow?.barcode && <Button className="h-11 w-full bg-[#005931] hover:bg-[#004725]" onClick={() => printRows([previewRow])}><Printer className="ml-2 h-4 w-4" />طباعة المعاينة</Button>}
              <Button variant="outline" className="w-full" onClick={() => navigate("/products")}><BarcodeIcon className="ml-2 h-4 w-4" />تعديل بيانات المنتجات والباركود</Button>
            </CardContent></Card>
          </aside>
        </div>
      </div>
    </MainLayout>
  );
}
