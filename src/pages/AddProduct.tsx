import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { fetchProductById, updateProduct, createProduct, fetchProductByBarcode } from "@/services/supabase/productService";
import { Product } from "@/types";
import { Loader2, Scan } from "lucide-react";
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
        title: "Error",
        description: "Failed to load categories",
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
        title: "Error",
        description: "Failed to load companies",
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
        title: "Error",
        description: "Failed to load subcategories",
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
    } catch (error) {
      console.error("Error loading product:", error);
      toast({
        title: "Error",
        description: "Failed to load product",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    
    // Validation for required fields
    if (!product.name) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسم المنتج",
        variant: "destructive",
      });
      return;
    }
    
    if (product.price === undefined || product.price === null) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال سعر المنتج",
        variant: "destructive",
      });
      return;
    }
    
    if (product.purchase_price === undefined || product.purchase_price === null) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال سعر الشراء",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Check for barcode duplication if barcode is provided
      if (product.barcode && product.barcode.trim() !== "") {
        const existingProduct = await fetchProductByBarcode(product.barcode);
        if (existingProduct && existingProduct.id !== productId) {
          toast({
            title: "خطأ - باركود مكرر",
            description: `يوجد منتج آخر بنفس الباركود: ${existingProduct.name}`,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }

      // Check for bulk barcode duplication if bulk barcode is provided
      if (product.bulk_barcode && product.bulk_barcode.trim() !== "") {
        const existingBulkProduct = await fetchProductByBarcode(product.bulk_barcode);
        if (existingBulkProduct && existingBulkProduct.id !== productId) {
          toast({
            title: "خطأ - باركود الجملة مكرر",
            description: `يوجد منتج آخر بنفس باركود الجملة: ${existingBulkProduct.name}`,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }

      const productData = {
        ...product,
        name: product.name, // Ensure name is included and not undefined
        price: Number(product.price), // Ensure price is a number
        purchase_price: Number(product.purchase_price), // Ensure purchase_price is a number
        main_category_id: product.main_category_id || null,
        subcategory_id: product.subcategory_id || null,
        company_id: product.company_id || null,
        image_urls: product.image_urls || [],
        is_bulk: product.is_bulk || false,
        bulk_enabled: product.bulk_enabled || false,
      } as Omit<Product, "id" | "created_at" | "updated_at">;
      
      console.log("Submitting product data:", productData);
      
      if (productId) {
        // Update existing product
        await updateProduct(productId, productData);
        toast({
          title: "تم بنجاح",
          description: "تم تحديث المنتج بنجاح",
        });
      } else {
        // Create new product
        await createProduct(productData);
        toast({
          title: "تم بنجاح",
          description: "تم إضافة المنتج بنجاح",
        });
      }
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

  useEffect(() => {
    if (product?.main_category_id) {
      loadSubcategories(product.main_category_id);
    } else {
      setSubcategories([]);
    }
  }, [product?.main_category_id]);

  const handleSelectChange = (value: string, field: string) => {
    if (field === 'main_category_id') {
      if (value === "none") {
        setProduct(prev => ({ 
          ...prev, 
          main_category_id: null,
          subcategory_id: null
        }));
      } else {
        setProduct(prev => ({ 
          ...prev, 
          main_category_id: value,
          subcategory_id: null
        }));
      }
    } else if (field === 'subcategory_id') {
      if (value === "none") {
        setProduct(prev => ({ 
          ...prev, 
          [field]: null
        }));
      } else {
        setProduct(prev => ({ 
          ...prev, 
          [field]: value
        }));
      }
    } else if (field === 'company_id') {
      if (value === "none") {
        setProduct(prev => ({ 
          ...prev, 
          [field]: null
        }));
      } else {
        setProduct(prev => ({ 
          ...prev, 
          [field]: value
        }));
      }
    } else {
      setProduct(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleBarcodeScanned = (barcode: string) => {
    setProduct(prev => ({ ...prev, barcode }));
    toast({
      title: "تم مسح الباركود",
      description: `تم إدخال الباركود: ${barcode}`,
    });
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">
            {productId ? "تعديل المنتج" : "إضافة منتج جديد"}
          </h1>
          <p className="text-muted-foreground">
            {productId
              ? "تعديل تفاصيل المنتج الحالي"
              : "إضافة منتج جديد إلى المخزون"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="name">اسم المنتج</Label>
              <Input
                id="name"
                placeholder="اسم المنتج"
                value={product?.name || ""}
                onChange={(e) =>
                  setProduct((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>

            <div>
              <Label htmlFor="product-image">صورة المنتج</Label>
              <DragDropImage
                value={product?.image_urls?.[0] || null}
                onChange={(url) =>
                  setProduct((prev) => ({
                    ...prev,
                    image_urls: url ? [url] : [],
                  }))
                }
                bucketName="products"
              />
            </div>

            <div>
              <Label htmlFor="price">السعر</Label>
              <Input
                type="number"
                id="price"
                placeholder="السعر"
                value={product?.price || ""}
                onChange={(e) =>
                  setProduct((prev) => ({ ...prev, price: Number(e.target.value) }))
                }
              />
            </div>

            <div>
              <Label htmlFor="offer_price">سعر العرض</Label>
              <Input
                type="number"
                id="offer_price"
                placeholder="سعر العرض"
                value={product?.offer_price || ""}
                onChange={(e) =>
                  setProduct((prev) => ({ 
                    ...prev, 
                    offer_price: e.target.value ? Number(e.target.value) : null 
                  }))
                }
              />
            </div>

            <div>
              <Label htmlFor="purchase_price">سعر الشراء</Label>
              <Input
                type="number"
                id="purchase_price"
                placeholder="سعر الشراء"
                value={product?.purchase_price || ""}
                onChange={(e) =>
                  setProduct((prev) => ({ ...prev, purchase_price: Number(e.target.value) }))
                }
              />
            </div>

            <div>
              <Label htmlFor="quantity">الكمية</Label>
              <Input
                type="number"
                id="quantity"
                placeholder="الكمية"
                value={product?.quantity || ""}
                onChange={(e) =>
                  setProduct((prev) => ({ ...prev, quantity: Number(e.target.value) }))
                }
              />
            </div>

            <div>
              <Label htmlFor="min_stock_level">كمية التنبيه (الحد الأدنى)</Label>
              <Input
                type="number"
                id="min_stock_level"
                placeholder="5"
                value={product?.min_stock_level || ""}
                onChange={(e) =>
                  setProduct((prev) => ({ ...prev, min_stock_level: Number(e.target.value) }))
                }
              />
            </div>

            <div>
              <Label htmlFor="max_stock_level">الحد الأقصى للمخزون</Label>
              <Input
                type="number"
                id="max_stock_level"
                placeholder="100"
                value={product?.max_stock_level || ""}
                onChange={(e) =>
                  setProduct((prev) => ({ ...prev, max_stock_level: Number(e.target.value) }))
                }
              />
            </div>

            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <Checkbox
                id="is_offer"
                checked={product?.is_offer || false}
                onCheckedChange={(checked) =>
                  setProduct(prev => ({ ...prev, is_offer: checked as boolean }))
                }
              />
              <Label htmlFor="is_offer">منتج في العروض</Label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="main_category_id">القسم الرئيسي</Label>
              <Select
                value={product?.main_category_id || "none"}
                onValueChange={(value) => handleSelectChange(value, 'main_category_id')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر القسم الرئيسي" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون قسم</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {product?.main_category_id && (
              <div>
                <Label htmlFor="subcategory_id">القسم الفرعي</Label>
                <Select
                  value={product?.subcategory_id || "none"}
                  onValueChange={(value) => handleSelectChange(value, 'subcategory_id')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر القسم الفرعي" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون قسم فرعي</SelectItem>
                    {subcategories.map((subcategory) => (
                      <SelectItem key={subcategory.id} value={subcategory.id}>
                        {subcategory.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="barcode_type">نوع الباركود</Label>
              <Select 
                value={product?.barcode_type || 'normal'} 
                onValueChange={(value) => setProduct(prev => ({ ...prev, barcode_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر نوع الباركود" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">باركود عادي</SelectItem>
                  <SelectItem value="scale">باركود ميزان</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="barcode">الباركود</Label>
              <div className="flex gap-2">
                <Input
                  id="barcode"
                  placeholder="ادخل الباركود"
                  value={product?.barcode || ''}
                  onChange={(e) => setProduct(prev => ({ ...prev, barcode: e.target.value }))}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setIsScannerOpen(true)}
                  className="flex-shrink-0"
                >
                  <Scan className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="company_id">الشركة</Label>
              <Select
                value={product?.company_id || "none"}
                onValueChange={(value) => handleSelectChange(value, 'company_id')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر الشركة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون شركة</SelectItem>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <Checkbox
                id="bulk_enabled"
                checked={product?.bulk_enabled || false}
                onCheckedChange={(checked) => 
                  setProduct(prev => ({ ...prev, bulk_enabled: checked as boolean }))
                }
              />
              <Label htmlFor="bulk_enabled">تفعيل البيع بالجملة</Label>
            </div>

            {product?.bulk_enabled && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label htmlFor="bulk_quantity">الكمية للبيع بالجملة</Label>
                  <Input
                    id="bulk_quantity"
                    type="number"
                    placeholder="ادخل الكمية"
                    value={product?.bulk_quantity || ''}
                    onChange={(e) => setProduct(prev => ({ ...prev, bulk_quantity: parseInt(e.target.value) }))}
                  />
                </div>

                <div>
                  <Label htmlFor="bulk_price">سعر الجملة</Label>
                  <Input
                    id="bulk_price"
                    type="number"
                    step="0.01"
                    placeholder="ادخل السعر"
                    value={product?.bulk_price || ''}
                    onChange={(e) => setProduct(prev => ({ ...prev, bulk_price: parseFloat(e.target.value) }))}
                  />
                </div>

                <div>
                  <Label htmlFor="bulk_barcode">باركود الجملة</Label>
                  <div className="flex gap-2">
                    <Input
                      id="bulk_barcode"
                      placeholder="ادخل الباركود"
                      value={product?.bulk_barcode || ''}
                      onChange={(e) => setProduct(prev => ({ ...prev, bulk_barcode: e.target.value }))}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setIsScannerOpen(true)}
                      className="flex-shrink-0"
                    >
                      <Scan className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="description">الوصف</Label>
            <Input
              id="description"
              placeholder="الوصف"
              value={product?.description || ""}
              onChange={(e) =>
                setProduct((prev) => ({ ...prev, description: e.target.value }))
              }
            />
          </div>

          <Button disabled={loading}>
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
