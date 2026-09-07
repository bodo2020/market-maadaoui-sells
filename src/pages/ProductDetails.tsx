import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { siteConfig } from "@/config/site";
import { getProductSalesAnalytics } from "@/services/supabase/analyticsService";
import {
  fetchProductDetailsPro,
  type ProductDetailsSnapshot,
} from "@/services/supabase/productDetailsService";
import {
  AlertTriangle,
  ArrowRight,
  Barcode,
  Boxes,
  Building2,
  CalendarClock,
  ChartNoAxesCombined,
  CircleDollarSign,
  Edit3,
  Layers3,
  Loader2,
  MapPin,
  Package,
  PackageCheck,
  ReceiptText,
  Scale,
  ShoppingBag,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ProductAnalytics {
  totalSales: number;
  totalProfit: number;
  totalQuantitySold: number;
  dailySales: Array<{
    date: string;
    sales: number;
    profit: number;
    quantity: number;
  }>;
  topCustomers: Array<{
    customerName: string;
    totalPurchases: number;
    totalSpent: number;
  }>;
}

function money(value: number | null | undefined) {
  return `${Number(value || 0).toFixed(2)} ${siteConfig.currency}`;
}

function number(value: number | null | undefined) {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 3 }).format(Number(value || 0));
}

function date(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "short", day: "numeric" }).format(parsed);
}

function stockState(quantity: number, minimum: number) {
  if (quantity <= 0) return <Badge variant="destructive">نفد المخزون</Badge>;
  if (quantity <= minimum) return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">مخزون منخفض</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">متوفر</Badge>;
}

