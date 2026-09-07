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
  Loader2,
  Package,
  PackageCheck,
  PackagePlus,
  Plus,
  ScanLine,
  Search,
  ShoppingBag,
} from "lucide-react";

const PAGE_SIZE = 50;

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} ${siteConfig.currency}`;
}

function statNumber(value?: number | null) {
  return Number(value || 0).toLocaleString("ar-EG");
}

function stockBadge(row: ProductManagementRow) {
  if (row.stock_status === "out") return <Badge variant="destructive">نفد</Badge>;
  if (row.stock_status === "low") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">منخفض</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">متوفر</Badge>;
}

function reviewBadge(issue: LegacyBulkReviewRow["issue"]) {
  if (issue === "missing_barcode") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">باركود الجملة ناقص</Badge>;
  if (issue === "barcode_conflict") return <Badge variant="destructive">تعارض باركود</Badge>;
  return <Badge variant="secondary">تحتاج مراجعة</Badge>;
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

  useEffect(() => {
    void loadRows();
  }, [debouncedSearch, companyId, categoryId, page]);

  useEffect(() => {
    void loadStats();
  }, []);

  useEffect(() => {
    const onCatalogChanged = () => {
      void loadRows();
      void loadStats();
      if (legacyReviewOpen) void openLegacyReview();
    };
    window.addEventListener("catalog:changed", onCatalogChanged);
    return () => window.removeEventListener("catalog:changed", onCatalogChanged);
  }, [debouncedSearch, companyId, categoryId, page, legacyReviewOpen]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const companyNames = useMemo(() => new Map(companies.map(company => [company.id, company.name])), [companies]);
  const categoryNames = useMemo(() => new Map(categories.map(category => [category.id, category.name])), [categories]);

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

  return (
    <MainLayout>
      <div className="space-y-5 p-4 pb-10 md:p-6" dir="rtl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">المنتجات</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              المنتج الأساسي ووحدات الجملة يظهروا كسجلات مستقلة، مع مخزون موحد في الخلفية.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/inventory-import")}>
              <FileSpreadsheet className="ms-2 h-4 w-4" />
              رفع منتجات Excel
            </Button>
            <Button variant="outline" onClick={() => void exportExcel()} disabled={exporting}>
              {exporting ? <Loader2 className="ms-2 h-4 w-4 animate-spin" /> : <Download className="ms-2 h-4 w-4" />}
              تصدير
            </Button>
            <Button onClick={() => navigate("/add-product")}>
              <Plus className="ms-2 h-4 w-4" />
              إضافة منتج
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs text-muted-foreground">المنتجات الأساسية</p><p className="mt-1 text-2xl font-bold">{statsLoading ? "—" : statNumber(stats?.total_products)}</p></div><Package className="h-7 w-7 text-primary/60" /></CardContent></Card>
          <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs text-muted-foreground">وحدات البيع النشطة</p><p className="mt-1 text-2xl font-bold">{statsLoading ? "—" : statNumber(stats?.active_sale_units)}</p></div><Box className="h-7 w-7 text-primary/60" /></CardContent></Card>
          <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs text-muted-foreground">متوفر</p><p className="mt-1 text-2xl font-bold text-emerald-700">{statsLoading ? "—" : statNumber(stats?.in_stock_products)}</p></div><PackageCheck className="h-7 w-7 text-emerald-600/70" /></CardContent></Card>
          <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs text-muted-foreground">مخزون منخفض</p><p className="mt-1 text-2xl font-bold text-amber-700">{statsLoading ? "—" : statNumber(stats?.low_stock_products)}</p></div><AlertTriangle className="h-7 w-7 text-amber-500" /></CardContent></Card>
          <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs text-muted-foreground">نفد المخزون</p><p className="mt-1 text-2xl font-bold text-destructive">{statsLoading ? "—" : statNumber(stats?.out_of_stock_products)}</p></div><ShoppingBag className="h-7 w-7 text-destructive/60" /></CardContent></Card>
          <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs text-muted-foreground">عروض فعالة</p><p className="mt-1 text-2xl font-bold text-[#005931]">{statsLoading ? "—" : statNumber(stats?.offer_products)}</p></div><PackagePlus className="h-7 w-7 text-[#005931]/70" /></CardContent></Card>
        </div>

        {Boolean(stats?.legacy_bulk_unresolved) && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-950">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>
                يوجد <strong>{statNumber(stats?.legacy_bulk_unresolved)}</strong> منتج جملة قديم لم يتم تحويله تلقائيًا لوحدة بيع مرتبطة بسبب باركود ناقص أو متعارض. تم الإبقاء عليه بالنظام القديم حتى تتم مراجعته يدويًا بدون مخاطرة بالمخزون.
              </span>
              <Button type="button" size="sm" variant="outline" className="border-amber-400 bg-white" onClick={() => void openLegacyReview()}>
                عرض المنتجات المحتاجة مراجعة
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_220px_220px_auto]">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="ابحث بالاسم أو الباركود أو اسم وحدة الجملة..."
                  className="pr-9"
                />
              </div>
              <Select value={companyId} onValueChange={value => { setCompanyId(value); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder="الشركة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الشركات</SelectItem>
                  {companies.map(company => <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={categoryId} onValueChange={value => { setCategoryId(value); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder="القسم" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأقسام</SelectItem>
                  {categories.map(category => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="icon" onClick={() => setScannerOpen(true)} title="مسح باركود">
                  <ScanLine className="h-4 w-4" />
                </Button>
                {(search || companyId !== "all" || categoryId !== "all") && (
                  <Button type="button" variant="ghost" onClick={clearFilters}>مسح الفلاتر</Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>النتائج الحالية: {statNumber(total)} سجل حسب البحث والفلاتر</span>
              {stats && <span>الأرقام بالأعلى محسوبة على الفرع كاملًا، وليست الصفحة الحالية.</span>}
            </div>

            <div className="overflow-hidden rounded-xl border">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الصورة</TableHead>
                      <TableHead>المنتج</TableHead>
                      <TableHead>الباركود</TableHead>
                      <TableHead>النوع</TableHead>
                      <TableHead>سعر البيع</TableHead>
                      <TableHead>سعر الشراء</TableHead>
                      <TableHead>الربح</TableHead>
                      <TableHead>المخزون</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead className="text-left">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={10}><div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="ms-2 h-5 w-5 animate-spin" /> جاري تحميل المنتجات...</div></TableCell></TableRow>
                    ) : rows.length === 0 ? (
                      <TableRow><TableCell colSpan={10}><div className="py-12 text-center text-muted-foreground"><Package className="mx-auto mb-3 h-9 w-9 opacity-30" /><p>لا توجد منتجات مطابقة</p></div></TableCell></TableRow>
                    ) : rows.map(row => {
                      const profitValue = Number(row.price || 0) - Number(row.purchase_price || 0);
                      return (
                        <TableRow key={row.row_key} className={!row.active ? "opacity-55" : ""}>
                          <TableCell>
                            <div className="h-12 w-12 overflow-hidden rounded-lg border bg-muted">
                              {row.image_urls?.[0] ? <img src={row.image_urls[0]} alt={row.name} className="h-full w-full object-contain" /> : <ImageIcon className="m-auto h-full w-5 text-muted-foreground/40" />}
                            </div>
                          </TableCell>
                          <TableCell className="min-w-[220px]">
                            <button
                              type="button"
                              className="text-right"
                              onClick={() => navigate(row.is_linked_sale_unit ? `/add-product?id=${row.base_product_id}` : `/product-details/${row.base_product_id}`)}
                            >
                              <p className="font-semibold hover:text-primary">{row.name}</p>
                              {row.is_linked_sale_unit ? (
                                <p className="mt-0.5 text-xs text-muted-foreground">مرتبط بـ {row.parent_name} · ×{Number(row.conversion_factor).toLocaleString("ar-EG")}</p>
                              ) : (
                                <p className="mt-0.5 text-xs text-muted-foreground">{row.company_id ? companyNames.get(row.company_id) || "" : ""}{row.main_category_id ? ` · ${categoryNames.get(row.main_category_id) || ""}` : ""}</p>
                              )}
                            </button>
                          </TableCell>
                          <TableCell><span className="font-mono text-xs" dir="ltr">{row.barcode || "—"}</span></TableCell>
                          <TableCell>
                            {row.is_linked_sale_unit ? <Badge variant="secondary"><PackagePlus className="ms-1 h-3 w-3" />{row.variant_type || "جملة"} ×{Number(row.conversion_factor)}</Badge> : row.barcode_type === "scale" ? <Badge variant="outline"><Barcode className="ms-1 h-3 w-3" />ميزان</Badge> : <Badge variant="outline">أساسي</Badge>}
                          </TableCell>
                          <TableCell className="font-semibold">{money(row.price)}</TableCell>
                          <TableCell>{money(row.purchase_price)}</TableCell>
                          <TableCell className={profitValue < 0 ? "font-semibold text-destructive" : "font-semibold text-emerald-700"}>{money(profitValue)}</TableCell>
                          <TableCell>
                            <div className="font-semibold">{Number(row.quantity || 0).toLocaleString("ar-EG")}</div>
                            <div className="text-[11px] text-muted-foreground">{row.unit_of_measure || "وحدة"}</div>
                          </TableCell>
                          <TableCell><div className="flex flex-col items-start gap-1">{stockBadge(row)}{!row.active && <Badge variant="secondary">متوقف</Badge>}</div></TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              {!row.is_linked_sale_unit && (
                                <Button type="button" variant="ghost" size="icon" title="التفاصيل" onClick={() => navigate(`/product-details/${row.base_product_id}`)}><Eye className="h-4 w-4" /></Button>
                              )}
                              <Button type="button" variant="ghost" size="icon" title="تعديل" onClick={() => navigate(`/add-product?id=${row.base_product_id}`)}><Edit3 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-muted-foreground">
                {total > 0 ? `عرض ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} من ${total}` : "لا توجد نتائج"}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronRight className="h-4 w-4" /> السابق</Button>
                <span className="min-w-20 text-center">{page} / {pageCount}</span>
                <Button variant="outline" size="sm" disabled={page >= pageCount || loading} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>التالي <ChevronLeft className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={legacyReviewOpen} onOpenChange={setLegacyReviewOpen}>
          <DialogContent dir="rtl" className="max-h-[88vh] max-w-5xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>مراجعة منتجات الجملة القديمة</DialogTitle>
              <DialogDescription>
                هذه المنتجات لم يتم تحويلها تلقائيًا لأن إنشاء وحدة بيع جديدة لها يحتاج باركود جملة فريد. تعديل المنتج وحفظ وحدة البيع الصحيحة سيخرجه من القائمة تلقائيًا.
              </DialogDescription>
            </DialogHeader>

            {legacyReviewLoading ? (
              <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="ms-2 h-5 w-5 animate-spin" /> تحميل قائمة المراجعة...</div>
            ) : legacyReviewRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-emerald-50 p-10 text-center text-emerald-900">
                <PackageCheck className="mx-auto mb-2 h-8 w-8" />
                لا توجد منتجات جملة قديمة تحتاج مراجعة.
              </div>
            ) : (
              <div className="space-y-2">
                {legacyReviewRows.map(row => (
                  <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 p-1">
                      {row.image_url ? <img src={row.image_url} alt={row.name} className="h-full w-full object-contain" /> : <Package className="h-5 w-5 text-muted-foreground/40" />}
                    </div>
                    <div className="min-w-[210px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{row.name}</p>
                        {reviewBadge(row.issue)}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>باركود الأصل: <bdi dir="ltr">{row.barcode || "—"}</bdi></span>
                        <span>باركود الجملة: <bdi dir="ltr">{row.bulk_barcode || "—"}</bdi></span>
                        <span>العبوة × {statNumber(row.bulk_quantity)}</span>
                        <span>سعر الجملة {money(row.bulk_price)}</span>
                        <span>مخزون الأصل {statNumber(row.quantity)}</span>
                      </div>
                    </div>
                    <Button type="button" onClick={() => navigate(`/add-product?id=${row.id}`)}>
                      <Edit3 className="ms-2 h-4 w-4" /> تعديل وحل المشكلة
                    </Button>
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
