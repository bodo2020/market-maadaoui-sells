import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { fetchProductById, updateProduct, createProduct, fetchProductByBarcode } from "@/services/supabase/productService";
import { saveInventoryAlert, getInventoryAlert } from "@/services/supabase/inventoryService";
import { Product } from "@/types";
import { Loader2, Scan, Bell, BellOff, AlertTriangle } from "lucide-react";
import { fetchMainCategories } from "@/services/supabase/categoryService";
import { fetchCompanies } from "@/services/supabase/companyService";
import { fetchSubcategories } from "@/services/supabase/categoryService";
import { MainCategory, Subcategory, Company } from "@/types";
import { DragDropImage } from "@/components/ui/drag-drop-image";
import BarcodeScanner from "@/components/POS/BarcodeScanner";

export default function AddProduct() {
  const [product, setProduct] = useState<Partial<Product>>({
    name: "",
    price: 0,
    purchase_price: 0,
    quantity: 0,
    image_urls: [],
    is_offer: false,
    barcode_type: "normal",
  });
  
  // إعدادات التنبيه
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [minStockLevel, setMinStockLevel] = useState<number | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<MainCategory[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const productId = searchParams.get("id");

  useEffect(() => {
    loadCategories();
    loadCompanies();
    if (productId) {
      loadProduct(productId);
    }
  }, [productId]);

  const loadCategories = async () => {
    try {
      const mainCategories = await fetchMainCategories();
      setCategories(mainCategories);
    } catch (error) {
      console.error("Error loading categories:", error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل الفئات",
        variant: "destructive",
      });
    }
  };

  const loadCompanies = async () => {
    try {
      const companiesData = await fetchCompanies();
      setCompanies(companiesData);
    } catch (error) {
      console.error("Error loading companies:", error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل الشركات",
        variant: "destructive",
      });
    }
  };

  const loadSubcategories = async (categoryId: string) => {
    try {
      const subs = await fetchSubcategories(categoryId);
      setSubcategories(subs);
    } catch (error) {
      console.error("Error loading subcategories:", error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل الفئات الفرعية",
        variant: "destructive",
      });
    }
  };

  const loadProduct = async (id: string) => {
    setLoading(true);
    try {
      const data = await fetchProductById(id);
      setProduct(data);
      
      if (data.main_category_id) {
        await loadSubcategories(data.main_category_id);
      }
      
      // تحميل إعدادات التنبيه
      try {
        const alert = await getInventoryAlert(id);
        if (alert) {
          setAlertEnabled(alert.alert_enabled || false);
          setMinStockLevel(alert.min_stock_level);
        }
      } catch (error) {
        console.log("No existing alert found, using defaults");
      }
    } catch (error) {
      console.error("Error loading product:", error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل المنتج",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let savedProduct;
      if (productId) {
        savedProduct = await updateProduct(productId, product as Product);
      } else {
        savedProduct = await createProduct(product as Product);
      }

      // حفظ إعدادات التنبيه
      if (savedProduct?.id) {
        await saveInventoryAlert(
          savedProduct.id, 
          alertEnabled ? minStockLevel : null, 
          alertEnabled
        );
      }

      toast({
        title: "تم بنجاح",
        description: productId ? "تم تحديث المنتج بنجاح" : "تم إضافة المنتج بنجاح",
      });

      navigate("/products");
    } catch (error) {
      console.error("Error saving product:", error);
      toast({
        title: "خطأ",
        description: "فشل في حفظ المنتج",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeScanned = async (barcode: string) => {
    setIsScannerOpen(false);
    setProduct((prev) => ({ ...prev, barcode }));
    
    // البحث عن منتج موجود بنفس الباركود
    try {
      const existingProduct = await fetchProductByBarcode(barcode);
      if (existingProduct && existingProduct.id !== productId) {
        toast({
          title: "تحذير",
          description: "يوجد منتج آخر بنفس الباركود",
          variant: "destructive",
        });
      }
    } catch (error) {
      // لا يوجد منتج بنفس الباركود، يمكن المتابعة
    }
  };

  const handleImageUpload = (url: string | null) => {
    if (url) {
      setProduct(prev => ({
        ...prev,
        image_urls: [url], // استبدال الصورة بدلاً من إضافة
      }));
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">
          {productId ? "تعديل المنتج" : "إضافة منتج جديد"}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* معلومات المنتج الأساسية */}
          <Card>
            <CardHeader>
              <CardTitle>المعلومات الأساسية</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">اسم المنتج</Label>
                  <Input
                    id="name"
                    required
                    placeholder="اسم المنتج"
                    value={product?.name || ""}
                    onChange={(e) => setProduct((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="barcode">الباركود</Label>
                  <div className="flex gap-2">
                    <Input
                      id="barcode"
                      placeholder="الباركود"
                      value={product?.barcode || ""}
                      onChange={(e) => setProduct((prev) => ({ ...prev, barcode: e.target.value }))}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsScannerOpen(true)}
                      className="flex-shrink-0"
                    >
                      <Scan className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="price">سعر البيع</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    placeholder="سعر البيع"
                    value={product?.price || ""}
                    onChange={(e) => setProduct((prev) => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                  />
                </div>

                <div>
                  <Label htmlFor="purchase_price">سعر الشراء</Label>
                  <Input
                    id="purchase_price"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    placeholder="سعر الشراء"
                    value={product?.purchase_price || ""}
                    onChange={(e) => setProduct((prev) => ({ ...prev, purchase_price: parseFloat(e.target.value) || 0 }))}
                  />
                </div>

                <div>
                  <Label htmlFor="quantity">الكمية</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="0"
                    placeholder="الكمية"
                    value={product?.quantity || ""}
                    onChange={(e) => setProduct((prev) => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                  />
                </div>

                <div>
                  <Label htmlFor="unit_of_measure">وحدة القياس</Label>
                  <Input
                    id="unit_of_measure"
                    placeholder="وحدة القياس (كيلو، قطعة، إلخ)"
                    value={product?.unit_of_measure || ""}
                    onChange={(e) => setProduct((prev) => ({ ...prev, unit_of_measure: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">الوصف</Label>
                <Input
                  id="description"
                  placeholder="الوصف"
                  value={product?.description || ""}
                  onChange={(e) => setProduct((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* تنبيهات المخزون */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {alertEnabled ? <Bell className="h-5 w-5 text-primary" /> : <BellOff className="h-5 w-5 text-muted-foreground" />}
                تنبيهات المخزون
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2 space-x-reverse">
                <Switch
                  id="alert-enabled"
                  checked={alertEnabled}
                  onCheckedChange={setAlertEnabled}
                />
                <Label htmlFor="alert-enabled">تفعيل تنبيه المخزون المنخفض</Label>
              </div>

              {alertEnabled && (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="min-stock">كمية التنبيه (الحد الأدنى)</Label>
                    <Input
                      id="min-stock"
                      type="number"
                      min="1"
                      placeholder="أدخل الحد الأدنى للمخزون"
                      value={minStockLevel || ""}
                      onChange={(e) => setMinStockLevel(parseInt(e.target.value) || null)}
                    />
                  </div>
                  
                  {minStockLevel && (product?.quantity || 0) < minStockLevel && (
                    <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm text-yellow-800">
                        تحذير: الكمية الحالية ({product?.quantity || 0}) أقل من الحد المحدد ({minStockLevel})
                      </span>
                    </div>
                  )}
                </div>
              )}

              {!alertEnabled && (
                <p className="text-sm text-muted-foreground">
                  لن يتم إرسال تنبيهات للمخزون المنخفض لهذا المنتج
                </p>
              )}
            </CardContent>
          </Card>

          {/* التصنيفات والشركات */}
          <Card>
            <CardHeader>
              <CardTitle>التصنيف والشركة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="company">الشركة</Label>
                  <Select
                    value={product?.company_id || ""}
                    onValueChange={(value) => setProduct((prev) => ({ ...prev, company_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الشركة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">بدون شركة</SelectItem>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="main_category">الفئة الرئيسية</Label>
                  <Select
                    value={product?.main_category_id || ""}
                    onValueChange={(value) => {
                      setProduct((prev) => ({ ...prev, main_category_id: value, subcategory_id: "" }));
                      if (value) {
                        loadSubcategories(value);
                      } else {
                        setSubcategories([]);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الفئة الرئيسية" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">بدون فئة</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="subcategory">الفئة الفرعية</Label>
                  <Select
                    value={product?.subcategory_id || ""}
                    onValueChange={(value) => setProduct((prev) => ({ ...prev, subcategory_id: value }))}
                    disabled={!product?.main_category_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الفئة الفرعية" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">بدون فئة فرعية</SelectItem>
                      {subcategories.map((subcategory) => (
                        <SelectItem key={subcategory.id} value={subcategory.id}>
                          {subcategory.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* العروض */}
          <Card>
            <CardHeader>
              <CardTitle>العروض</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2 space-x-reverse">
                <Checkbox
                  id="is_offer"
                  checked={product?.is_offer || false}
                  onCheckedChange={(checked) => setProduct((prev) => ({ ...prev, is_offer: !!checked }))}
                />
                <Label htmlFor="is_offer">هذا المنتج في عرض خاص</Label>
              </div>

              {product?.is_offer && (
                <div>
                  <Label htmlFor="offer_price">سعر العرض</Label>
                  <Input
                    id="offer_price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="سعر العرض"
                    value={product?.offer_price || ""}
                    onChange={(e) => setProduct((prev) => ({ ...prev, offer_price: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* صور المنتج */}
          <Card>
            <CardHeader>
              <CardTitle>صورة المنتج</CardTitle>
            </CardHeader>
            <CardContent>
              <DragDropImage
                value={product?.image_urls?.[0] || null}
                onChange={handleImageUpload}
                bucketName="products"
              />
            </CardContent>
          </Card>

          <Separator />

          <Button type="submit" disabled={loading} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {productId ? "تحديث المنتج" : "إضافة المنتج"}
          </Button>
        </form>

        <BarcodeScanner
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScan={handleBarcodeScanned}
        />
      </div>
    </MainLayout>
  );
}
