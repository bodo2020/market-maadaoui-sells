import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import BarcodeScanner from "@/components/POS/BarcodeScanner";
import { fetchCompanies } from "@/services/supabase/companyService";
import { fetchMainCategories } from "@/services/supabase/categoryService";
import {
  fetchAllProductManagementRows,
  fetchLegacyBulkReviewQueue,
  fetchProductManagementPage,
  fetchProductManagementStats,
  type LegacyBulkReviewRow,
  type ProductManagementRow,
  type ProductManagementStats,
} from "@/services/supabase/productManagementService";
import type { Company, MainCategory } from "@/types";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  AlertTriangle,
  Barcode,
  Box,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Package,
  PackageCheck,
  PackagePlus,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";

const PAGE_SIZE = 50;

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} ${siteConfig.currency}`;
}

function statNumber(value?: number | null) {
  return Number(value || 0).toLocaleString("ar-EG");
}

function stockBadge(row: ProductManagementRow) {
  if (!row.active) return <Badge variant="secondary">متوقف</Badge>;
  if (row.stock_status === "out") return <Badge variant="destructive">نفد</Badge>;
  if (row.stock_status === "low") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">منخفض</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">متوفر</Badge>;
}

function reviewBadge(issue: LegacyBulkReviewRow["issue"]) {
  if (issue === "missing_barcode") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">باركود ناقص</Badge>;
  if (issue === "barcode_conflict") return <Badge variant="destructive">تعارض باركود</Badge>;
  return <Badge variant="secondary">تحتاج مراجعة</Badge>;
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "green" | "amber" | "red";
  hint?: string;
}) {
  const tones = {
    default: "bg-slate-50 text-slate-700",
    green: "bg-emerald-50 text-[#005931]",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-black tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        <div className={`rounded-xl p-2.5 ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
      </div>
    </div>
  );
}

function ProductThumb({ row }: { row: ProductManagementRow }) {
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
      {row.image_urls?.[0] ? (
        <img src={row.image_urls[0]} alt={row.name} className="h-full w-full object-contain" />
      ) : (
        <ImageIcon className="h-5 w-5 text-muted-foreground/35" />
      )}
    </div>
  );
}