function expiryState(expiry?: string | null) {
  if (!expiry) return null;
  const target = new Date(`${expiry}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const days = Math.ceil((target.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return <Badge variant="destructive">منتهي</Badge>;
  if (days <= 30) return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{days} يوم</Badge>;
  return <Badge variant="secondary">{days} يوم</Badge>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed bg-slate-50 px-4 py-12 text-center text-sm text-muted-foreground">{children}</div>;
}

export default function ProductDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<ProductDetailsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<ProductAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    setLoading(true);
    setCoreError(null);
    setSnapshot(null);
    void fetchProductDetailsPro(id)
      .then(result => {
        if (!cancelled) setSnapshot(result);
      })
      .catch((error: Error) => {
        if (!cancelled) setCoreError(error.message || "تعذر تحميل المنتج.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    setAnalyticsLoading(true);
    setAnalyticsError(null);
    setAnalytics(null);
    void getProductSalesAnalytics(id)
      .then(result => {
        if (!cancelled) setAnalytics(result as ProductAnalytics);
      })
      .catch(error => {
        console.error("Product analytics error:", error);
        if (!cancelled) setAnalyticsError("تعذر تحميل التحليلات حاليًا، لكن بيانات المنتج والمخزون سليمة.");
      })
      .finally(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const product = snapshot?.product;
  const sourceMismatch = Boolean(
    product &&
      (product.inventory_branch_id !== product.operational_branch_id ||
        product.pricing_branch_id !== product.operational_branch_id),
  );

  const activeVariants = useMemo(
    () => snapshot?.variants.filter(variant => variant.active).length || 0,
    [snapshot?.variants],
  );

  if (loading) {
    return (
      <MainLayout>
        <div className="flex min-h-[55vh] items-center justify-center" dir="rtl">
          <div className="text-center">
            <Loader2 className="mx-auto h-9 w-9 animate-spin text-[#005931]" />
            <p className="mt-3 text-sm text-muted-foreground">تحميل بيانات المنتج من الفرع...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (coreError || !product || !snapshot) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-2xl py-16" dir="rtl">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{coreError || "المنتج غير موجود."}</AlertDescription>
          </Alert>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/products")}>
            <ArrowRight className="ml-2 h-4 w-4" /> العودة للمنتجات
          </Button>
        </div>
      </MainLayout>
    );
  }

  const mainImage = product.image_urls?.[0] || "/placeholder.svg";

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-[1700px] space-y-5 pb-10">
        <div className="sticky top-0 z-20 -mx-3 border-b bg-white/95 px-3 py-3 backdrop-blur md:-mx-6 md:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="icon" aria-label="العودة للمنتجات" onClick={() => navigate("/products")}>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-black md:text-2xl">{product.name}</h1>
                {stockState(product.quantity, product.min_stock_level)}
                {product.is_offer && <Badge className="bg-[#005931] hover:bg-[#005931]">عرض</Badge>}
                {product.barcode_type === "scale" && <Badge variant="outline"><Scale className="ml-1 h-3.5 w-3.5" />ميزان</Badge>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Barcode className="h-3.5 w-3.5" />{product.barcode || "بدون باركود"}</span>
                {product.company_name && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{product.company_name}</span>}
                {product.main_category_name && <span className="flex items-center gap-1"><Layers3 className="h-3.5 w-3.5" />{product.main_category_name}{product.subcategory_name ? ` / ${product.subcategory_name}` : ""}</span>}
              </div>
            </div>
            <Button className="bg-[#005931] hover:bg-[#004a29]" onClick={() => navigate(`/add-product?id=${product.id}`)}>
              <Edit3 className="ml-2 h-4 w-4" /> تعديل المنتج
            </Button>
          </div>
        </div>

        {sourceMismatch && (
          <Alert className="border-blue-200 bg-blue-50 text-blue-950">
            <Warehouse className="h-4 w-4" />
            <AlertDescription>
              هذا الفرع يستخدم مصدر مخزون أو تسعير مركزي. الأرقام المعروضة هي الأرقام الفعلية التي سيستخدمها الـPOS لهذا الفرع.
            </AlertDescription>
          </Alert>
        )}

        <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-slate-200">
          <CardContent className="p-0">
            <div className="grid md:grid-cols-[270px_minmax(0,1fr)]">
              <div className="flex min-h-64 items-center justify-center bg-slate-50 p-6">
                <img src={mainImage} alt={product.name} className="max-h-56 w-full object-contain" />
              </div>
              <div className="p-5 md:p-7">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><Package className="h-4 w-4" />المخزون الفعلي</div>
                    <div className="mt-2 text-2xl font-black">{number(product.quantity)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{product.unit_of_measure || "وحدة"} · حد منخفض {number(product.min_stock_level)}</div>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <div className="flex items-center gap-2 text-xs text-emerald-800/70"><CircleDollarSign className="h-4 w-4" />سعر البيع</div>
                    <div className="mt-2 text-2xl font-black text-[#005931]">{money(product.is_offer && product.offer_price != null ? product.offer_price : product.price)}</div>
                    {product.is_offer && product.offer_price != null && <div className="mt-1 text-xs text-muted-foreground line-through">{money(product.price)}</div>}
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><ReceiptText className="h-4 w-4" />سعر الشراء</div>
                    <div className="mt-2 text-2xl font-black">{money(product.purchase_price)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">حسب مصدر تسعير الفرع</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-4 w-4" />هامش البيع</div>
                    <div className={`mt-2 text-2xl font-black ${product.margin_value < 0 ? "text-red-600" : "text-[#005931]"}`}>{money(product.margin_value)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{number(product.margin_percent)}%</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><Warehouse className="h-4 w-4" />قيمة المخزون</div>
                    <div className="mt-2 text-2xl font-black">{money(product.inventory_value)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">بسعر الشراء الحالي</div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{product.unit_of_measure || "قطعة"}</Badge>
                  {product.shelf_location && <Badge variant="outline"><MapPin className="ml-1 h-3.5 w-3.5" />رف {product.shelf_location}</Badge>}
                  {activeVariants > 0 && <Badge variant="outline"><Boxes className="ml-1 h-3.5 w-3.5" />{activeVariants} وحدة بيع نشطة</Badge>}
                  {product.has_custom_pricing && <Badge variant="outline">تسعير فرع مخصص</Badge>}
                  {product.track_expiry && <Badge variant="outline"><CalendarClock className="ml-1 h-3.5 w-3.5" />تتبع صلاحية</Badge>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="details" className="space-y-4">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1">
            <TabsTrigger className="shrink-0 rounded-xl" value="details">بيانات المنتج</TabsTrigger>
            <TabsTrigger className="shrink-0 rounded-xl" value="variants">وحدات البيع ({snapshot.variants.length})</TabsTrigger>
            <TabsTrigger className="shrink-0 rounded-xl" value="batches">الدُفعات والصلاحية ({snapshot.batches.length})</TabsTrigger>
            <TabsTrigger className="shrink-0 rounded-xl" value="purchases">المشتريات ({snapshot.recent_purchases.length})</TabsTrigger>
            <TabsTrigger className="shrink-0 rounded-xl" value="sales">المبيعات والتحليل</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-lg">المعلومات الأساسية</CardTitle></CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  {[
                    ["الاسم", product.name],
                    ["الباركود", product.barcode || "—"],
                    ["نوع الباركود", product.barcode_type === "scale" ? "ميزان" : "عادي"],
                    ["وحدة القياس", product.unit_of_measure || "قطعة"],
                    ["الشركة", product.company_name || "—"],
                    ["القسم الرئيسي", product.main_category_name || "—"],
                    ["القسم الفرعي", product.subcategory_name || "—"],
                    ["مكان الرف", product.shelf_location || "—"],
                    ["تاريخ الإنشاء", date(product.created_at)],
                    ["آخر تحديث", date(product.updated_at)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border p-3">
                      <div className="text-xs text-muted-foreground">{label}</div>
                      <div className="mt-1 font-semibold">{value}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-lg">الوصف والصور</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl bg-slate-50 p-4 text-sm leading-7">{product.description || "لا يوجد وصف مسجل للمنتج."}</div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {(product.image_urls?.length ? product.image_urls : ["/placeholder.svg"]).map((url, index) => (
                      <div key={`${url}-${index}`} className="aspect-square overflow-hidden rounded-xl border bg-white p-2">
                        <img src={url} alt={`${product.name} ${index + 1}`} className="h-full w-full object-contain" loading="lazy" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="variants">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Boxes className="h-5 w-5 text-[#005931]" />وحدات البيع المرتبطة</CardTitle>
              </CardHeader>
              <CardContent>
                {!snapshot.variants.length ? (
                  <EmptyState>لا توجد كرتونة أو باك أو وحدة بيع مرتبطة بهذا المنتج.</EmptyState>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {snapshot.variants.map(variant => (
                      <div key={variant.id} className={`rounded-2xl border bg-white p-4 ${!variant.active ? "opacity-60" : ""}`}>
                        <div className="flex gap-3">
                          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 p-2">
                            <img src={variant.image_url || mainImage} alt={variant.name} className="h-full w-full object-contain" loading="lazy" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-bold">{variant.name}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{variant.variant_type || "وحدة بيع"}</div>
                              </div>
                              <Badge variant={variant.active ? "secondary" : "outline"}>{variant.active ? "نشطة" : "موقوفة"}</Badge>
                            </div>
                            <div className="mt-3 text-xl font-black text-[#005931]">{money(variant.price)}</div>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-xl bg-slate-50 p-3"><div className="text-muted-foreground">التحويل</div><div className="mt-1 font-bold">× {number(variant.conversion_factor)} من الأصل</div></div>
                          <div className="rounded-xl bg-slate-50 p-3"><div className="text-muted-foreground">المتاح</div><div className="mt-1 font-bold">{number(variant.available_packages)} عبوة</div></div>
                          <div className="rounded-xl bg-slate-50 p-3"><div className="text-muted-foreground">شراء العبوة</div><div className="mt-1 font-bold">{money(variant.effective_purchase_price)}</div></div>
                          <div className="rounded-xl bg-slate-50 p-3"><div className="text-muted-foreground">الباركود</div><div className="mt-1 truncate font-mono font-bold" dir="ltr">{variant.barcode || variant.bulk_barcode || "—"}</div></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="batches">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><CalendarClock className="h-5 w-5 text-[#005931]" />الدُفعات والصلاحية</CardTitle></CardHeader>
              <CardContent>
                {!snapshot.batches.length ? (
                  <EmptyState>لا توجد دُفعات مسجلة لهذا المنتج في مصدر مخزون الفرع.</EmptyState>
                ) : (
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[850px] text-sm">
                      <thead className="bg-slate-50 text-xs text-muted-foreground">
                        <tr><th className="p-3 text-right">الدفعة</th><th className="p-3 text-right">الصلاحية</th><th className="p-3 text-right">الكمية</th><th className="p-3 text-right">الرف</th><th className="p-3 text-right">المورد</th><th className="p-3 text-right">سعر الشراء</th><th className="p-3 text-right">تاريخ الشراء</th></tr>
                      </thead>
                      <tbody>
                        {snapshot.batches.map(batch => (
                          <tr key={batch.id} className="border-t">
                            <td className="p-3 font-semibold">{batch.batch_number || "—"}</td>
                            <td className="p-3"><div className="flex items-center gap-2"><span>{date(batch.expiry_date)}</span>{expiryState(batch.expiry_date)}</div></td>
                            <td className="p-3 font-bold">{number(batch.quantity)}</td>
                            <td className="p-3">{batch.shelf_location || "—"}</td>
                            <td className="p-3">{batch.supplier_name || "—"}</td>
                            <td className="p-3">{money(batch.purchase_price)}</td>
                            <td className="p-3">{date(batch.purchase_date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="purchases">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShoppingBag className="h-5 w-5 text-[#005931]" />آخر المشتريات</CardTitle></CardHeader>
              <CardContent>
                {!snapshot.recent_purchases.length ? (
                  <EmptyState>لا توجد مشتريات مسجلة لهذا المنتج في مصدر مخزون الفرع.</EmptyState>
                ) : (
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[900px] text-sm">
                      <thead className="bg-slate-50 text-xs text-muted-foreground">
                        <tr><th className="p-3 text-right">الفاتورة</th><th className="p-3 text-right">التاريخ</th><th className="p-3 text-right">المورد</th><th className="p-3 text-right">الكمية</th><th className="p-3 text-right">سعر الوحدة</th><th className="p-3 text-right">الإجمالي</th><th className="p-3 text-right">الدفعة</th><th className="p-3 text-right">الصلاحية</th></tr>
                      </thead>
                      <tbody>
                        {snapshot.recent_purchases.map(row => (
                          <tr key={row.id} className="border-t">
                            <td className="p-3 font-semibold">{row.invoice_number || "—"}</td>
                            <td className="p-3">{date(row.purchase_date)}</td>
                            <td className="p-3">{row.supplier_name || "—"}</td>
                            <td className="p-3 font-bold">{number(row.quantity)}</td>
                            <td className="p-3">{money(row.price)}</td>
                            <td className="p-3 font-bold">{money(row.total)}</td>
                            <td className="p-3">{row.batch_number || "—"}</td>
                            <td className="p-3">{date(row.expiry_date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sales" className="space-y-4">
            {analyticsError && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{analyticsError}</AlertDescription>
              </Alert>
            )}

            {analyticsLoading ? (
              <Card><CardContent className="flex min-h-56 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#005931]" /></CardContent></Card>
            ) : analytics ? (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><ChartNoAxesCombined className="h-4 w-4" />إجمالي المبيعات</div><div className="mt-2 text-2xl font-black">{money(analytics.totalSales)}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-4 w-4" />إجمالي الأرباح</div><div className="mt-2 text-2xl font-black text-[#005931]">{money(analytics.totalProfit)}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><PackageCheck className="h-4 w-4" />الكمية المباعة</div><div className="mt-2 text-2xl font-black">{number(analytics.totalQuantitySold)}</div></CardContent></Card>
                </div>

                {analytics.dailySales?.length ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card>
                      <CardHeader><CardTitle className="text-lg">المبيعات والأرباح اليومية</CardTitle></CardHeader>
                      <CardContent className="h-[320px] p-2 md:p-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={analytics.dailySales}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" fontSize={11} />
                            <YAxis fontSize={11} />
                            <Tooltip />
                            <Line type="monotone" dataKey="sales" stroke="#005931" strokeWidth={2} name="المبيعات" dot={false} />
                            <Line type="monotone" dataKey="profit" stroke="#0f766e" strokeWidth={2} name="الأرباح" dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle className="text-lg">الكميات المباعة</CardTitle></CardHeader>
                      <CardContent className="h-[320px] p-2 md:p-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analytics.dailySales}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" fontSize={11} />
                            <YAxis fontSize={11} />
                            <Tooltip />
                            <Bar dataKey="quantity" fill="#005931" name="الكمية" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                ) : <EmptyState>لا توجد حركة مبيعات كافية لعرض الرسم البياني.</EmptyState>}

                <Card>
                  <CardHeader><CardTitle className="text-lg">أهم العملاء</CardTitle></CardHeader>
                  <CardContent>
                    {!analytics.topCustomers?.length ? (
                      <EmptyState>لا توجد بيانات عملاء مرتبطة بمبيعات هذا المنتج.</EmptyState>
                    ) : (
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {analytics.topCustomers.map((customer, index) => (
                          <div key={`${customer.customerName}-${index}`} className="rounded-xl border p-4">
                            <div className="font-bold">{customer.customerName || "عميل"}</div>
                            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>{number(customer.totalPurchases)} عملية</span><strong className="text-sm text-foreground">{money(customer.totalSpent)}</strong></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <EmptyState>لا توجد تحليلات مبيعات متاحة لهذا المنتج.</EmptyState>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
