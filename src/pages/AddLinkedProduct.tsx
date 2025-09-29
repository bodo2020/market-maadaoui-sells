import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Product } from "@/types";
import { createLinkedProduct } from "@/services/supabase/linkedProductsService";
import ProductSelectionDialog from "@/components/products/ProductSelectionDialog";
import { DragDropImage } from "@/components/ui/drag-drop-image";
import BarcodeScanner from "@/components/POS/BarcodeScanner";
import { Loader2, ArrowLeft, LinkIcon, Package, Barcode, QrCode, AlertCircle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function AddLinkedProduct() {
  const [parentProduct, setParentProduct] = useState<Product | null>(null);
  const [linkedProductData, setLinkedProductData] = useState({
    barcode: "",
    image_urls: [] as string[],
    price: 0,
    shared_inventory: false,
    conversion_factor: 1,
  });
  
  const [loading, setLoading] = useState(false);
  const [isProductSelectionOpen, setIsProductSelectionOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  
  const { toast: showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode");

  useEffect(() => {
    if (mode === "linked") {
      setIsProductSelectionOpen(true);
    }
  }, [mode]);

  const handleParentProductSelect = (product: Product) => {
    setParentProduct(product);
    // تعيين سعر البيع الافتراضي نفس سعر المنتج الأساسي
    setLinkedProductData(prev => ({
      ...prev,
      price: product.price
    }));
    toast.success(`تم اختيار المنتج الأساسي: ${product.name}`);
  };

  const handleImageUpload = (url: string | null) => {
    if (url) {
      setLinkedProductData(prev => ({
        ...prev,
        image_urls: [...prev.image_urls, url]
      }));
    }
  };

  const handleImageRemove = () => {
    setLinkedProductData(prev => ({
      ...prev,
      image_urls: []
    }));
  };

  const handleBarcodeScan = (barcode: string) => {
    setLinkedProductData(prev => ({
      ...prev,
      barcode
    }));
    setIsScannerOpen(false);
    toast.success("تم قراءة الباركود بنجاح");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!parentProduct) {
      showToast({
        title: "خطأ",
        description: "يجب اختيار منتج أساسي للربط",
        variant: "destructive",
      });
      return;
    }

    if (linkedProductData.price <= 0) {
      showToast({
        title: "خطأ",
        description: "يجب إدخال سعر بيع صحيح",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      
      await createLinkedProduct(parentProduct, linkedProductData);
      
      showToast({
        title: "تم بنجاح",
        description: "تم إنشاء المنتج المرتبط بنجاح",
      });
      
      navigate("/product-management");
    } catch (error) {
      console.error("Error creating linked product:", error);
      showToast({
        title: "خطأ",
        description: "فشل في إنشاء المنتج المرتبط",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setParentProduct(null);
    setLinkedProductData({
      barcode: "",
      image_urls: [],
      price: 0,
      shared_inventory: false,
      conversion_factor: 1,
    });
    setIsProductSelectionOpen(true);
  };

  return (
    <MainLayout>
      <div className="container mx-auto py-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="sm" onClick={() => navigate("/product-management")}>
            <ArrowLeft className="h-4 w-4 ml-2" />
            العودة
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <LinkIcon className="h-8 w-8" />
              إضافة منتج مرتبط
            </h1>
            <p className="text-muted-foreground mt-1">
              إنشاء منتج جديد مرتبط بمنتج موجود مع إمكانية مشاركة المخزون
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* معلومات المنتج الأساسي */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  المنتج الأساسي
                </CardTitle>
                <CardDescription>
                  المنتج الذي سيتم ربط المنتج الجديد به
                </CardDescription>
              </CardHeader>
              <CardContent>
                {parentProduct ? (
                  <div className="space-y-4">
                    {/* صورة المنتج الأساسي */}
                    {parentProduct.image_urls && parentProduct.image_urls.length > 0 ? (
                      <img
                        src={parentProduct.image_urls[0]}
                        alt={parentProduct.name}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="w-full h-32 bg-muted rounded-lg flex items-center justify-center">
                        <Package className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    
                    {/* معلومات المنتج */}
                    <div className="space-y-2">
                      <h3 className="font-medium text-lg">{parentProduct.name}</h3>
                      {parentProduct.barcode && (
                        <Badge variant="outline" className="text-xs">
                          {parentProduct.barcode}
                        </Badge>
                      )}
                      <div className="text-sm space-y-1">
                        <div>سعر البيع: <span className="font-medium">{parentProduct.price} ج.م</span></div>
                        <div>سعر الشراء: <span className="font-medium">{parentProduct.purchase_price} ج.م</span></div>
                        <div>الكمية: <span className="font-medium">{parentProduct.quantity}</span></div>
                      </div>
                    </div>

                    {/* زر تغيير المنتج */}
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => setIsProductSelectionOpen(true)}
                    >
                      تغيير المنتج الأساسي
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">لم يتم اختيار منتج أساسي</p>
                    <Button onClick={() => setIsProductSelectionOpen(true)}>
                      اختيار منتج أساسي
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* نموذج المنتج المرتبط */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>بيانات المنتج المرتبط</CardTitle>
                <CardDescription>
                  البيانات المخصصة للمنتج المرتبط (الباركود، الصورة، السعر)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* تنبيه */}
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      سيتم نسخ اسم المنتج وسعر الشراء والفئة تلقائياً من المنتج الأساسي.
                      يمكنك تخصيص الباركود والصورة وسعر البيع فقط.
                    </AlertDescription>
                  </Alert>

                  {/* الباركود */}
                  <div className="space-y-2">
                    <Label htmlFor="barcode">الباركود (اختياري)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="barcode"
                        value={linkedProductData.barcode}
                        onChange={(e) => setLinkedProductData(prev => ({ ...prev, barcode: e.target.value }))}
                        placeholder="أدخل باركود المنتج المرتبط"
                      />
                      <Button type="button" variant="outline" onClick={() => setIsScannerOpen(true)}>
                        <QrCode className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* عامل التحويل */}
                  <div className="space-y-2">
                    <Label htmlFor="conversion_factor">عامل التحويل *</Label>
                    <Input
                      id="conversion_factor"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={linkedProductData.conversion_factor}
                      onChange={(e) => setLinkedProductData(prev => ({ ...prev, conversion_factor: parseFloat(e.target.value) || 1 }))}
                      placeholder="مثال: 30 (إذا كان المنتج يحتوي على 30 وحدة من المنتج الأساسي)"
                      required
                    />
                    <p className="text-sm text-muted-foreground">
                      عدد الوحدات من المنتج الأساسي في هذا المنتج. مثال: إذا كان المنتج الأساسي "بيضة" وهذا المنتج "كرتونة بيض"، 
                      فعامل التحويل هو 30 (30 بيضة في الكرتونة)
                    </p>
                  </div>

                  {/* سعر البيع */}
                  <div className="space-y-2">
                    <Label htmlFor="price">سعر البيع *</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={linkedProductData.price}
                      onChange={(e) => setLinkedProductData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                      placeholder="أدخل سعر البيع"
                      required
                    />
                    {parentProduct && linkedProductData.conversion_factor > 1 && (
                      <p className="text-sm text-muted-foreground">
                        سعر الوحدة الواحدة: {(linkedProductData.price / linkedProductData.conversion_factor).toFixed(2)} ج.م
                        (مقارنة بالمنتج الأساسي: {parentProduct.price} ج.م)
                      </p>
                    )}
                  </div>

                  {/* مشاركة المخزون */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="shared_inventory">مشاركة المخزون</Label>
                        <p className="text-sm text-muted-foreground">
                          عند التفعيل، ستتم مشاركة الكمية مع المنتج الأساسي بناءً على عامل التحويل.
                          مثال: بيع كرتونة واحدة = تقليل 30 بيضة من المخزون
                        </p>
                      </div>
                      <Switch
                        id="shared_inventory"
                        checked={linkedProductData.shared_inventory}
                        onCheckedChange={(checked) => setLinkedProductData(prev => ({ ...prev, shared_inventory: checked }))}
                      />
                    </div>
                  </div>

                  {/* صور المنتج */}
                  <div className="space-y-2">
                    <Label>صور المنتج</Label>
                    <DragDropImage
                      value={linkedProductData.image_urls[0] || null}
                      onChange={handleImageUpload}
                    />
                    {linkedProductData.image_urls.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {linkedProductData.image_urls.map((url, index) => (
                          <div key={index} className="relative">
                            <img
                              src={url}
                              alt={`صورة ${index + 1}`}
                              className="w-20 h-20 object-cover rounded border"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                              onClick={() => setLinkedProductData(prev => ({
                                ...prev,
                                image_urls: prev.image_urls.filter((_, i) => i !== index)
                              }))}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* أزرار الإجراءات */}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={loading || !parentProduct}>
                      {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                      حفظ المنتج المرتبط
                    </Button>
                    <Button type="button" variant="outline" onClick={resetForm}>
                      إعادة تعيين
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* نوافذ حوارية */}
        <ProductSelectionDialog
          open={isProductSelectionOpen}
          onOpenChange={setIsProductSelectionOpen}
          onSelectProduct={handleParentProductSelect}
        />

        {isScannerOpen && (
          <BarcodeScanner
            isOpen={isScannerOpen}
            onScan={handleBarcodeScan}
            onClose={() => setIsScannerOpen(false)}
          />
        )}
      </div>
    </MainLayout>
  );
}