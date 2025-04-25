
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { fetchProductById, updateProduct } from "@/services/supabase/productService";
import { Product } from "@/types";
import { Loader2 } from "lucide-react";
import { fetchMainCategories } from "@/services/supabase/categoryService";
import { fetchCompanies } from "@/services/supabase/companyService";
import { fetchSubcategories } from "@/services/supabase/categoryService";
import { MainCategory, Subcategory, Company } from "@/types";
import { DragDropImage } from "@/components/ui/drag-drop-image";

export default function AddProduct() {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<MainCategory[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
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

    setLoading(true);
    try {
      const productToUpdate = {
        ...product,
        main_category_id: product.main_category_id || null,
        subcategory_id: product.subcategory_id || null,
        company_id: product.company_id || null,
        image_urls: product.image_urls || [],
      };
      
      console.log("Updating product with data:", productToUpdate);
      
      await updateProduct(product.id, productToUpdate);
      toast({
        title: "Success",
        description: "Product updated successfully",
      });
      navigate("/products");  // Changed from "/product-management" to "/products"
    } catch (error) {
      console.error("Error updating product:", error);
      toast({
        title: "Error",
        description: "Failed to update product",
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
              <Input
                id="barcode"
                placeholder="ادخل الباركود"
                value={product?.barcode || ''}
                onChange={(e) => setProduct(prev => ({ ...prev, barcode: e.target.value }))}
              />
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
                  <Input
                    id="bulk_barcode"
                    placeholder="ادخل الباركود"
                    value={product?.bulk_barcode || ''}
                    onChange={(e) => setProduct(prev => ({ ...prev, bulk_barcode: e.target.value }))}
                  />
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
      </div>
    </MainLayout>
  );
}
