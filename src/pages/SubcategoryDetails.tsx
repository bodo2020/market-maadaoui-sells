import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Edit, Trash2, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchSubcategoryById } from "@/services/supabase/categoryService";
import { fetchProductsBySubcategory, deleteProduct } from "@/services/supabase/productService";
import { Subcategory, Product } from "@/types";
import { toast } from "sonner";
// Removed ProductGrid import as we'll build the grid inline

export default function SubcategoryDetails() {
  const { id: subcategoryId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [subcategory, setSubcategory] = useState<Subcategory | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (subcategoryId) {
      loadSubcategoryDetails();
    }
  }, [subcategoryId]);

  const loadSubcategoryDetails = async () => {
    try {
      setLoading(true);
      
      // Load subcategory details
      const subcategoryData = await fetchSubcategoryById(subcategoryId!);
      setSubcategory(subcategoryData);
      
      // Load products in this subcategory
      const productsData = await fetchProductsBySubcategory(subcategoryId!);
      setProducts(productsData || []);
      
    } catch (error) {
      console.error("Error loading subcategory details:", error);
      toast.error("حدث خطأ أثناء تحميل تفاصيل القسم الفرعي");
    } finally {
      setLoading(false);
    }
  };

  const handleAddProduct = () => {
    navigate(`/add-product?subcategory=${subcategoryId}`);
  };

  const handleEditProduct = (product: Product) => {
    navigate(`/add-product?id=${product.id}`);
  };

  const handleDeleteProduct = async (product: Product) => {
    if (window.confirm(`هل أنت متأكد من حذف المنتج "${product.name}"؟`)) {
      try {
        await deleteProduct(product.id);
        toast.success("تم حذف المنتج بنجاح");
        loadSubcategoryDetails(); // Reload to update the list
      } catch (error) {
        console.error("Error deleting product:", error);
        toast.error("حدث خطأ أثناء حذف المنتج");
      }
    }
  };

  const handleGoBack = () => {
    if (subcategory?.category_id) {
      navigate(`/categories/${subcategory.category_id}`);
    } else {
      navigate('/categories');
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="container py-6">
          <div className="text-center py-8">جاري التحميل...</div>
        </div>
      </MainLayout>
    );
  }

  if (!subcategory) {
    return (
      <MainLayout>
        <div className="container py-6">
          <div className="text-center py-8">
            <h2 className="text-xl font-semibold">القسم الفرعي غير موجود</h2>
            <Button onClick={handleGoBack} className="mt-4">
              <ArrowLeft className="h-4 w-4 ml-2" />
              العودة
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container py-6 space-y-6">
        {/* Header Section */}
        <div className="flex justify-between items-start">
          <div className="flex items-start gap-4">
            <Button 
              variant="outline" 
              onClick={handleGoBack}
              className="mt-1"
            >
              <ArrowLeft className="h-4 w-4 ml-2" />
              العودة
            </Button>
            
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-3xl font-bold">{subcategory.name}</h1>
                <Badge variant="outline">قسم فرعي</Badge>
              </div>
              {subcategory.description && (
                <p className="text-gray-600 max-w-2xl">{subcategory.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  {products.length} منتج
                </Badge>
              </div>
            </div>
          </div>
          
          <Button onClick={handleAddProduct}>
            <Plus className="h-4 w-4 ml-2" />
            إضافة منتج جديد
          </Button>
        </div>

        {/* Subcategory Image */}
        {subcategory.image_url && (
          <Card>
            <CardContent className="p-6">
              <div className="h-64 bg-gray-100 rounded-lg overflow-hidden">
                <img 
                  src={subcategory.image_url} 
                  alt={subcategory.name}
                  className="w-full h-full object-cover"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Products Section */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                منتجات القسم الفرعي ({products.length})
              </CardTitle>
              <Button variant="outline" onClick={handleAddProduct}>
                <Plus className="h-4 w-4 ml-2" />
                إضافة منتج
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {products.length === 0 ? (
              <div className="text-center py-10 bg-gray-50 rounded-md">
                <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium">لا توجد منتجات في هذا القسم الفرعي</h3>
                <p className="text-gray-500 mb-4">يمكنك إضافة منتجات جديدة من خلال الزر أعلاه</p>
                <Button onClick={handleAddProduct}>
                  <Plus className="h-4 w-4 ml-2" />
                  إضافة منتج الآن
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {products.map((product) => (
                  <div key={product.id} className="border rounded-lg p-4 space-y-3">
                    <div className="h-32 bg-gray-100 rounded-md overflow-hidden">
                      {product.image_urls && product.image_urls.length > 0 ? (
                        <img 
                          src={product.image_urls[0]} 
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-8 w-8 text-gray-300" />
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <h3 className="font-semibold text-sm mb-1">{product.name}</h3>
                      <p className="text-xs text-gray-500 line-clamp-2">{product.description}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-bold text-sm">{product.price} ج.م</span>
                        <Badge variant="outline" className="text-xs">
                          الكمية: {product.quantity}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditProduct(product)}
                        className="flex-1"
                      >
                        <Edit className="h-3 w-3 ml-1" />
                        تعديل
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteProduct(product)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}