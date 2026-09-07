import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
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
import {
  AlertTriangle,
  ArrowRight,
  Barcode,
  Bell,
  Boxes,
  CheckCircle2,
  ImageIcon,
  Loader2,
  Package,
  Save,
  ScanLine,
  Scale,
  TrendingUp,
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

  const salePrice = Number(product.price || 0);
  const purchasePrice = Number(product.purchase_price || 0);
  const profit = salePrice - purchasePrice;
  const margin = salePrice > 0 ? (profit / salePrice) * 100 : 0;

  const priceWarning = useMemo(() => {
    if (salePrice < 0 || purchasePrice < 0) return "الأسعار لا يمكن أن تكون سالبة.";
    if (salePrice > 0 && purchasePrice > salePrice) return "سعر الشراء أعلى من سعر البيع.";
    if (product.is_offer && Number(product.offer_price || 0) <= 0) return "أدخل سعر عرض صحيح.";
    if (product.is_offer && Number(product.offer_price || 0) > salePrice) return "سعر العرض أعلى من سعر البيع الأساسي.";
    return null;
  }, [salePrice, purchasePrice, product.is_offer, product.offer_price]);

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
      const [categoryRows, companyRows] = await Promise.all([
        fetchMainCategories(),
        fetchCompanies(),
      ]);
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
      toast({
        title: "اختيار الفرع مطلوب",
        description: error?.message || "اختار الفرع قبل إدارة المنتجات.",
        variant: "destructive",
      });
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
      toast({
        title: "تعذر تحميل المنتج",
        description: error?.message || "راجع الفرع وحاول مرة أخرى.",
        variant: "destructive",
      });
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
    if (exists) {
      toast({ title: "الباركود مستخدم بالفعل", description: barcodeValue, variant: "destructive" });
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (branchMissing) {
      toast({ title: "اختار الفرع قبل الحفظ", variant: "destructive" });
      return;
    }
    if (!product.name?.trim()) {
      toast({ title: "اكتب اسم المنتج", variant: "destructive" });
      return;
    }
    if (priceWarning) {
      toast({ title: "راجع الأسعار", description: priceWarning, variant: "destructive" });
      return;
    }
    if (await checkBarcode()) {
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
        description: productId
          ? "تم تحديث بيانات المنتج ومخزون الفرع."
          : "المنتج جاهز. تقدر تضيف الكرتونة أو الباك من وحدات البيع بالأسفل.",
      });

      if (!productId && saved?.id) {
        navigate(`/add-product?id=${saved.id}`, { replace: true });
      } else if (productId) {
        await loadProduct(productId);
      }
    } catch (error: any) {
      toast({
        title: "تعذر حفظ المنتج",
        description: error?.message || "راجع البيانات وحاول مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <MainLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-5 p-4 pb-10 md:p-6" dir="rtl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Package className="h-4 w-4" />
              المنتجات
              {branchName && <span>· {branchName}</span>}
            </div>
            <h1 className="text-2xl font-bold md:text-3xl">{productId ? "تعديل المنتج" : "إضافة منتج جديد"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              المخزون محفوظ للفرع، ووحدات الجملة مرتبطة بمخزون المنتج الأساسي.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate("/products")}>
            <ArrowRight className="ms-2 h-4 w-4" />
            العودة للمنتجات
          </Button>
        </div>

        {branchMissing && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>اختار الفرع أولًا. لن يتم اختيار أول فرع تلقائيًا لحماية المخزون.</AlertDescription>
          </Alert>
        )}

        {independentPricing && (
          <Alert>
            <TrendingUp className="h-4 w-4" />
            <AlertDescription>هذا الفرع يستخدم أسعارًا مستقلة؛ الأسعار التي تحفظها هنا تخص مصدر تسعير الفرع.</AlertDescription>
          </Alert>
        )}

        {legacyBulkDetected && (
          <Alert>
            <Boxes className="h-4 w-4" />
            <AlertDescription>
              المنتج عنده إعداد جملة قديم. لن نحذفه تلقائيًا؛ أضف وحدة البيع الجديدة بصورة وباركود مستقلين ثم نقدر ننقل القديم بأمان.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <div className="space-y-5">
              <Card>
                <CardHeader><CardTitle>المعلومات الأساسية</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="name">اسم المنتج *</Label>
                      <Input
                        id="name"
                        required
                        value={product.name || ""}
                        onChange={event => setProduct(prev => ({ ...prev, name: event.target.value }))}
                        placeholder="مثال: بيبسي 330 مل"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="description">وصف المنتج</Label>
                      <Textarea
                        id="description"
                        value={product.description || ""}
                        onChange={event => setProduct(prev => ({ ...prev, description: event.target.value }))}
                        placeholder="وصف مختصر يظهر عند الحاجة"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>وحدة القياس</Label>
                      <Input
                        value={product.unit_of_measure || ""}
                        onChange={event => setProduct(prev => ({ ...prev, unit_of_measure: event.target.value }))}
                        placeholder="قطعة / كجم / لتر"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>موقع الرف</Label>
                      <Input
                        value={product.shelf_location || ""}
                        onChange={event => setProduct(prev => ({ ...prev, shelf_location: event.target.value }))}
                        placeholder="A1 / ثلاجة 2"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>الأسعار والمخزون</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-2">
                      <Label>سعر الشراء *</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={product.purchase_price ?? ""}
                        onChange={event => setProduct(prev => ({ ...prev, purchase_price: Number(event.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>سعر البيع *</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={product.price ?? ""}
                        onChange={event => setProduct(prev => ({ ...prev, price: Number(event.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>مخزون الفرع</Label>
                      <Input
                        type="number"
                        min="0"
                        step={product.barcode_type === "scale" ? "0.001" : "1"}
                        value={product.quantity ?? ""}
                        onChange={event => setProduct(prev => ({ ...prev, quantity: Number(event.target.value) }))}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className={`rounded-xl border p-3 ${profit < 0 ? "border-destructive/40 bg-destructive/5" : "bg-muted/30"}`}>
                      <p className="text-xs text-muted-foreground">الربح للوحدة</p>
                      <p className={`mt-1 text-xl font-bold ${profit < 0 ? "text-destructive" : "text-primary"}`}>{profit.toFixed(2)} ج.م</p>
                    </div>
                    <div className="rounded-xl border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">هامش الربح</p>
                      <p className="mt-1 text-xl font-bold">{margin.toFixed(1)}%</p>
                    </div>
                  </div>

                  {priceWarning && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{priceWarning}</AlertDescription>
                    </Alert>
                  )}

                  <div className="rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="offer-enabled" className="font-semibold">عرض على المنتج</Label>
                        <p className="mt-1 text-xs text-muted-foreground">فعّل سعر العرض للمنتج الأساسي فقط.</p>
                      </div>
                      <Switch
                        id="offer-enabled"
                        checked={Boolean(product.is_offer)}
                        onCheckedChange={checked => setProduct(prev => ({ ...prev, is_offer: checked, offer_price: checked ? prev.offer_price : undefined }))}
                      />
                    </div>
                    {product.is_offer && (
                      <div className="mt-4 max-w-xs space-y-2">
                        <Label>سعر العرض</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={product.offer_price ?? ""}
                          onChange={event => setProduct(prev => ({ ...prev, offer_price: Number(event.target.value) }))}
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>الباركود والتصنيف</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>الباركود</Label>
                      <div className="flex gap-2">
                        <Input
                          value={product.barcode || ""}
                          onChange={event => {
                            setBarcodeConflict(false);
                            setProduct(prev => ({ ...prev, barcode: event.target.value }));
                          }}
                          onBlur={() => void checkBarcode()}
                          dir="ltr"
                          placeholder="امسح أو اكتب الباركود"
                        />
                        <Button type="button" variant="outline" size="icon" onClick={() => setScannerOpen(true)} title="مسح الباركود">
                          <ScanLine className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="min-h-5 text-xs">
                        {barcodeChecking && <span className="text-muted-foreground">جاري فحص الباركود...</span>}
                        {!barcodeChecking && barcodeConflict && <span className="font-medium text-destructive">الباركود مستخدم بالفعل.</span>}
                        {!barcodeChecking && !barcodeConflict && product.barcode && <span className="text-emerald-700">الباركود متاح.</span>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>نوع الباركود</Label>
                      <Select
                        value={product.barcode_type || "normal"}
                        onValueChange={value => setProduct(prev => ({
                          ...prev,
                          barcode_type: value,
                          unit_of_measure: value === "scale" ? "كجم" : (prev.unit_of_measure === "كجم" ? "قطعة" : prev.unit_of_measure),
                        }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">باركود عادي</SelectItem>
                          <SelectItem value="scale">ميزان / PLU</SelectItem>
                        </SelectContent>
                      </Select>
                      {product.barcode_type === "scale" && (
                        <p className="text-xs text-muted-foreground">الـPOS هيستخدم نفس منطق DALI الحالي لحساب الوزن والسعر.</p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>الشركة</Label>
                      <Select value={product.company_id || "none"} onValueChange={value => setProduct(prev => ({ ...prev, company_id: value === "none" ? "" : value }))}>
                        <SelectTrigger><SelectValue placeholder="اختر الشركة" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">بدون شركة</SelectItem>
                          {companies.map(company => <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>القسم الرئيسي</Label>
                      <Select
                        value={product.main_category_id || "none"}
                        onValueChange={async value => {
                          const categoryId = value === "none" ? "" : value;
                          setProduct(prev => ({ ...prev, main_category_id: categoryId, subcategory_id: "" }));
                          await loadSubcategoriesFor(categoryId);
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="اختر القسم" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">بدون قسم</SelectItem>
                          {categories.map(category => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>القسم الفرعي</Label>
                      <Select
                        value={product.subcategory_id || "none"}
                        onValueChange={value => setProduct(prev => ({ ...prev, subcategory_id: value === "none" ? "" : value }))}
                        disabled={!product.main_category_id}
                      >
                        <SelectTrigger><SelectValue placeholder="اختر القسم الفرعي" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">بدون قسم فرعي</SelectItem>
                          {subcategories.map(subcategory => <SelectItem key={subcategory.id} value={subcategory.id}>{subcategory.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>التنبيهات والصلاحية</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 font-semibold"><Bell className="h-4 w-4" /> تنبيه انخفاض المخزون</div>
                          <p className="mt-1 text-xs text-muted-foreground">يستخدم الحد الأدنى لمخزون الفرع الحالي.</p>
                        </div>
                        <Switch checked={alertEnabled} onCheckedChange={setAlertEnabled} />
                      </div>
                      <div className="mt-4 space-y-2">
                        <Label>الحد الأدنى</Label>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={minStockLevel}
                          onChange={event => setMinStockLevel(Math.max(0, Number(event.target.value) || 0))}
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">تتبع الصلاحية</p>
                          <p className="mt-1 text-xs text-muted-foreground">سيتم تطوير الدفعات كمرجع أساسي للصلاحية.</p>
                        </div>
                        <Switch checked={Boolean(product.track_expiry)} onCheckedChange={checked => setProduct(prev => ({ ...prev, track_expiry: checked }))} />
                      </div>
                      {product.track_expiry && (
                        <div className="mt-4 space-y-2">
                          <Label>تاريخ صلاحية مبدئي</Label>
                          <Input type="date" value={product.expiry_date || ""} onChange={event => setProduct(prev => ({ ...prev, expiry_date: event.target.value }))} />
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-5">
              <Card className="lg:sticky lg:top-4">
                <CardHeader><CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5" /> صورة المنتج</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <DragDropImage
                    value={product.image_urls?.[0] || null}
                    onChange={url => setProduct(prev => ({ ...prev, image_urls: url ? [url] : [] }))}
                    bucketName="products"
                    folder="products/main"
                    maxDimension={800}
                    targetBytes={140 * 1024}
                  />
                  <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                    الصورة لا تُحفظ في بيانات المنتج إلا مع زر الحفظ. الملف نفسه يتم ضغطه قبل الرفع لتقليل المساحة.
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex items-center gap-2 text-sm">
                    {barcodeConflict ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    <span>{barcodeConflict ? "راجع الباركود قبل الحفظ" : "بيانات المنتج جاهزة للمراجعة"}</span>
                  </div>
                  <Button type="submit" className="w-full" size="lg" disabled={loading || branchMissing || barcodeConflict}>
                    {loading ? <Loader2 className="ms-2 h-4 w-4 animate-spin" /> : <Save className="ms-2 h-4 w-4" />}
                    {productId ? "حفظ التعديلات" : "حفظ المنتج"}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => navigate("/products")}>إلغاء والعودة</Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>

        <ProductSaleUnitsCard
          productId={productId}
          productName={product.name || ""}
          baseQuantity={Number(product.quantity || 0)}
        />

        <BarcodeScanner isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleBarcodeScan} />
      </div>
    </MainLayout>
  );
}
