
import { useState, useEffect } from "react";
import { fetchProductsBySubsubcategory } from "@/services/supabase/productService";
import { Product } from "@/types";
import ProductGrid from "@/components/products/ProductGrid";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";

interface SubsubcategoryProductsProps {
  subsubcategoryId: string;
}

const SubsubcategoryProducts = ({ subsubcategoryId }: SubsubcategoryProductsProps) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoading(true);
        const productsData = await fetchProductsBySubsubcategory(subsubcategoryId);
        setProducts(productsData);
      } catch (error) {
        console.error("Error loading subsubcategory products:", error);
      } finally {
        setLoading(false);
      }
    };

    if (subsubcategoryId) {
      loadProducts();
    }
  }, [subsubcategoryId]);

  const handleAddProduct = () => {
    navigate("/products/add");
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="mr-2">جاري تحميل المنتجات...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">منتجات الفئة</h2>
        <Button onClick={handleAddProduct}>
          <Plus className="h-4 w-4 ml-2" />
          إضافة منتج
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-md">
          <p className="text-gray-500">لا توجد منتجات في هذه الفئة</p>
          <Button variant="outline" className="mt-4" onClick={handleAddProduct}>
            إضافة منتج الآن
          </Button>
        </div>
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  );
};

export default SubsubcategoryProducts;