export default function ProductManagement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<ProductManagementRow[]>([]);
  const [stats, setStats] = useState<ProductManagementStats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [companyId, setCompanyId] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<MainCategory[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [legacyReviewOpen, setLegacyReviewOpen] = useState(false);
  const [legacyReviewLoading, setLegacyReviewLoading] = useState(false);
  const [legacyReviewRows, setLegacyReviewRows] = useState<LegacyBulkReviewRow[]>([]);

  useEffect(() => {
    void Promise.all([fetchCompanies(), fetchMainCategories()])
      .then(([companyRows, categoryRows]) => {
        setCompanies(companyRows || []);
        setCategories(categoryRows || []);
      })
      .catch(error => console.error("Product filter data error:", error));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadRows = async () => {
    setLoading(true);
    try {
      const result = await fetchProductManagementPage({
        search: debouncedSearch,
        companyId: companyId === "all" ? null : companyId,
        categoryId: categoryId === "all" ? null : categoryId,
        page,
        pageSize: PAGE_SIZE,
      });
      setRows(result.rows);
      setTotal(result.total);
    } catch (error: any) {
      setRows([]);
      setTotal(0);
      toast({
        title: "تعذر تحميل المنتجات",
        description: error?.message || "راجع الفرع الحالي وحاول مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      setStats(await fetchProductManagementStats());
    } catch (error) {
      console.error("Product management stats error:", error);
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  };

  const refreshAll = () => {
    void loadRows();
    void loadStats();
  };

  const openLegacyReview = async () => {
    setLegacyReviewOpen(true);
    setLegacyReviewLoading(true);
    try {
      setLegacyReviewRows(await fetchLegacyBulkReviewQueue());
    } catch (error: any) {
      setLegacyReviewRows([]);
      toast({ title: "تعذر تحميل قائمة المراجعة", description: error?.message, variant: "destructive" });
    } finally {
      setLegacyReviewLoading(false);
    }
  };

  useEffect(() => { void loadRows(); }, [debouncedSearch, companyId, categoryId, page]);
  useEffect(() => { void loadStats(); }, []);

  useEffect(() => {
    const onCatalogChanged = () => {
      refreshAll();
      if (legacyReviewOpen) void openLegacyReview();
    };
    window.addEventListener("catalog:changed", onCatalogChanged);
    return () => window.removeEventListener("catalog:changed", onCatalogChanged);
  }, [debouncedSearch, companyId, categoryId, page, legacyReviewOpen]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const companyNames = useMemo(() => new Map(companies.map(company => [company.id, company.name])), [companies]);
  const categoryNames = useMemo(() => new Map(categories.map(category => [category.id, category.name])), [categories]);
  const activeFilterCount = Number(Boolean(search)) + Number(companyId !== "all") + Number(categoryId !== "all");

  const handleBarcodeScan = (barcodeValue: string) => {
    setScannerOpen(false);
    setSearch(barcodeValue);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setCompanyId("all");
    setCategoryId("all");
    setPage(1);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const exportRows = await fetchAllProductManagementRows({
        search: debouncedSearch,
        companyId: companyId === "all" ? null : companyId,
        categoryId: categoryId === "all" ? null : categoryId,
      });

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "المعداوي ماركت";
      workbook.created = new Date();
      const sheet = workbook.addWorksheet("المنتجات", { views: [{ rightToLeft: true }] });
      sheet.columns = [
        { header: "نوع السجل", key: "type", width: 18 },
        { header: "اسم المنتج", key: "name", width: 34 },
        { header: "المنتج الأساسي", key: "parent", width: 30 },
        { header: "الباركود", key: "barcode", width: 22 },
        { header: "الوحدة", key: "unit", width: 15 },
        { header: "معامل التحويل", key: "factor", width: 15 },
        { header: "سعر البيع", key: "price", width: 14 },
        { header: "سعر الشراء", key: "purchase", width: 14 },
        { header: "الربح", key: "profit", width: 14 },
        { header: "المخزون", key: "quantity", width: 14 },
        { header: "الشركة", key: "company", width: 22 },
        { header: "القسم", key: "category", width: 22 },
        { header: "الحالة", key: "status", width: 14 },
      ];

      exportRows.forEach(row => {
        sheet.addRow({
          type: row.is_linked_sale_unit ? "وحدة بيع مرتبطة" : "منتج أساسي",
          name: row.name,
          parent: row.parent_name || "",
          barcode: row.barcode || "",
          unit: row.unit_of_measure || "",
          factor: row.conversion_factor || 1,
          price: Number(row.price || 0),
          purchase: Number(row.purchase_price || 0),
          profit: Number(row.price || 0) - Number(row.purchase_price || 0),
          quantity: Number(row.quantity || 0),
          company: row.company_id ? companyNames.get(row.company_id) || "" : "",
          category: row.main_category_id ? categoryNames.get(row.main_category_id) || "" : "",
          status: row.active ? (row.stock_status === "out" ? "نفد" : row.stock_status === "low" ? "منخفض" : "متوفر") : "متوقف",
        });
      });

      const header = sheet.getRow(1);
      header.font = { bold: true };
      header.alignment = { horizontal: "center", vertical: "middle" };
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) row.alignment = { horizontal: "right", vertical: "middle" };
      });

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `المنتجات_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      toast({ title: `تم تصدير ${exportRows.length} سجل` });
    } catch (error: any) {
      toast({ title: "تعذر تصدير المنتجات", description: error?.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const openProduct = (row: ProductManagementRow) => {
    navigate(row.is_linked_sale_unit ? `/add-product?id=${row.base_product_id}` : `/product-details/${row.base_product_id}`);
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1700px] space-y-5 pb-10" dir="rtl">
        <section className="overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#005931_0%,#087147_55%,#0a8051_100%)] p-5 text-white shadow-sm md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2 text-sm text-white/75">
                <Sparkles className="h-4 w-4" />
                إدارة المنتجات والمخزون
              </div>
              <h1 className="text-3xl font-black tracking-tight md:text-4xl">المنتجات</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/75">
                ابحث، راجع المخزون والأسعار، وعدّل المنتج أو وحدات الجملة من مكان واحد سريع وواضح.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button className="h-11 bg-white text-[#005931] hover:bg-white/90" onClick={() => navigate("/add-product")}>
                <Plus className="ms-2 h-4 w-4" /> إضافة منتج
              </Button>
              <Button variant="outline" className="h-11 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => navigate("/inventory-import")}>
                <FileSpreadsheet className="ms-2 h-4 w-4" /> Excel
              </Button>
              <Button variant="outline" className="h-11 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => void exportExcel()} disabled={exporting}>
                {exporting ? <Loader2 className="ms-2 h-4 w-4 animate-spin" /> : <Download className="ms-2 h-4 w-4" />}
                تصدير
              </Button>
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="المنتجات الأساسية" value={statsLoading ? "—" : statNumber(stats?.total_products)} icon={Package} hint={`${statsLoading ? "—" : statNumber(stats?.active_sale_units)} وحدة بيع مرتبطة`} />
          <StatCard label="متوفر بالمخزون" value={statsLoading ? "—" : statNumber(stats?.in_stock_products)} icon={PackageCheck} tone="green" hint={`${statsLoading ? "—" : statNumber(stats?.offer_products)} منتج عليه عرض`} />
          <StatCard label="مخزون منخفض" value={statsLoading ? "—" : statNumber(stats?.low_stock_products)} icon={AlertTriangle} tone="amber" hint="يحتاج متابعة قبل النفاد" />
          <StatCard label="نفد المخزون" value={statsLoading ? "—" : statNumber(stats?.out_of_stock_products)} icon={ShoppingBag} tone="red" hint="منتجات تحتاج إعادة توريد" />
        </div>

        {Boolean(stats?.legacy_bulk_unresolved) && (
          <Alert className="rounded-2xl border-amber-200 bg-amber-50 text-amber-950">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>
                <strong>{statNumber(stats?.legacy_bulk_unresolved)}</strong> منتج جملة قديم يحتاج مراجعة باركود قبل التحويل للنظام الجديد.
              </span>
              <Button type="button" size="sm" variant="outline" className="border-amber-300 bg-white" onClick={() => void openLegacyReview()}>
                مراجعتها الآن
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Card className="sticky top-2 z-10 border-0 bg-white/95 shadow-md ring-1 ring-slate-200 backdrop-blur">
          <CardContent className="p-3 md:p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="اسم المنتج، الباركود، أو اسم الكرتونة..."
                  className="h-12 rounded-xl border-slate-200 bg-slate-50 pr-11 text-base focus-visible:bg-white"
                />
                {search && (
                  <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-slate-200" onClick={() => setSearch("")} aria-label="مسح البحث">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Button type="button" variant="outline" className="h-12 shrink-0 rounded-xl px-4" onClick={() => setScannerOpen(true)}>
                <ScanLine className="ms-2 h-5 w-5" /> مسح باركود
              </Button>

              <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:w-[430px]">
                <Select value={companyId} onValueChange={value => { setCompanyId(value); setPage(1); }}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="الشركة" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الشركات</SelectItem>
                    {companies.map(company => <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={categoryId} onValueChange={value => { setCategoryId(value); setPage(1); }}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="القسم" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأقسام</SelectItem>
                    {categories.map(category => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <Button type="button" variant="ghost" size="icon" className="h-12 w-12 shrink-0 rounded-xl" onClick={refreshAll} title="تحديث">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1"><LayoutGrid className="h-3.5 w-3.5" /> {statNumber(total)} نتيجة</span>
                {activeFilterCount > 0 && <Badge variant="secondary" className="gap-1"><SlidersHorizontal className="h-3 w-3" /> {activeFilterCount} فلتر نشط</Badge>}
              </div>
              {activeFilterCount > 0 && <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={clearFilters}>مسح الفلاتر</Button>}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-slate-200">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex min-h-72 items-center justify-center text-muted-foreground">
                <Loader2 className="ms-2 h-5 w-5 animate-spin text-[#005931]" /> جاري تحميل المنتجات...
              </div>
            ) : rows.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center px-4 text-center">
                <div className="rounded-2xl bg-slate-100 p-4"><Package className="h-8 w-8 text-muted-foreground/50" /></div>
                <h3 className="mt-4 font-bold">لا توجد منتجات مطابقة</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">غيّر البحث أو الفلاتر، أو أضف منتجًا جديدًا لو القائمة فاضية.</p>
                <Button className="mt-4" onClick={() => navigate("/add-product")}><Plus className="ms-2 h-4 w-4" /> إضافة منتج</Button>
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                        <TableHead className="w-[36%]">المنتج</TableHead>
                        <TableHead>الباركود والنوع</TableHead>
                        <TableHead>الأسعار</TableHead>
                        <TableHead>المخزون</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead className="w-24 text-left">إجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map(row => {
                        const profitValue = Number(row.price || 0) - Number(row.purchase_price || 0);
                        const subtitle = row.is_linked_sale_unit
                          ? `مرتبط بـ ${row.parent_name || "المنتج الأساسي"} · ×${Number(row.conversion_factor || 1).toLocaleString("ar-EG")}`
                          : [row.company_id ? companyNames.get(row.company_id) : "", row.main_category_id ? categoryNames.get(row.main_category_id) : ""].filter(Boolean).join(" · ");
                        return (
                          <TableRow key={row.row_key} className={`group cursor-pointer ${!row.active ? "opacity-55" : ""}`} onDoubleClick={() => openProduct(row)}>
                            <TableCell>
                              <button type="button" className="flex w-full items-center gap-3 text-right" onClick={() => openProduct(row)}>
                                <ProductThumb row={row} />
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate font-bold group-hover:text-[#005931]">{row.name}</p>
                                    {row.is_linked_sale_unit && <Badge variant="secondary" className="text-[10px]">{row.variant_type || "جملة"} ×{Number(row.conversion_factor || 1)}</Badge>}
                                  </div>
                                  <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle || row.unit_of_measure || "منتج"}</p>
                                </div>
                              </button>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-mono text-xs" dir="ltr">{row.barcode || "—"}</div>
                                <div className="text-[11px] text-muted-foreground">{row.is_linked_sale_unit ? "وحدة بيع" : row.barcode_type === "scale" ? "ميزان / PLU" : "باركود عادي"}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="font-bold text-[#005931]">{money(row.price)}</div>
                              <div className="mt-1 text-[11px] text-muted-foreground">شراء {money(row.purchase_price)} · <span className={profitValue < 0 ? "text-red-600" : "text-emerald-700"}>ربح {money(profitValue)}</span></div>
                            </TableCell>
                            <TableCell>
                              <div className="font-black">{Number(row.quantity || 0).toLocaleString("ar-EG")}</div>
                              <div className="text-[11px] text-muted-foreground">{row.unit_of_measure || "وحدة"}</div>
                            </TableCell>
                            <TableCell>{stockBadge(row)}</TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                {!row.is_linked_sale_unit && <Button type="button" variant="ghost" size="icon" title="التفاصيل" onClick={() => navigate(`/product-details/${row.base_product_id}`)}><Eye className="h-4 w-4" /></Button>}
                                <Button type="button" variant="ghost" size="icon" title="تعديل" onClick={() => navigate(`/add-product?id=${row.base_product_id}`)}><Edit3 className="h-4 w-4" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="divide-y lg:hidden">
                  {rows.map(row => {
                    const profitValue = Number(row.price || 0) - Number(row.purchase_price || 0);
                    return (
                      <div key={row.row_key} className={`p-4 ${!row.active ? "opacity-55" : ""}`}>
                        <div className="flex gap-3">
                          <ProductThumb row={row} />
                          <button type="button" className="min-w-0 flex-1 text-right" onClick={() => openProduct(row)}>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate font-bold">{row.name}</h3>
                              {stockBadge(row)}
                            </div>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {row.is_linked_sale_unit ? `${row.variant_type || "جملة"} ×${Number(row.conversion_factor || 1)} · مرتبط بـ ${row.parent_name || "الأصل"}` : row.barcode || "بدون باركود"}
                            </p>
                          </button>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3 text-center">
                          <div><p className="text-[10px] text-muted-foreground">سعر البيع</p><p className="mt-1 text-sm font-black text-[#005931]">{money(row.price)}</p></div>
                          <div><p className="text-[10px] text-muted-foreground">الربح</p><p className={`mt-1 text-sm font-bold ${profitValue < 0 ? "text-red-600" : "text-emerald-700"}`}>{money(profitValue)}</p></div>
                          <div><p className="text-[10px] text-muted-foreground">المخزون</p><p className="mt-1 text-sm font-black">{Number(row.quantity || 0).toLocaleString("ar-EG")}</p></div>
                        </div>

                        <div className="mt-3 flex gap-2">
                          <Button type="button" variant="outline" className="flex-1" onClick={() => navigate(`/add-product?id=${row.base_product_id}`)}><Edit3 className="ms-2 h-4 w-4" /> تعديل</Button>
                          {!row.is_linked_sale_unit && <Button type="button" variant="ghost" className="flex-1" onClick={() => navigate(`/product-details/${row.base_product_id}`)}><Eye className="ms-2 h-4 w-4" /> التفاصيل</Button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div className="flex flex-col gap-3 border-t bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {total > 0 ? `عرض ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} من ${statNumber(total)}` : "لا توجد نتائج"}
              </p>
              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronRight className="h-4 w-4" /> السابق</Button>
                <span className="min-w-16 text-center text-sm font-semibold">{page} / {pageCount}</span>
                <Button variant="outline" size="sm" disabled={page >= pageCount || loading} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>التالي <ChevronLeft className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={legacyReviewOpen} onOpenChange={setLegacyReviewOpen}>
          <DialogContent dir="rtl" className="max-h-[88vh] max-w-5xl overflow-y-auto rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-xl">مراجعة منتجات الجملة القديمة</DialogTitle>
              <DialogDescription>
                أصلح الباركود فقط، وبعدها حوّل بيانات الجملة لوحدة بيع مرتبطة من صفحة تعديل المنتج.
              </DialogDescription>
            </DialogHeader>

            {legacyReviewLoading ? (
              <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="ms-2 h-5 w-5 animate-spin" /> تحميل قائمة المراجعة...</div>
            ) : legacyReviewRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-emerald-50 p-10 text-center text-emerald-900">
                <PackageCheck className="mx-auto mb-2 h-8 w-8" /> لا توجد منتجات تحتاج مراجعة.
              </div>
            ) : (
              <div className="space-y-2">
                {legacyReviewRows.map(row => (
                  <div key={row.id} className="flex flex-col gap-3 rounded-2xl border bg-white p-3 sm:flex-row sm:items-center">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 p-1">
                      {row.image_url ? <img src={row.image_url} alt={row.name} className="h-full w-full object-contain" /> : <Package className="h-5 w-5 text-muted-foreground/40" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="font-bold">{row.name}</p>{reviewBadge(row.issue)}</div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>باركود الأصل: <bdi dir="ltr">{row.barcode || "—"}</bdi></span>
                        <span>باركود الجملة: <bdi dir="ltr">{row.bulk_barcode || "—"}</bdi></span>
                        <span>العبوة × {statNumber(row.bulk_quantity)}</span>
                        <span>سعر الجملة {money(row.bulk_price)}</span>
                      </div>
                    </div>
                    <Button type="button" onClick={() => navigate(`/add-product?id=${row.id}`)}><Edit3 className="ms-2 h-4 w-4" /> تعديل وحل المشكلة</Button>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <BarcodeScanner isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleBarcodeScan} />
      </div>
    </MainLayout>
  );
}
