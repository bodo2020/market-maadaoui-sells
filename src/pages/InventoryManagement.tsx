import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  BellRing,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileSpreadsheet,
  History,
  Loader2,
  Package,
  PackagePlus,
  PackageSearch,
  Pencil,
  Scale,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  Warehouse,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useBranchStore } from "@/stores/branchStore";
import { siteConfig } from "@/config/site";
import {
  adjustInventoryStockV2,
  fetchInventoryControlCenterV2,
  fetchInventoryProductMovementsV2,
  setInventoryStockPolicyV2,
  type InventoryAdjustmentReason,
  type InventoryControlProductV2,
  type InventoryControlStatus,
} from "@/services/supabase/inventoryControlCenterV2Service";

const PAGE_SIZE = 40;

const formatQty = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 3 });

const formatMoney = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ${siteConfig.currency}`;

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

const adjustmentReasonLabels: Record<InventoryAdjustmentReason, string> = {
  manual_correction: "تصحيح رصيد يدوي",
  receiving_correction: "تصحيح استلام",
  damage: "تالف",
  breakage: "كسر",
  loss: "فقد / عجز",
  internal_use: "استخدام داخلي",
  opening_balance: "رصيد افتتاحي",
  other: "سبب آخر",
};

const movementSourceLabels: Record<string, string> = {
  manual_inventory_adjustment: "تسوية يدوية",
  inventory_audit_adjustment: "تسوية جرد معتمدة",
  inventory_quantity_update: "حركة مخزون",
};

const statusLabels: Record<InventoryControlStatus, string> = {
  all: "كل المخزون",
  healthy: "سليم",
  low_stock: "منخفض",
  out_of_stock: "نافد",
  overstock: "تكدس",
  no_movement: "راكد 30 يوم",
  coverage_risk: "تغطية منخفضة",
  alerts: "تنبيهات مفعلة",
};

function stockBadge(product: InventoryControlProductV2) {
  if (product.stock_status === "out_of_stock") {
    return <Badge className="border-red-200 bg-red-50 text-red-700 hover:bg-red-50">نافد</Badge>;
  }
  if (product.stock_status === "low_stock") {
    return <Badge className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">مخزون منخفض</Badge>;
  }
  if (product.stock_status === "coverage_risk") {
    return <Badge className="border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-50">تغطية منخفضة</Badge>;
  }
  if (product.stock_status === "overstock") {
    return <Badge className="border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-50">تكدس</Badge>;
  }
  if (product.stock_status === "no_movement") {
    return <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">راكد 30 يوم</Badge>;
  }
  return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">سليم</Badge>;
}

function movementReasonLabel(reason?: string | null) {
  if (!reason) return null;
  return adjustmentReasonLabels[reason as InventoryAdjustmentReason] || reason;
}

export default function InventoryManagement() {
  const navigate = useNavigate();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InventoryControlStatus>("all");
  const [categoryId, setCategoryId] = useState("all");
  const [page, setPage] = useState(0);

  const [policyProduct, setPolicyProduct] = useState<InventoryControlProductV2 | null>(null);
  const [minStock, setMinStock] = useState("");
  const [maxStock, setMaxStock] = useState("");
  const [alertEnabled, setAlertEnabled] = useState(false);

  const [adjustProduct, setAdjustProduct] = useState<InventoryControlProductV2 | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState<InventoryAdjustmentReason>("manual_correction");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustRequestId, setAdjustRequestId] = useState("");

  const [movementProduct, setMovementProduct] = useState<InventoryControlProductV2 | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(0);
  }, [search, status, categoryId, currentBranchId]);

  const query = useQuery({
    queryKey: ["inventory-control-center-v2", currentBranchId, search, status, categoryId, page],
    enabled: Boolean(currentBranchId),
    queryFn: () =>
      fetchInventoryControlCenterV2(currentBranchId as string, {
        search,
        status,
        categoryId: categoryId === "all" ? null : categoryId,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const movementQuery = useQuery({
    queryKey: ["inventory-product-movements-v2", currentBranchId, movementProduct?.product_id],
    enabled: Boolean(currentBranchId && movementProduct?.product_id),
    queryFn: () => fetchInventoryProductMovementsV2(currentBranchId as string, movementProduct!.product_id, 100),
  });

  const data = query.data;
  const summary = data?.summary;
  const canManage = Boolean(data?.permissions.can_manage);
  const totalPages = Math.max(1, Math.ceil(Number(data?.total_filtered || 0) / PAGE_SIZE));
  const activePage = Math.min(page + 1, totalPages);

  const inventorySourceDifferent = Boolean(
    data && data.inventory_source_branch_id && data.inventory_source_branch_id !== data.branch_id,
  );

  const openPolicy = (product: InventoryControlProductV2) => {
    setPolicyProduct(product);
    setMinStock(String(product.min_stock_level ?? 0));
    setMaxStock(product.max_stock_level == null ? "" : String(product.max_stock_level));
    setAlertEnabled(Boolean(product.alert_enabled));
  };

  const closePolicy = () => {
    setPolicyProduct(null);
    setMinStock("");
    setMaxStock("");
    setAlertEnabled(false);
  };

  const savePolicy = async () => {
    if (!currentBranchId || !policyProduct || busy) return;
    const minValue = Number(minStock);
    const maxValue = maxStock.trim() === "" ? null : Number(maxStock);
    if (!Number.isFinite(minValue) || minValue < 0) return toast.error("أدخل حدًا أدنى صحيحًا.");
    if (maxValue !== null && (!Number.isFinite(maxValue) || maxValue < minValue)) {
      return toast.error("الحد الأقصى يجب ألا يقل عن الحد الأدنى.");
    }
    setBusy(true);
    try {
      await setInventoryStockPolicyV2(
        currentBranchId,
        policyProduct.product_id,
        minValue,
        maxValue,
        alertEnabled,
      );
      toast.success("تم تحديث سياسة المخزون والتنبيه.");
      closePolicy();
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحديث سياسة المخزون.");
    } finally {
      setBusy(false);
    }
  };

  const openAdjustment = (product: InventoryControlProductV2) => {
    setAdjustProduct(product);
    setAdjustDelta("");
    setAdjustReason("manual_correction");
    setAdjustNote("");
    setAdjustRequestId(crypto.randomUUID());
  };

  const closeAdjustment = () => {
    setAdjustProduct(null);
    setAdjustDelta("");
    setAdjustReason("manual_correction");
    setAdjustNote("");
    setAdjustRequestId("");
  };

  const submitAdjustment = async () => {
    if (!currentBranchId || !adjustProduct || !adjustRequestId || busy) return;
    const delta = Number(adjustDelta);
    if (!Number.isFinite(delta) || delta === 0 || Math.round(delta * 1000) !== delta * 1000) {
      return toast.error("أدخل فرق كمية صحيحًا، مثل 3 أو -1 أو 0.5.");
    }
    if (adjustNote.trim().length < 3) return toast.error("اكتب ملاحظة واضحة تشرح سبب التسوية.");
    if (adjustProduct.quantity + delta < 0) return toast.error("التسوية ستجعل الرصيد أقل من صفر.");
    setBusy(true);
    try {
      const result = await adjustInventoryStockV2(
        adjustRequestId,
        currentBranchId,
        adjustProduct.product_id,
        delta,
        adjustReason,
        adjustNote,
      );
      toast.success(
        `تمت التسوية: ${formatQty(result.quantity_before)} ← ${formatQty(result.quantity_after)} ${adjustProduct.unit_of_measure}`,
      );
      closeAdjustment();
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تنفيذ تسوية المخزون.");
    } finally {
      setBusy(false);
    }
  };

  const summaryCards = useMemo(
    () => [
      {
        key: "all" as InventoryControlStatus,
        label: "أصناف المخزون",
        value: summary?.sku_rows || 0,
        detail: `${formatQty(summary?.positive_stock_rows)} برصيد موجب`,
        icon: Boxes,
      },
      {
        key: "out_of_stock" as InventoryControlStatus,
        label: "نافد",
        value: summary?.out_of_stock_rows || 0,
        detail: "يحتاج توريد أو مراجعة",
        icon: PackageSearch,
      },
      {
        key: "low_stock" as InventoryControlStatus,
        label: "مخزون منخفض",
        value: summary?.low_stock_rows || 0,
        detail: `${formatQty(summary?.alerting_rows)} بتنبيه مفعّل`,
        icon: AlertTriangle,
      },
      {
        key: "no_movement" as InventoryControlStatus,
        label: "راكد 30 يوم",
        value: summary?.no_movement_rows || 0,
        detail: "رصيد موجب بلا بيع POS",
        icon: Clock3,
      },
      {
        key: "overstock" as InventoryControlStatus,
        label: "أعلى من الحد الأقصى",
        value: summary?.overstock_rows || 0,
        detail: "مرشح للنقل أو تقليل الشراء",
        icon: Warehouse,
      },
    ],
    [summary],
  );

  if (!currentBranchId) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-4xl p-6" dir="rtl">
          <Card>
            <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
              <Warehouse className="h-10 w-10 text-muted-foreground" />
              <h1 className="text-xl font-semibold">اختر فرعًا أولًا</h1>
              <p className="text-sm text-muted-foreground">مركز المخزون يعمل داخل سياق الفرع المصرح لك به.</p>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-5 p-4 md:p-6" dir="rtl">
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="bg-gradient-to-l from-emerald-950 via-emerald-900 to-emerald-800 px-5 py-6 text-white md:px-7">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">Inventory Control V2</Badge>
                  <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">{currentBranchName || data?.branch_name || "الفرع الحالي"}</Badge>
                </div>
                <h1 className="text-2xl font-bold md:text-3xl">مركز التحكم في المخزون</h1>
                <p className="max-w-3xl text-sm leading-6 text-emerald-50/90">
                  الرصيد، حدود المخزون، التنبيهات، حركة 30 يوم، الجرد وسجل التغييرات في مكان واحد. أي تسوية يدوية تمر الآن عبر سجل حركات قابل للمراجعة.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => navigate("/daily-inventory")}>
                  <ClipboardCheck className="ml-2 h-4 w-4" />
                  مركز الجرد
                </Button>
                <Button variant="secondary" onClick={() => navigate("/supplier-purchases")}>
                  <Truck className="ml-2 h-4 w-4" />
                  مشتريات الموردين
                </Button>
                <Button variant="outline" className="border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white" onClick={() => query.refetch()}>
                  <RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
                  تحديث
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-t bg-muted/25 p-4 md:grid-cols-2 xl:grid-cols-4">
            <button onClick={() => navigate("/reports/inventory")} className="flex items-center gap-3 rounded-xl border bg-background p-3 text-right transition hover:border-emerald-300 hover:shadow-sm">
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><BarChart3 className="h-5 w-5" /></div>
              <div><p className="font-medium">تقارير المخزون</p><p className="text-xs text-muted-foreground">القيمة والحركة والمخاطر</p></div>
            </button>
            <button onClick={() => navigate("/inventory-import")} className="flex items-center gap-3 rounded-xl border bg-background p-3 text-right transition hover:border-emerald-300 hover:shadow-sm">
              <div className="rounded-lg bg-blue-50 p-2 text-blue-700"><FileSpreadsheet className="h-5 w-5" /></div>
              <div><p className="font-medium">استيراد المخزون</p><p className="text-xs text-muted-foreground">ملفات Excel والاستيراد المنظم</p></div>
            </button>
            <button onClick={() => navigate("/tasks?type=inventory")} className="flex items-center gap-3 rounded-xl border bg-background p-3 text-right transition hover:border-emerald-300 hover:shadow-sm">
              <div className="rounded-lg bg-amber-50 p-2 text-amber-700"><ShieldCheck className="h-5 w-5" /></div>
              <div><p className="font-medium">مهام الفروق</p><p className="text-xs text-muted-foreground">{formatQty(summary?.pending_audit_tasks)} مهمة جرد ومراجعة</p></div>
            </button>
            <button onClick={() => navigate("/add-product")} className="flex items-center gap-3 rounded-xl border bg-background p-3 text-right transition hover:border-emerald-300 hover:shadow-sm">
              <div className="rounded-lg bg-violet-50 p-2 text-violet-700"><PackagePlus className="h-5 w-5" /></div>
              <div><p className="font-medium">منتج جديد</p><p className="text-xs text-muted-foreground">إضافة منتج وربطه بالمخزون</p></div>
            </button>
          </div>
        </section>

        {inventorySourceDifferent && data ? (
          <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">هذا الفرع يستخدم مخزونًا مشتركًا</p>
              <p className="mt-1 text-blue-800">مصدر الرصيد الفعلي: <strong>{data.inventory_source_branch_name}</strong>. التعديلات هنا تُطبق على مصدر المخزون المعتمد تلقائيًا.</p>
            </div>
          </div>
        ) : null}

        {Number(summary?.unlinked_inventory_rows || 0) > 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">جودة بيانات تحتاج مراجعة</p>
              <p className="mt-1">يوجد {formatQty(summary?.unlinked_inventory_rows)} سجل مخزون غير مرتبط حاليًا بصف منتج في الكتالوج. لم يتم حذفها أو تعديلها تلقائيًا.</p>
            </div>
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            const active = status === card.key;
            return (
              <button
                key={card.key}
                onClick={() => setStatus(card.key)}
                className={`rounded-2xl border bg-card p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${active ? "border-emerald-400 ring-2 ring-emerald-100" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="mt-1 text-2xl font-bold">{formatQty(card.value)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
                  </div>
                  <div className="rounded-xl bg-muted p-2.5"><Icon className="h-5 w-5" /></div>
                </div>
              </button>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> المخزون التشغيلي</CardTitle>
                  <CardDescription>بحث وفلترة Server-side بدل تحميل الكتالوج كاملًا داخل المتصفح.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">قيمة الشراء {formatMoney(summary?.purchase_value)}</Badge>
                  <Badge variant="outline">قيمة البيع {formatMoney(summary?.retail_value)}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 md:grid-cols-[1fr_180px_200px_auto]">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="ابحث بالاسم أو الباركود أو الرف..." className="pr-9" />
                </div>
                <Select value={status} onValueChange={(value) => setStatus(value as InventoryControlStatus)}>
                  <SelectTrigger><SelectValue placeholder="حالة المخزون" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue placeholder="كل الأقسام" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأقسام</SelectItem>
                    {(data?.categories || []).map((category) => (
                      <SelectItem key={category.id} value={category.id}>{category.name} ({formatQty(category.products)})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => { setSearchInput(""); setSearch(""); setStatus("all"); setCategoryId("all"); }}>
                  <SlidersHorizontal className="ml-2 h-4 w-4" /> مسح الفلاتر
                </Button>
              </div>

              {query.isLoading ? (
                <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-700" /></div>
              ) : query.isError ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 text-center">
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                  <p className="font-medium text-red-900">تعذر تحميل المخزون</p>
                  <p className="max-w-lg text-sm text-red-700">{query.error instanceof Error ? query.error.message : "حدث خطأ غير متوقع."}</p>
                  <Button variant="outline" onClick={() => query.refetch()}>إعادة المحاولة</Button>
                </div>
              ) : !(data?.products || []).length ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-center">
                  <PackageSearch className="h-9 w-9 text-muted-foreground" />
                  <p className="font-medium">لا توجد نتائج بهذه الفلاتر</p>
                  <p className="text-sm text-muted-foreground">جرّب تغيير البحث أو حالة المخزون.</p>
                </div>
              ) : (
                <>
                  <div className="hidden overflow-hidden rounded-xl border md:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-right">المنتج</TableHead>
                          <TableHead className="text-right">الرصيد</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right">بيع 30 يوم</TableHead>
                          <TableHead className="text-right">القيمة</TableHead>
                          <TableHead className="text-right">آخر جرد</TableHead>
                          <TableHead className="text-right">إجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data!.products.map((product) => (
                          <TableRow key={product.product_id}>
                            <TableCell>
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                                  {product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <Package className="h-5 w-5 text-muted-foreground" />}
                                </div>
                                <div className="min-w-0">
                                  <p className="max-w-[260px] truncate font-medium">{product.product_name}</p>
                                  <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                                    <span>{product.barcode || "بدون باركود"}</span>
                                    <span>{product.shelf_location ? `رف ${product.shelf_location}` : product.category_name}</span>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="font-semibold">{formatQty(product.quantity)} <span className="text-xs font-normal text-muted-foreground">{product.unit_of_measure}</span></p>
                              <p className="mt-1 text-xs text-muted-foreground">حد أدنى {formatQty(product.min_stock_level)}</p>
                            </TableCell>
                            <TableCell>{stockBadge(product)}</TableCell>
                            <TableCell>
                              <p>{formatQty(product.net_sold_30d)}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{product.days_cover == null ? "لا توجد تغطية محسوبة" : `يكفي ${formatQty(product.days_cover)} يوم`}</p>
                            </TableCell>
                            <TableCell>
                              <p>{formatMoney(product.purchase_value)}</p>
                              <p className="mt-1 text-xs text-muted-foreground">شراء</p>
                            </TableCell>
                            <TableCell><span className="text-sm text-muted-foreground">{formatDateTime(product.last_audit_at)}</span></TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="ghost" onClick={() => setMovementProduct(product)} title="سجل الحركات"><History className="h-4 w-4" /></Button>
                                {canManage && product.linked_product ? (
                                  <>
                                    <Button size="sm" variant="ghost" onClick={() => openPolicy(product)} title="حدود وتنبيه"><BellRing className="h-4 w-4" /></Button>
                                    <Button size="sm" variant="ghost" onClick={() => openAdjustment(product)} title="تسوية يدوية"><Scale className="h-4 w-4" /></Button>
                                    <Button size="sm" variant="ghost" onClick={() => navigate(`/products/edit/${product.product_id}`)} title="تعديل المنتج"><Pencil className="h-4 w-4" /></Button>
                                  </>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="space-y-3 md:hidden">
                    {data!.products.map((product) => (
                      <div key={product.product_id} className="rounded-xl border p-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                            {product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <Package className="h-5 w-5 text-muted-foreground" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{product.product_name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{product.barcode || "بدون باركود"} · {product.category_name}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {stockBadge(product)}
                              <Badge variant="outline">{formatQty(product.quantity)} {product.unit_of_measure}</Badge>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-muted/35 p-2 text-xs">
                          <div><span className="text-muted-foreground">بيع 30 يوم</span><p className="mt-0.5 font-medium">{formatQty(product.net_sold_30d)}</p></div>
                          <div><span className="text-muted-foreground">قيمة الشراء</span><p className="mt-0.5 font-medium">{formatMoney(product.purchase_value)}</p></div>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => setMovementProduct(product)}><History className="ml-2 h-4 w-4" /> الحركات</Button>
                          {canManage && product.linked_product ? <Button size="sm" variant="outline" onClick={() => openPolicy(product)}><BellRing className="h-4 w-4" /></Button> : null}
                          {canManage && product.linked_product ? <Button size="sm" onClick={() => openAdjustment(product)}><Scale className="h-4 w-4" /></Button> : null}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">عرض {formatQty(page * PAGE_SIZE + 1)}–{formatQty(Math.min((page + 1) * PAGE_SIZE, data!.total_filtered))} من {formatQty(data!.total_filtered)} نتيجة</p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={page <= 0 || query.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronRight className="ml-1 h-4 w-4" /> السابق</Button>
                      <Badge variant="outline">صفحة {formatQty(activePage)} / {formatQty(totalPages)}</Badge>
                      <Button variant="outline" size="sm" disabled={page + 1 >= totalPages || query.isFetching} onClick={() => setPage((value) => value + 1)}>التالي <ChevronLeft className="mr-1 h-4 w-4" /></Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-5 w-5" /> نبض المخزون</CardTitle>
                <CardDescription>مؤشرات تشغيلية من الرصيد الحالي وحركة آخر 30 يوم.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setStatus("coverage_risk")} className="rounded-xl border p-3 text-right hover:bg-muted/40">
                    <p className="text-xs text-muted-foreground">تغطية ≤ 14 يوم</p><p className="mt-1 text-xl font-bold">{formatQty(summary?.coverage_risk_rows)}</p>
                  </button>
                  <button onClick={() => setStatus("alerts")} className="rounded-xl border p-3 text-right hover:bg-muted/40">
                    <p className="text-xs text-muted-foreground">تنبيهات مفعلة</p><p className="mt-1 text-xl font-bold">{formatQty(summary?.alerting_rows)}</p>
                  </button>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-950">
                  <p className="text-xs text-emerald-700">قيمة المخزون بسعر الشراء</p>
                  <p className="mt-1 text-xl font-bold">{formatMoney(summary?.purchase_value)}</p>
                  <p className="mt-1 text-xs text-emerald-700">هامش محتمل على الرصيد الحالي: {formatMoney(summary?.potential_margin_value)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">جلسات جرد نشطة</p><p className="mt-1 font-semibold">{formatQty(summary?.active_audit_sessions)}</p></div>
                  <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">حركات Ledger</p><p className="mt-1 font-semibold">{formatQty(summary?.movement_ledger_rows)}</p></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base"><History className="h-5 w-5" /> آخر الحركات</CardTitle>
                    <CardDescription>الحركات المسجلة منذ تفعيل Movement Ledger V2.</CardDescription>
                  </div>
                  {query.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                </div>
              </CardHeader>
              <CardContent>
                {(data?.recent_movements || []).length ? (
                  <div className="space-y-2">
                    {data!.recent_movements.slice(0, 8).map((movement) => {
                      const positive = movement.quantity_delta > 0;
                      return (
                        <div key={movement.id} className="rounded-xl border p-3">
                          <div className="flex items-start gap-2">
                            <div className={`mt-0.5 rounded-lg p-1.5 ${positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                              {positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="truncate text-sm font-medium">{movement.product_name}</p>
                                <span className={`whitespace-nowrap text-sm font-bold ${positive ? "text-emerald-700" : "text-red-700"}`}>{positive ? "+" : ""}{formatQty(movement.quantity_delta)}</span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{movementSourceLabels[movement.source] || movement.source} · {formatDateTime(movement.changed_at)}</p>
                              {movement.note ? <p className="mt-1 line-clamp-2 text-xs">{movement.note}</p> : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">لم تُسجل حركات في Ledger V2 بعد.</div>
                )}
                <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
                  السجل ليس Backfill تاريخيًا؛ يبدأ من {formatDateTime(data?.data_quality.movement_ledger_started_at)}. تحليل الركود بالأعلى يعتمد على فواتير POS V2 لآخر 30 يوم، وليس على هذا السجل وحده.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>

      <Dialog open={Boolean(policyProduct)} onOpenChange={(open) => !open && closePolicy()}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>حدود وتنبيهات المخزون</DialogTitle>
            <DialogDescription>{policyProduct?.product_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>الحد الأدنى</Label><Input type="number" step="0.001" min="0" value={minStock} onChange={(event) => setMinStock(event.target.value)} /></div>
              <div className="space-y-2"><Label>الحد الأقصى</Label><Input type="number" step="0.001" min="0" value={maxStock} onChange={(event) => setMaxStock(event.target.value)} placeholder="اتركه فارغًا لتعطيله" /></div>
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div><p className="font-medium">تفعيل تنبيه انخفاض المخزون</p><p className="mt-1 text-xs text-muted-foreground">يظهر في فلتر التنبيهات عندما يصل الرصيد للحد الأدنى أو أقل.</p></div>
              <Switch checked={alertEnabled} onCheckedChange={setAlertEnabled} />
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">الرصيد الحالي: <strong className="text-foreground">{formatQty(policyProduct?.quantity)} {policyProduct?.unit_of_measure}</strong></div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={savePolicy} disabled={busy}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <BellRing className="ml-2 h-4 w-4" />} حفظ</Button>
            <Button variant="outline" onClick={closePolicy} disabled={busy}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(adjustProduct)} onOpenChange={(open) => !open && closeAdjustment()}>
        <DialogContent className="sm:max-w-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>تسوية يدوية للمخزون</DialogTitle>
            <DialogDescription>{adjustProduct?.product_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              التسوية اليدوية مخصصة للتصحيح والتالف والفقد والاستخدام الداخلي. <strong>استلام المورد الطبيعي يُسجل من مشتريات الموردين</strong> حتى تظل التكلفة والمستندات صحيحة.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>فرق الكمية</Label>
                <Input type="number" step="0.001" value={adjustDelta} onChange={(event) => setAdjustDelta(event.target.value)} placeholder="مثال: 5 أو -2" />
                <p className="text-xs text-muted-foreground">موجب للإضافة، سالب للخصم.</p>
              </div>
              <div className="space-y-2">
                <Label>السبب</Label>
                <Select value={adjustReason} onValueChange={(value) => setAdjustReason(value as InventoryAdjustmentReason)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(adjustmentReasonLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>ملاحظة إلزامية</Label><Textarea value={adjustNote} onChange={(event) => setAdjustNote(event.target.value)} placeholder="اكتب ما حدث ولماذا يتم تعديل الرصيد..." rows={3} /></div>
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-3 text-center text-sm">
              <div><p className="text-xs text-muted-foreground">الحالي</p><p className="mt-1 font-bold">{formatQty(adjustProduct?.quantity)}</p></div>
              <div><p className="text-xs text-muted-foreground">التغيير</p><p className="mt-1 font-bold">{formatQty(Number(adjustDelta) || 0)}</p></div>
              <div><p className="text-xs text-muted-foreground">بعد التسوية</p><p className="mt-1 font-bold">{formatQty(Number(adjustProduct?.quantity || 0) + (Number(adjustDelta) || 0))}</p></div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={submitAdjustment} disabled={busy}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Scale className="ml-2 h-4 w-4" />} تنفيذ التسوية</Button>
            <Button variant="outline" onClick={closeAdjustment} disabled={busy}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(movementProduct)} onOpenChange={(open) => !open && setMovementProduct(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5" /> سجل حركات المنتج</DialogTitle>
            <DialogDescription>{movementProduct?.product_name} · الرصيد الحالي {formatQty(movementProduct?.quantity)} {movementProduct?.unit_of_measure}</DialogDescription>
          </DialogHeader>
          {movementQuery.isLoading ? (
            <div className="flex min-h-52 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : movementQuery.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{movementQuery.error instanceof Error ? movementQuery.error.message : "تعذر تحميل سجل الحركات."}</div>
          ) : (movementQuery.data || []).length ? (
            <div className="space-y-2 py-2">
              {(movementQuery.data || []).map((movement) => {
                const positive = movement.quantity_delta > 0;
                const reason = movementReasonLabel(movement.reason_code);
                return (
                  <div key={movement.id} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`rounded-lg p-2 ${positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{positive ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownLeft className="h-5 w-5" />}</div>
                        <div>
                          <p className="font-medium">{movementSourceLabels[movement.source] || movement.source}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(movement.changed_at)} · {movement.actor_name || "النظام"}</p>
                          {reason ? <Badge variant="outline" className="mt-2">{reason}</Badge> : null}
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className={`text-lg font-bold ${positive ? "text-emerald-700" : "text-red-700"}`}>{positive ? "+" : ""}{formatQty(movement.quantity_delta)}</p>
                        <p className="text-xs text-muted-foreground">{formatQty(movement.quantity_before)} ← {formatQty(movement.quantity_after)}</p>
                      </div>
                    </div>
                    {movement.note ? <p className="mt-3 rounded-lg bg-muted/40 p-2.5 text-sm">{movement.note}</p> : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد حركات لهذا المنتج منذ تفعيل Movement Ledger V2.</div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
