import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { fetchProductById } from "@/services/supabase/productService";
import { getInventoryAlert } from "@/services/supabase/inventoryService";
import { barcodeExists, requireCurrentBranchId, saveProductEditor } from "@/services/supabase/productEditorService";
import { fetchMainCategories, fetchSubcategories } from "@/services/supabase/categoryService";
import { fetchCompanies } from "@/services/supabase/companyService";
import type { Company, MainCategory, Product, Subcategory } from "@/types";
import { DragDropImage } from "@/components/ui/drag-drop-image";
import ProductSaleUnitsCard from "@/components/products/ProductSaleUnitsCard";
import BarcodeScanner from "@/components/POS/BarcodeScanner";
import { supabase } from "@/integrations/supabase/client";
import { siteConfig } from "@/config/site";
import {
  AlertTriangle,
  ArrowRight,
  Barcode,
  Bell,
  Boxes,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  ImageIcon,
  Layers3,
  Loader2,
  Package,
  PackageCheck,
  Save,
  ScanLine,
  Scale,
  Sparkles,
  TrendingUp,
  Warehouse,
} from "lucide-react";

const EMPTY_PRODUCT: Partial<Product> = {
  name: "",
  price: 0,
  purchase_price: 0,
  quantity: 0,
  image_urls: [],
  is_offer: false,
  offer_price: undefined,
  barcode_type: "normal",
  unit_of_measure: "قطعة",
  track_expiry: false,
};

