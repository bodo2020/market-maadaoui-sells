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
  Minus,
  Package,
  Plus,
  Printer,
  RefreshCw,
  ScanLine,
  Search,
  Settings2,
  Sparkles,
  Tags,
  Trash2,
  WandSparkles,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useBranchStore } from "@/stores/branchStore";
import {
  assignInternalBarcode,
  fetchAllProductManagementRows,
  fetchBarcodeManagementPage,
  type BarcodeCatalogFilter,
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

type BarcodeFilter = BarcodeCatalogFilter;

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;
}

function toLabelItem(row: ProductManagementRow, copies?: number): BarcodeLabelItem {
  return {
    id: row.row_key,
    name: row.name,
    barcode: row.barcode || "",
    price: Number(row.offer_price && row.is_offer ? row.offer_price : row.price || 0),
    unit: row.unit_of_measure,
    barcodeType: row.barcode_type,
    copies,
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

  if (!row) {
    return <div className="flex h-52 items-center justify-center rounded-2xl border border-dashed text-sm text-slate-400">اختر منتجًا لمعاينة الملصق</div>;
  }

  if (!row.barcode) {
    return (
      <div className="flex h-52 flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-5 text-center text-sm text-amber-800">
        <AlertTriangle className="mb-2 h-6 w-6" />
        <strong>{row.name}</strong>
        <span className="mt-1">المنتج يحتاج باركود قبل الطباعة.</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-56 items-center justify-center rounded-2xl bg-slate-100 p-5">
      <div
        className="flex flex-col items-center justify-center overflow-hidden border border-slate-200 bg-white p-2 text-center shadow-lg"
        style={{ width: `${Math.max(180, size.width * 6)}px`, aspectRatio: `${size.width}/${size.height}` }}
      >
        {preferences.showStoreName && <div className="mb-1 max-w-full truncate text-[9px] font-black text-[#005931]">{siteConfig.name}</div>}
        {preferences.showProductName && <div className="mb-1 max-w-full truncate text-xs font-black">{row.name}</div>}
        <canvas ref={canvasRef} className="max-h-[55%] max-w-full" />
        {preferences.showBarcodeText && <div className="mt-1 text-[9px] tracking-wide" dir="ltr">{row.barcode}</div>}
        {preferences.showPrice && (
          <div className="mt-1 text-sm font-black">
            {money(row.is_offer && row.offer_price ? row.offer_price : row.price)}
            {row.unit_of_measure ? <span className="mr-1 text-[8px] font-bold text-slate-500">/ {row.unit_of_measure}</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Barcode() {
  const navigate = useNavigate();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const branchId = currentBranchId || localStorage.getItem("currentBranchId") || "";
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<BarcodeFilter>("all");
  const [selected, setSelected] = useState<Map<string, ProductManagementRow>>(new Map());
  const [copyCounts, setCopyCounts] = useState<Map<string, number>>(new Map());
  const [previewRow, setPreviewRow] = useState<ProductManagementRow | null>(null);
  const [preferences, setPreferences] = useState<BarcodeLabelPreferences>(() => getBarcodeLabelPreferences());
  const [printingAll, setPrintingAll] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const pageSize = 60;

  useEffect(() => setPage(1), [search, filter, branchId]);

  const query = useQuery({
    queryKey: ["barcode-print-center-v3", branchId, search.trim(), filter, page],
    enabled: Boolean(branchId),
    queryFn: () => fetchBarcodeManagementPage({ search: search.trim(), filter, page, pageSize }),
    staleTime: 8_000,
  });

  const rows = query.data?.rows || [];
  const total = Number(query.data?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (!previewRow || !rows.some(row => row.row_key === previewRow.row_key)) {
      setPreviewRow(rows.find(row => row.barcode) || rows[0] || null);
    }
  }, [rows, previewRow]);

  const printerStatus = bluetoothPrinterService.getStatus();
  const allVisibleSelected = rows.length > 0 && rows.every(row => selected.has(row.row_key));
  const selectedRows = Array.from(selected.values());
  const selectedPrintable = selectedRows.filter(row => Boolean(row.barcode));
  const totalLabels = selectedPrintable.reduce((sum, row) => sum + (copyCounts.get(row.row_key) || 1), 0);

  const updatePreference = <K extends keyof BarcodeLabelPreferences>(key: K, value: BarcodeLabelPreferences[K]) => {
    setPreferences(prev => saveBarcodeLabelPreferences({ ...prev, [key]: value }));
  };

  const applyPreset = (preset: "shelf" | "small" | "barcode") => {
    const next: BarcodeLabelPreferences = preset === "shelf"
      ? { ...preferences, size: "40x25", showProductName: true, showPrice: true, showStoreName: true, showBarcodeText: true }
      : preset === "small"
        ? { ...preferences, size: "30x20", showProductName: true, showPrice: true, showStoreName: false, showBarcodeText: true }
        : { ...preferences, size: "30x20", showProductName: false, showPrice: false, showStoreName: false, showBarcodeText: true };
    setPreferences(saveBarcodeLabelPreferences(next));
  };

  const addToQueue = (row: ProductManagementRow) => {
    setSelected(prev => {
      const next = new Map(prev);
      next.set(row.row_key, row);
      return next;
    });
    setCopyCounts(prev => {
      if (prev.has(row.row_key)) return prev;
      const next = new Map(prev);
      next.set(row.row_key, 1);
      return next;
    });
    setPreviewRow(row);
  };

  const removeFromQueue = (rowKey: string) => {
    setSelected(prev => {
      const next = new Map(prev);
      next.delete(rowKey);
      return next;
    });
    setCopyCounts(prev => {
      const next = new Map(prev);
      next.delete(rowKey);
      return next;
    });
  };

  const toggleRow = (row: ProductManagementRow) => {
    if (selected.has(row.row_key)) removeFromQueue(row.row_key);
    else addToQueue(row);
  };

  const setRowCopies = (row: ProductManagementRow, value: number) => {
    addToQueue(row);
    setCopyCounts(prev => {
      const next = new Map(prev);
      next.set(row.row_key, Math.min(99, Math.max(1, Math.round(value || 1))));
      return next;
    });
  };

  const togglePage = () => {
    if (allVisibleSelected) {
      rows.forEach(row => removeFromQueue(row.row_key));
      return;
    }
    rows.forEach(addToQueue);
  };

  const clearQueue = () => {
    setSelected(new Map());
    setCopyCounts(new Map());
  };

  const printRows = async (items: ProductManagementRow[], useQueueCopies = false) => {
    const printable = items
      .filter(row => row.barcode)
      .map(row => toLabelItem(row, useQueueCopies ? (copyCounts.get(row.row_key) || 1) : undefined));
    if (!printable.length) {
      toast.error("لا توجد باركودات صالحة للطباعة في الاختيار الحالي.");
      return;
    }

    try {
      const result = await printBarcodeLabels(printable, preferences);
      if (!result.printed) {
        toast.error("تعذر بدء الطباعة. لو أنت على المتصفح اسمح بالنوافذ المنبثقة.");
        return;
      }
      if (result.native) {
        const timing = result.totalMs ? ` · ${Math.round(result.totalMs)} ms إرسال` : "";
        toast.success(`تم إرسال ${result.totalLabels.toLocaleString("ar-EG")} ملصق مباشرة للطابعة${timing}`);
      } else {
        toast.success(`تم تجهيز ${result.totalLabels.toLocaleString("ar-EG")} ملصق لنافذة الطباعة`);
      }
    } catch (error) {
      console.error(error);
      toast.error((error as Error).message || "تعذر طباعة ملصقات الباركود.");
    }
  };

  const printQueue = () => void printRows(selectedPrintable, true);

  const printAllResults = async () => {
    try {
      setPrintingAll(true);
      let result = await fetchAllProductManagementRows({ search: search.trim() });
      if (filter === "ready") result = result.filter(row => Boolean(row.barcode));
      if (filter === "missing") result = result.filter(row => !row.barcode);
      if (filter === "scale") result = result.filter(row => row.barcode_type === "scale");
      await printRows(result);
    } catch (error) {
      console.error(error);
      toast.error("تعذر تجهيز كل النتائج للطباعة.");
    } finally {
      setPrintingAll(false);
    }
  };

  const createInternalBarcode = async (row: ProductManagementRow) => {
    try {
      setGeneratingId(row.row_key);
      const barcode = await assignInternalBarcode(row);
      const patched = { ...row, barcode };
      setPreviewRow(patched);
      setSelected(prev => {
        if (!prev.has(row.row_key)) return prev;
        const next = new Map(prev);
        next.set(row.row_key, patched);
        return next;
      });
      toast.success(`تم إنشاء الباركود ${barcode}`);
      await query.refetch();
    } catch (error) {
      toast.error((error as Error).message || "تعذر إنشاء الباركود الداخلي.");
    } finally {
      setGeneratingId(null);
    }
  };

  if (!branchId) {
    return <MainLayout><div dir="rtl" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">اختر فرعًا أولًا لفتح مركز طباعة الباركود.</div></MainLayout>;
  }

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-5 pb-20">
        <div className="rounded-3xl border border-emerald-100 bg-gradient-to-l from-emerald-50 via-white to-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#005931] text-white shadow-lg shadow-emerald-900/10"><BarcodeIcon className="h-6 w-6" /></span>
              <div>
                <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">مركز الباركود والملصقات</h1>
                <p className="mt-1 text-sm leading-6 text-slate-500">{currentBranchName || "الفرع الحالي"} · جهّز الملصقات، راجع السعر والباركود، واطبع الطابور دفعة واحدة.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
              <Button variant="outline" onClick={() => navigate("/it-center")}><Settings2 className="ml-2 h-4 w-4" />الطابعات والأجهزة</Button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-slate-100 shadow-sm"><CardContent className="p-4"><p className="text-xs font-bold text-slate-500">نتائج الفلتر</p><p className="mt-2 text-2xl font-black">{total.toLocaleString("ar-EG")}</p><p className="mt-1 text-[11px] text-slate-400">العدد محسوب على الكتالوج كله</p></CardContent></Card>
          <Card className="border-slate-100 shadow-sm"><CardContent className="p-4"><p className="text-xs font-bold text-slate-500">طابور الطباعة</p><p className="mt-2 text-2xl font-black">{selected.size.toLocaleString("ar-EG")} منتج</p><p className="mt-1 text-[11px] text-slate-400">{totalLabels.toLocaleString("ar-EG")} ملصق جاهز</p></CardContent></Card>
          <Card className="border-slate-100 shadow-sm"><CardContent className="p-4"><p className="text-xs font-bold text-slate-500">مقاس الملصق</p><p className="mt-2 text-2xl font-black">{BARCODE_LABEL_SIZES[preferences.size].label}</p><p className="mt-1 text-[11px] text-slate-400">يمكن تغييره من المعاينة</p></CardContent></Card>
          <Card className="border-slate-100 shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-slate-500">الطابعة</p><p className="mt-2 font-black">{printerStatus.name || "طباعة النظام"}</p><p className="mt-1 text-[11px] text-slate-400">{printerStatus.connected ? "متصلة حاليًا" : "سيتم الاختيار عند الطباعة"}</p></div><Bluetooth className={`h-5 w-5 ${printerStatus.connected ? "text-emerald-600" : "text-slate-300"}`} /></div></CardContent></Card>
        </div>

        <Card className="border-slate-100 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="grid gap-3 xl:grid-cols-[minmax(280px,1fr)_210px_auto_auto]">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input ref={searchRef} className="h-11 pr-10" value={search} onChange={e => setSearch(e.target.value)} placeholder="اسم المنتج أو الباركود..." />
                </div>
                <Button variant="outline" className="h-11 px-3" onClick={() => searchRef.current?.focus()} title="مرّر الباركود بالسكانر"><ScanLine className="h-5 w-5" /></Button>
              </div>
              <select className="h-11 rounded-md border border-input bg-background px-3 text-sm font-bold" value={filter} onChange={e => setFilter(e.target.value as BarcodeFilter)}>
                <option value="all">كل المنتجات والوحدات</option>
                <option value="ready">جاهز للطباعة</option>
                <option value="missing">بدون باركود</option>
                <option value="scale">باركود ميزان</option>
              </select>
              <Button className="h-11 bg-[#005931] hover:bg-[#004725]" disabled={!selectedPrintable.length} onClick={printQueue}><Printer className="ml-2 h-4 w-4" />طباعة الطابور ({totalLabels})</Button>
              <Button variant="outline" className="h-11" disabled={printingAll || filter === "missing"} onClick={printAllResults}><Tags className="ml-2 h-4 w-4" />{printingAll ? "تجهيز..." : "طباعة كل النتائج"}</Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-4">
            <Card className="overflow-hidden border-slate-100 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold"><Checkbox checked={allVisibleSelected} onCheckedChange={togglePage} />إضافة الصفحة للطابور</label>
                <span className="text-xs text-slate-500">{rows.length.toLocaleString("ar-EG")} عنصر في الصفحة</span>
              </div>

              {query.isLoading ? (
                <div className="py-16 text-center text-slate-500">جارٍ تحميل الكتالوج...</div>
              ) : query.isError ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center text-red-700"><AlertTriangle className="h-6 w-6" /><p>{(query.error as Error).message}</p><Button variant="outline" onClick={() => query.refetch()}>إعادة المحاولة</Button></div>
              ) : rows.length === 0 ? (
                <div className="py-16 text-center text-slate-500">لا توجد نتائج مطابقة.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {rows.map(row => {
                    const checked = selected.has(row.row_key);
                    const copies = copyCounts.get(row.row_key) || 1;
                    const price = row.is_offer && row.offer_price ? row.offer_price : row.price;
                    return (
                      <div key={row.row_key} className={`grid gap-3 p-4 transition lg:grid-cols-[auto_52px_minmax(0,1fr)_145px_120px_150px] lg:items-center ${checked ? "bg-emerald-50/60" : "hover:bg-slate-50"}`}>
                        <Checkbox checked={checked} onCheckedChange={() => toggleRow(row)} />
                        <button type="button" className="h-12 w-12 overflow-hidden rounded-xl border bg-white" onClick={() => setPreviewRow(row)}>
                          {row.image_urls?.[0] ? <img src={row.image_urls[0]} alt="" className="h-full w-full object-cover" /> : <Package className="mx-auto h-5 w-5 text-slate-300" />}
                        </button>
                        <button type="button" className="min-w-0 text-right" onClick={() => setPreviewRow(row)}>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-black text-slate-900">{row.name}</p>
                            {row.record_type === "sale_unit" && <Badge variant="outline">وحدة بيع</Badge>}
                            {row.barcode_type === "scale" && <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100">ميزان</Badge>}
                            {row.is_offer && <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">عرض</Badge>}
                          </div>
                          <p className="mt-1 text-xs text-slate-400">{row.parent_name ? `${row.parent_name} · ` : ""}{row.unit_of_measure || "قطعة"}</p>
                        </button>
                        <div>
                          <span className="text-[10px] text-slate-400">الباركود</span>
                          {row.barcode ? <p className="mt-1 truncate font-mono text-xs font-bold" dir="ltr">{row.barcode}</p> : <Badge className="mt-1 bg-amber-100 text-amber-800 hover:bg-amber-100">غير مسجل</Badge>}
                          {!row.barcode && row.barcode_type !== "scale" && (
                            <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-[11px] text-emerald-700" disabled={generatingId === row.row_key} onClick={() => void createInternalBarcode(row)}>
                              <WandSparkles className="ml-1 h-3.5 w-3.5" />{generatingId === row.row_key ? "إنشاء..." : "إنشاء داخلي"}
                            </Button>
                          )}
                        </div>
                        <div><span className="text-[10px] text-slate-400">سعر البيع</span><p className="mt-1 font-black">{money(price)}</p></div>
                        <div className="flex items-center justify-end gap-2">
                          {row.barcode ? (
                            <>
                              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setRowCopies(row, copies - 1)}><Minus className="h-3.5 w-3.5" /></Button>
                              <button type="button" onClick={() => addToQueue(row)} className={`min-w-9 text-center text-sm font-black ${checked ? "text-emerald-700" : "text-slate-700"}`}>{copies}</button>
                              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setRowCopies(row, copies + 1)}><Plus className="h-3.5 w-3.5" /></Button>
                            </>
                          ) : <span className="text-xs text-slate-400">غير قابل للطباعة</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between border-t bg-white px-4 py-3">
                <span className="text-xs text-slate-500">صفحة {page.toLocaleString("ar-EG")} من {totalPages.toLocaleString("ar-EG")}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronRight className="h-4 w-4" />السابق</Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>التالي<ChevronLeft className="h-4 w-4" /></Button>
                </div>
              </div>
            </Card>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <Card className="border-slate-100 shadow-sm">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div><h2 className="font-black">طابور الطباعة</h2><p className="mt-1 text-xs text-slate-500">{selected.size} منتج · {totalLabels} ملصق</p></div>
                  {selected.size > 0 && <Button size="sm" variant="ghost" className="text-red-600" onClick={clearQueue}><Trash2 className="ml-1 h-4 w-4" />مسح</Button>}
                </div>
                {selectedRows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-5 text-center text-xs leading-6 text-slate-400">استخدم + بجانب المنتج لإضافته للطابور وتحديد عدد الملصقات.</div>
                ) : (
                  <div className="max-h-52 space-y-2 overflow-auto pl-1">
                    {selectedRows.slice(0, 20).map(row => (
                      <div key={row.row_key} className="flex items-center gap-2 rounded-xl border p-2">
                        <div className="min-w-0 flex-1"><p className="truncate text-xs font-black">{row.name}</p><p className="mt-0.5 text-[10px] text-slate-400">{copyCounts.get(row.row_key) || 1} ملصق</p></div>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => removeFromQueue(row.row_key)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    ))}
                    {selectedRows.length > 20 && <p className="text-center text-[10px] text-slate-400">+ {(selectedRows.length - 20).toLocaleString("ar-EG")} منتج آخر</p>}
                  </div>
                )}
                <Button className="h-11 w-full bg-[#005931] hover:bg-[#004725]" disabled={!selectedPrintable.length} onClick={printQueue}><Printer className="ml-2 h-4 w-4" />طباعة {totalLabels.toLocaleString("ar-EG")} ملصق</Button>
              </CardContent>
            </Card>

            <Card className="border-slate-100 shadow-sm">
              <CardContent className="space-y-5 p-5">
                <div>
                  <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-emerald-700" /><h2 className="font-black">تصميم الملصق</h2></div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">اختار Preset جاهز أو عدّل التفاصيل يدويًا.</p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" className="h-auto py-2 text-xs" onClick={() => applyPreset("shelf")}>رف<br />40×25</Button>
                  <Button variant="outline" className="h-auto py-2 text-xs" onClick={() => applyPreset("small")}>صغير<br />30×20</Button>
                  <Button variant="outline" className="h-auto py-2 text-xs" onClick={() => applyPreset("barcode")}>باركود<br />فقط</Button>
                </div>

                <label className="block space-y-2">
                  <span className="text-xs font-bold text-slate-600">المقاس</span>
                  <select className="h-11 w-full rounded-xl border bg-white px-3 text-sm font-bold" value={preferences.size} onChange={e => updatePreference("size", e.target.value as BarcodeLabelSize)}>
                    {Object.entries(BARCODE_LABEL_SIZES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
                  </select>
                </label>

                <div className="space-y-3 rounded-2xl border p-4">
                  <label className="flex cursor-pointer items-center justify-between gap-3"><span className="text-sm font-bold">اسم المنتج</span><Checkbox checked={preferences.showProductName} onCheckedChange={v => updatePreference("showProductName", Boolean(v))} /></label>
                  <label className="flex cursor-pointer items-center justify-between gap-3"><span className="text-sm font-bold">السعر</span><Checkbox checked={preferences.showPrice} onCheckedChange={v => updatePreference("showPrice", Boolean(v))} /></label>
                  <label className="flex cursor-pointer items-center justify-between gap-3"><span className="text-sm font-bold">اسم الماركت</span><Checkbox checked={preferences.showStoreName} onCheckedChange={v => updatePreference("showStoreName", Boolean(v))} /></label>
                  <label className="flex cursor-pointer items-center justify-between gap-3"><span className="text-sm font-bold">رقم الباركود</span><Checkbox checked={preferences.showBarcodeText} onCheckedChange={v => updatePreference("showBarcodeText", Boolean(v))} /></label>
                </div>

                <BarcodePreview row={previewRow} preferences={preferences} />

                {previewRow?.barcode && <Button variant="outline" className="h-11 w-full" onClick={() => printRows([previewRow])}><Printer className="ml-2 h-4 w-4" />طباعة ملصق تجريبي</Button>}
                <Button variant="outline" className="w-full" onClick={() => navigate("/products")}><BarcodeIcon className="ml-2 h-4 w-4" />تعديل بيانات المنتجات والباركود</Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </MainLayout>
  );
}