type EditorTab = "basic" | "commerce" | "catalog" | "media" | "units";

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} ${siteConfig.currency}`;
}

function SectionTitle({ icon: Icon, title, description }: { icon: typeof Package; title: string; description: string }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="rounded-xl bg-[#005931]/10 p-2 text-[#005931]"><Icon className="h-5 w-5" /></div>
      <div>
        <h2 className="font-black">{title}</h2>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export default function AddProduct() {
  const navigate = useNavigate();
  const { id: routeProductId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const productId = routeProductId || searchParams.get("id");
  const { toast } = useToast();

  const [product, setProduct] = useState<Partial<Product>>(EMPTY_PRODUCT);
  const [categories, setCategories] = useState<MainCategory[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(Boolean(productId));
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcodeChecking, setBarcodeChecking] = useState(false);
  const [barcodeConflict, setBarcodeConflict] = useState(false);
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [minStockLevel, setMinStockLevel] = useState(5);
  const [branchName, setBranchName] = useState("");
  const [independentPricing, setIndependentPricing] = useState(false);
  const [branchMissing, setBranchMissing] = useState(false);
  const [legacyBulkDetected, setLegacyBulkDetected] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>("basic");

  const salePrice = Number(product.price || 0);
  const purchasePrice = Number(product.purchase_price || 0);
  const profit = salePrice - purchasePrice;
  const margin = salePrice > 0 ? (profit / salePrice) * 100 : 0;
  const displayPrice = product.is_offer && Number(product.offer_price || 0) > 0 ? Number(product.offer_price) : salePrice;

  const priceWarning = useMemo(() => {
    if (salePrice < 0 || purchasePrice < 0) return "الأسعار لا يمكن أن تكون سالبة.";
    if (salePrice > 0 && purchasePrice > salePrice) return "سعر الشراء أعلى من سعر البيع.";
    if (product.is_offer && Number(product.offer_price || 0) <= 0) return "أدخل سعر عرض صحيح.";
    if (product.is_offer && Number(product.offer_price || 0) > salePrice) return "سعر العرض أعلى من سعر البيع الأساسي.";
    return null;
  }, [salePrice, purchasePrice, product.is_offer, product.offer_price]);

  const completion = useMemo(() => {
    const checks = [
      Boolean(product.name?.trim()),
      salePrice >= 0,
      purchasePrice >= 0,
      Boolean(product.unit_of_measure),
      Boolean(product.barcode?.trim()),
      Boolean(product.main_category_id),
      Boolean(product.image_urls?.[0]),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [product, salePrice, purchasePrice]);

  useEffect(() => {
    void loadReferenceData();
    void loadBranch();
  }, []);

  useEffect(() => {
    if (productId) void loadProduct(productId);
    else {
      setProduct(EMPTY_PRODUCT);
      setInitialLoading(false);
    }
  }, [productId]);

  const loadReferenceData = async () => {
    try {
      const [categoryRows, companyRows] = await Promise.all([fetchMainCategories(), fetchCompanies()]);
      setCategories(categoryRows || []);
      setCompanies(companyRows || []);
    } catch (error) {
      console.error("Product reference data error:", error);
      toast({ title: "تعذر تحميل بيانات التصنيف", variant: "destructive" });
    }
  };

  const loadBranch = async () => {
    try {
      const branchId = requireCurrentBranchId();
      setBranchMissing(false);
      const { data, error } = await supabase
        .from("branches")
        .select("name, independent_pricing")
        .eq("id", branchId)
        .single();
      if (error) throw error;
      setBranchName(data?.name || "الفرع الحالي");
      setIndependentPricing(Boolean(data?.independent_pricing));
    } catch (error: any) {
      setBranchMissing(true);
      setBranchName("");
      toast({ title: "اختيار الفرع مطلوب", description: error?.message || "اختار الفرع قبل إدارة المنتجات.", variant: "destructive" });
    }
  };

  const loadSubcategoriesFor = async (categoryId: string) => {
    if (!categoryId) {
      setSubcategories([]);
      return [];
    }
    const rows = await fetchSubcategories(categoryId);
    setSubcategories(rows || []);
    return rows || [];
  };

  const loadProduct = async (id: string) => {
    setInitialLoading(true);
    try {
      requireCurrentBranchId();
      const data = await fetchProductById(id);
      setProduct({
        ...EMPTY_PRODUCT,
        ...data,
        image_urls: data.image_urls || [],
        unit_of_measure: data.unit_of_measure || (data.barcode_type === "scale" ? "كجم" : "قطعة"),
      });
      setMinStockLevel(Number(data.min_stock_level ?? 5));
      setLegacyBulkDetected(Boolean(data.bulk_enabled));

      if (data.main_category_id) await loadSubcategoriesFor(data.main_category_id);
      else setSubcategories([]);

      try {
        const alert = await getInventoryAlert(id);
        setAlertEnabled(Boolean(alert?.alert_enabled));
        if (alert?.min_stock_level != null) setMinStockLevel(Number(alert.min_stock_level));
      } catch {
        setAlertEnabled(false);
      }
    } catch (error: any) {
      console.error("Product load error:", error);
      toast({ title: "تعذر تحميل المنتج", description: error?.message || "راجع الفرع وحاول مرة أخرى.", variant: "destructive" });
    } finally {
      setInitialLoading(false);
    }
  };

  const checkBarcode = async (barcodeValue = product.barcode || "") => {
    const clean = barcodeValue.trim();
    if (!clean) {
      setBarcodeConflict(false);
      return false;
    }
    setBarcodeChecking(true);
    try {
      const exists = await barcodeExists(clean, productId);
      setBarcodeConflict(exists);
      return exists;
    } catch (error) {
      console.error("Barcode check error:", error);
      return false;
    } finally {
      setBarcodeChecking(false);
    }
  };

  const handleBarcodeScan = async (barcodeValue: string) => {
    setScannerOpen(false);
    setProduct(prev => ({ ...prev, barcode: barcodeValue }));
    const exists = await checkBarcode(barcodeValue);
    if (exists) toast({ title: "الباركود مستخدم بالفعل", description: barcodeValue, variant: "destructive" });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (branchMissing) {
      toast({ title: "اختار الفرع قبل الحفظ", variant: "destructive" });
      return;
    }
    if (!product.name?.trim()) {
      setActiveTab("basic");
      toast({ title: "اكتب اسم المنتج", variant: "destructive" });
      return;
    }
    if (priceWarning) {
      setActiveTab("commerce");
      toast({ title: "راجع الأسعار", description: priceWarning, variant: "destructive" });
      return;
    }
    if (await checkBarcode()) {
      setActiveTab("catalog");
      toast({ title: "لا يمكن الحفظ", description: "الباركود مستخدم بالفعل.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const saved = await saveProductEditor(
        {
          ...(product as Product),
          name: product.name.trim(),
          price: salePrice,
          purchase_price: purchasePrice,
        },
        {
          quantity: Number(product.quantity || 0),
          min_stock_level: Number(minStockLevel || 0),
        },
        { enabled: alertEnabled },
        productId,
      );

      toast({
        title: productId ? "تم حفظ التعديلات" : "تم إنشاء المنتج",
        description: productId ? "تم تحديث المنتج ومخزون الفرع." : "المنتج اتعمل بنجاح. تقدر تضيف وحدات البيع دلوقتي.",
      });

      if (!productId && saved?.id) {
        navigate(`/add-product?id=${saved.id}`, { replace: true });
      } else if (productId) {
        await loadProduct(productId);
      }
    } catch (error: any) {
      toast({ title: "تعذر حفظ المنتج", description: error?.message || "راجع البيانات وحاول مرة أخرى.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <MainLayout>
        <div className="flex min-h-[55vh] items-center justify-center" dir="rtl">
          <div className="text-center">
            <Loader2 className="mx-auto h-9 w-9 animate-spin text-[#005931]" />
            <p className="mt-3 text-sm text-muted-foreground">جاري تجهيز محرر المنتج...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  const mainImage = product.image_urls?.[0] || null;

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1500px] space-y-4 pb-28 md:pb-10" dir="rtl">
        <div className="sticky top-0 z-20 -mx-3 border-b bg-white/95 px-3 py-3 backdrop-blur md:-mx-6 md:px-6">
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="icon" className="shrink-0 rounded-xl" onClick={() => navigate("/products")} aria-label="العودة للمنتجات">
              <ArrowRight className="h-4 w-4" />
            </Button>

            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="hidden h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-slate-50 sm:flex">
                {mainImage ? <img src={mainImage} alt={product.name || "المنتج"} className="h-full w-full object-contain p-1" /> : <Package className="h-5 w-5 text-muted-foreground/40" />}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-lg font-black md:text-xl">{productId ? product.name || "تعديل المنتج" : "إضافة منتج جديد"}</h1>
                  {branchName && <Badge variant="secondary" className="hidden sm:inline-flex">{branchName}</Badge>}
                </div>
                <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
                  {productId ? "عدّل البيانات واحفظ من أي تبويب" : "أدخل الأساسيات أولًا وبعد الحفظ أضف وحدات الجملة"}
                </p>
              </div>
            </div>

            {productId && (
              <Button type="button" variant="ghost" className="hidden md:flex" onClick={() => navigate(`/product-details/${productId}`)}>
                <Eye className="ms-2 h-4 w-4" /> عرض التفاصيل
              </Button>
            )}
            <Button type="submit" form="product-editor-form" className="hidden bg-[#005931] hover:bg-[#004a29] md:flex" disabled={loading || branchMissing || barcodeConflict}>
              {loading ? <Loader2 className="ms-2 h-4 w-4 animate-spin" /> : <Save className="ms-2 h-4 w-4" />}
              {productId ? "حفظ التعديلات" : "حفظ المنتج"}
            </Button>
          </div>
        </div>

        {branchMissing && (
          <Alert variant="destructive" className="rounded-2xl">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>اختار الفرع أولًا. الحفظ متوقف لحماية المخزون من الكتابة على فرع غير مقصود.</AlertDescription>
          </Alert>
        )}

        {legacyBulkDetected && productId && (
          <Alert className="rounded-2xl border-amber-200 bg-amber-50 text-amber-950">
            <Boxes className="h-4 w-4" />
            <AlertDescription>المنتج عنده بيانات جملة قديمة. افتح تبويب «وحدات البيع» لاستخدامها وتحويلها لوحدة مستقلة مرتبطة.</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <form id="product-editor-form" onSubmit={handleSave} className="min-w-0">
            <Tabs value={activeTab} onValueChange={value => setActiveTab(value as EditorTab)} className="space-y-4">
              <div className="overflow-x-auto pb-1">
                <TabsList className="h-auto min-w-max justify-start gap-1 rounded-2xl bg-slate-100 p-1">
                  <TabsTrigger value="basic" className="rounded-xl px-4 py-2.5">البيانات الأساسية</TabsTrigger>
                  <TabsTrigger value="commerce" className="rounded-xl px-4 py-2.5">الأسعار والمخزون</TabsTrigger>
                  <TabsTrigger value="catalog" className="rounded-xl px-4 py-2.5">الباركود والتصنيف</TabsTrigger>
                  <TabsTrigger value="media" className="rounded-xl px-4 py-2.5">الصورة والصلاحية</TabsTrigger>
                  <TabsTrigger value="units" className="rounded-xl px-4 py-2.5">وحدات البيع</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="basic" className="mt-0">
                <Card className="border-0 shadow-sm ring-1 ring-slate-200">
                  <CardContent className="p-5 md:p-6">
                    <SectionTitle icon={Package} title="البيانات الأساسية" description="المعلومات التي تميز المنتج وتظهر في البحث والفواتير." />
                    <div className="grid gap-5 md:grid-cols-2">
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="name">اسم المنتج *</Label>
                        <Input id="name" required className="h-12 rounded-xl text-base" value={product.name || ""} onChange={event => setProduct(prev => ({ ...prev, name: event.target.value }))} placeholder="مثال: بيبسي 330 مل" />
                        <p className="text-[11px] text-muted-foreground">اكتب اسم واضح يساعد الكاشير والعميل يلاقوه بسرعة.</p>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="description">وصف المنتج</Label>
                        <Textarea id="description" className="min-h-28 rounded-xl" value={product.description || ""} onChange={event => setProduct(prev => ({ ...prev, description: event.target.value }))} placeholder="وصف مختصر واختياري" />
                      </div>
                      <div className="space-y-2">
                        <Label>وحدة القياس</Label>
                        <Input className="h-11 rounded-xl" value={product.unit_of_measure || ""} onChange={event => setProduct(prev => ({ ...prev, unit_of_measure: event.target.value }))} placeholder="قطعة / كجم / لتر" />
                      </div>
                      <div className="space-y-2">
                        <Label>موقع الرف</Label>
                        <Input className="h-11 rounded-xl" value={product.shelf_location || ""} onChange={event => setProduct(prev => ({ ...prev, shelf_location: event.target.value }))} placeholder="مثال: A1 أو ثلاجة 2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="commerce" className="mt-0 space-y-4">
                <Card className="border-0 shadow-sm ring-1 ring-slate-200">
                  <CardContent className="p-5 md:p-6">
                    <SectionTitle icon={CircleDollarSign} title="الأسعار والمخزون" description="السعر والكمية الفعلية الخاصة بالفرع الحالي." />
                    {independentPricing && (
                      <Alert className="mb-5 rounded-xl border-blue-200 bg-blue-50 text-blue-950">
                        <TrendingUp className="h-4 w-4" /><AlertDescription>الفرع يستخدم تسعيرًا مستقلاً؛ الأسعار هنا تخص مصدر تسعير هذا الفرع.</AlertDescription>
                      </Alert>
                    )}

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>سعر الشراء</Label>
                        <Input type="number" min="0" step="0.01" className="h-12 rounded-xl text-lg font-bold" value={product.purchase_price ?? ""} onChange={event => setProduct(prev => ({ ...prev, purchase_price: Number(event.target.value) }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>سعر البيع</Label>
                        <Input type="number" min="0" step="0.01" className="h-12 rounded-xl text-lg font-bold" value={product.price ?? ""} onChange={event => setProduct(prev => ({ ...prev, price: Number(event.target.value) }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>مخزون الفرع</Label>
                        <Input type="number" min="0" step={product.barcode_type === "scale" ? "0.001" : "1"} className="h-12 rounded-xl text-lg font-bold" value={product.quantity ?? ""} onChange={event => setProduct(prev => ({ ...prev, quantity: Number(event.target.value) }))} />
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs text-emerald-800/70">سعر البيع الحالي</p><p className="mt-1 text-xl font-black text-[#005931]">{money(displayPrice)}</p></div>
                      <div className={`rounded-2xl p-4 ${profit < 0 ? "bg-red-50" : "bg-slate-50"}`}><p className="text-xs text-muted-foreground">الربح للوحدة</p><p className={`mt-1 text-xl font-black ${profit < 0 ? "text-red-600" : "text-[#005931]"}`}>{money(profit)}</p></div>
                      <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-muted-foreground">هامش الربح</p><p className="mt-1 text-xl font-black">{margin.toFixed(1)}%</p></div>
                    </div>

                    {priceWarning && <Alert variant="destructive" className="mt-4 rounded-xl"><AlertTriangle className="h-4 w-4" /><AlertDescription>{priceWarning}</AlertDescription></Alert>}

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div><p className="font-bold">عرض على المنتج</p><p className="mt-1 text-xs text-muted-foreground">سعر مؤقت أقل من السعر الأساسي.</p></div>
                          <Switch checked={Boolean(product.is_offer)} onCheckedChange={checked => setProduct(prev => ({ ...prev, is_offer: checked, offer_price: checked ? prev.offer_price : undefined }))} />
                        </div>
                        {product.is_offer && <div className="mt-4 space-y-2"><Label>سعر العرض</Label><Input type="number" min="0" step="0.01" className="h-11 rounded-xl" value={product.offer_price ?? ""} onChange={event => setProduct(prev => ({ ...prev, offer_price: Number(event.target.value) }))} /></div>}
                      </div>

                      <div className="rounded-2xl border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div><p className="flex items-center gap-2 font-bold"><Bell className="h-4 w-4" /> تنبيه انخفاض المخزون</p><p className="mt-1 text-xs text-muted-foreground">نبه الإدارة قبل نفاد المنتج.</p></div>
                          <Switch checked={alertEnabled} onCheckedChange={setAlertEnabled} />
                        </div>
                        <div className="mt-4 space-y-2"><Label>الحد الأدنى</Label><Input type="number" min="0" step="1" className="h-11 rounded-xl" value={minStockLevel} onChange={event => setMinStockLevel(Math.max(0, Number(event.target.value) || 0))} /></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="catalog" className="mt-0">
                <Card className="border-0 shadow-sm ring-1 ring-slate-200">
                  <CardContent className="p-5 md:p-6">
                    <SectionTitle icon={Barcode} title="الباركود والتصنيف" description="خلّي الوصول للمنتج بالماسح أو البحث أسرع وأدق." />
                    <div className="grid gap-5 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>الباركود</Label>
                        <div className="flex gap-2">
                          <Input
                            className={`h-12 rounded-xl font-mono ${barcodeConflict ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                            value={product.barcode || ""}
                            onChange={event => { setBarcodeConflict(false); setProduct(prev => ({ ...prev, barcode: event.target.value })); }}
                            onBlur={() => void checkBarcode()}
                            dir="ltr"
                            placeholder="امسح أو اكتب الباركود"
                          />
                          <Button type="button" variant="outline" className="h-12 w-12 shrink-0 rounded-xl p-0" onClick={() => setScannerOpen(true)} title="مسح الباركود"><ScanLine className="h-5 w-5" /></Button>
                        </div>
                        <div className="min-h-5 text-xs">
                          {barcodeChecking && <span className="text-muted-foreground">جاري فحص الباركود...</span>}
                          {!barcodeChecking && barcodeConflict && <span className="font-medium text-red-600">الباركود مستخدم بالفعل.</span>}
                          {!barcodeChecking && !barcodeConflict && product.barcode && <span className="text-emerald-700">الباركود متاح.</span>}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>نوع الباركود</Label>
                        <Select value={product.barcode_type || "normal"} onValueChange={value => setProduct(prev => ({ ...prev, barcode_type: value, unit_of_measure: value === "scale" ? "كجم" : (prev.unit_of_measure === "كجم" ? "قطعة" : prev.unit_of_measure) }))}>
                          <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="normal">باركود عادي</SelectItem><SelectItem value="scale">ميزان / PLU</SelectItem></SelectContent>
                        </Select>
                        {product.barcode_type === "scale" && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Scale className="h-3.5 w-3.5" /> الـPOS سيحسب الوزن والسعر من باركود الميزان.</p>}
                      </div>

                      <div className="space-y-2">
                        <Label>الشركة</Label>
                        <Select value={product.company_id || "none"} onValueChange={value => setProduct(prev => ({ ...prev, company_id: value === "none" ? "" : value }))}>
                          <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="اختر الشركة" /></SelectTrigger>
                          <SelectContent><SelectItem value="none">بدون شركة</SelectItem>{companies.map(company => <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>القسم الرئيسي</Label>
                        <Select value={product.main_category_id || "none"} onValueChange={async value => { const categoryId = value === "none" ? "" : value; setProduct(prev => ({ ...prev, main_category_id: categoryId, subcategory_id: "" })); await loadSubcategoriesFor(categoryId); }}>
                          <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="اختر القسم" /></SelectTrigger>
                          <SelectContent><SelectItem value="none">بدون قسم</SelectItem>{categories.map(category => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label>القسم الفرعي</Label>
                        <Select value={product.subcategory_id || "none"} onValueChange={value => setProduct(prev => ({ ...prev, subcategory_id: value === "none" ? "" : value }))} disabled={!product.main_category_id}>
                          <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="اختر القسم الفرعي" /></SelectTrigger>
                          <SelectContent><SelectItem value="none">بدون قسم فرعي</SelectItem>{subcategories.map(subcategory => <SelectItem key={subcategory.id} value={subcategory.id}>{subcategory.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="media" className="mt-0">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="border-0 shadow-sm ring-1 ring-slate-200">
                    <CardContent className="p-5 md:p-6">
                      <SectionTitle icon={ImageIcon} title="صورة المنتج" description="الصورة تُضغط تلقائيًا قبل الرفع لتوفير المساحة." />
                      <DragDropImage value={mainImage} onChange={url => setProduct(prev => ({ ...prev, image_urls: url ? [url] : [] }))} bucketName="products" folder="products/main" maxDimension={800} targetBytes={140 * 1024} />
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm ring-1 ring-slate-200">
                    <CardContent className="p-5 md:p-6">
                      <SectionTitle icon={PackageCheck} title="الصلاحية" description="فعّلها للمنتجات التي تحتاج متابعة تواريخ الانتهاء." />
                      <div className="rounded-2xl border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div><p className="font-bold">تتبع الصلاحية</p><p className="mt-1 text-xs text-muted-foreground">سيتم الاعتماد على الدُفعات كمرجع أدق عند الاستلام.</p></div>
                          <Switch checked={Boolean(product.track_expiry)} onCheckedChange={checked => setProduct(prev => ({ ...prev, track_expiry: checked }))} />
                        </div>
                        {product.track_expiry && <div className="mt-4 space-y-2"><Label>تاريخ صلاحية مبدئي</Label><Input type="date" className="h-12 rounded-xl" value={product.expiry_date || ""} onChange={event => setProduct(prev => ({ ...prev, expiry_date: event.target.value }))} /></div>}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="units" className="mt-0">
                <ProductSaleUnitsCard
                  productId={productId}
                  productName={product.name || ""}
                  baseQuantity={Number(product.quantity || 0)}
                  legacyBulk={{
                    enabled: Boolean(product.bulk_enabled),
                    quantity: Number(product.bulk_quantity || 0),
                    price: Number(product.bulk_price || 0),
                    barcode: product.bulk_barcode || "",
                    purchasePrice: Number(product.purchase_price || 0),
                    imageUrl: mainImage,
                  }}
                />
              </TabsContent>
            </Tabs>
          </form>

          <aside className="hidden xl:block">
            <div className="sticky top-24 space-y-4">
              <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-slate-200">
                <div className="h-1.5 bg-[#005931]" />
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="text-xs text-muted-foreground">اكتمال البيانات</p><p className="mt-1 text-2xl font-black">{completion}%</p></div>
                    <div className="rounded-2xl bg-[#005931]/10 p-3 text-[#005931]"><Sparkles className="h-5 w-5" /></div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#005931] transition-all" style={{ width: `${completion}%` }} /></div>

                  <div className="space-y-2 rounded-2xl bg-slate-50 p-3 text-sm">
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">سعر البيع</span><strong>{money(displayPrice)}</strong></div>
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">الربح</span><strong className={profit < 0 ? "text-red-600" : "text-[#005931]"}>{money(profit)}</strong></div>
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">المخزون</span><strong>{Number(product.quantity || 0).toLocaleString("ar-EG")}</strong></div>
                  </div>

                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2"><CheckCircle2 className={`h-4 w-4 ${product.name ? "text-emerald-600" : "text-slate-300"}`} /> اسم المنتج</div>
                    <div className="flex items-center gap-2"><Barcode className={`h-4 w-4 ${product.barcode ? "text-emerald-600" : "text-slate-300"}`} /> الباركود</div>
                    <div className="flex items-center gap-2"><Layers3 className={`h-4 w-4 ${product.main_category_id ? "text-emerald-600" : "text-slate-300"}`} /> القسم</div>
                    <div className="flex items-center gap-2"><ImageIcon className={`h-4 w-4 ${mainImage ? "text-emerald-600" : "text-slate-300"}`} /> الصورة</div>
                  </div>
                </CardContent>
              </Card>

              {productId && (
                <Card className="border-0 shadow-sm ring-1 ring-slate-200">
                  <CardContent className="p-4">
                    <Button type="button" variant="outline" className="w-full justify-start" onClick={() => navigate(`/product-details/${productId}`)}><Eye className="ms-2 h-4 w-4" /> فتح صفحة التفاصيل</Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </aside>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 p-3 backdrop-blur md:hidden" dir="rtl">
          <div className="mx-auto flex max-w-xl gap-2">
            <Button type="submit" form="product-editor-form" className="h-12 flex-1 bg-[#005931] hover:bg-[#004a29]" disabled={loading || branchMissing || barcodeConflict}>
              {loading ? <Loader2 className="ms-2 h-4 w-4 animate-spin" /> : <Save className="ms-2 h-4 w-4" />}
              {productId ? "حفظ التعديلات" : "حفظ المنتج"}
            </Button>
            {productId && <Button type="button" variant="outline" className="h-12 w-12 p-0" onClick={() => navigate(`/product-details/${productId}`)} aria-label="عرض التفاصيل"><Eye className="h-4 w-4" /></Button>}
          </div>
        </div>

        <BarcodeScanner isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleBarcodeScan} />
      </div>
    </MainLayout>
  );
}
