
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, FolderPlus, Trash, Edit, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { fetchMainCategories, deleteMainCategory } from "@/services/supabase/categoryService";
import { MainCategory } from "@/types";
import { fetchProductsByCategory } from "@/services/supabase/productService";
import AddMainCategoryDialog from "./AddMainCategoryDialog";

export default function MainCategoryList() {
  const [categories, setCategories] = useState<(MainCategory & { product_count?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const navigate = useNavigate();
  
  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      console.log("Fetching main categories...");
      const data = await fetchMainCategories();
      console.log("Main categories data:", data);
      
      if (!data || data.length === 0) {
        console.log("No categories found");
        setCategories([]);
        setLoading(false);
        return;
      }
      
      const categoriesWithCount = await Promise.all(
        data.map(async (category) => {
          try {
            const products = await fetchProductsByCategory(category.id);
            return {
              ...category,
              product_count: products ? products.length : 0
            };
          } catch (error) {
            console.error(`Error fetching products for category ${category.id}:`, error);
            return {
              ...category,
              product_count: 0
            };
          }
        })
      );
      
      setCategories(categoriesWithCount);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error("حدث خطأ أثناء تحميل الأقسام");
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (categoryId: string) => {
    try {
      await deleteMainCategory(categoryId);
      toast.success("تم حذف القسم بنجاح");
      await fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error("حدث خطأ أثناء حذف القسم");
    }
  };

  const navigateToCategory = (category: MainCategory) => {
    navigate(`/categories/${category.id}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">
          الأقسام الرئيسية
        </h2>
        <Button onClick={() => setShowAddDialog(true)}>
          <FolderPlus className="h-4 w-4 ml-2" />
          إضافة قسم جديد
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {categories && categories.length > 0 ? categories.map((category) => (
          <div 
            key={category.id} 
            className="border rounded-lg overflow-hidden hover:border-primary transition-colors cursor-pointer"
            onClick={() => navigateToCategory(category)}
          >
            <div className="h-40 bg-gray-100 relative">
              {category.image_url ? (
                <img 
                  src={category.image_url} 
                  alt={category.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <FolderPlus className="h-16 w-16 text-gray-300" />
                </div>
              )}
              <Badge variant="outline" className="absolute top-2 right-2 bg-white">
                قسم رئيسي
              </Badge>
              
              <Badge variant="secondary" className="absolute top-2 left-2 flex items-center gap-1 bg-white">
                <Package className="h-3 w-3" />
                {category.product_count || 0} منتج
              </Badge>
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-lg mb-1">{category.name}</h3>
              {category.description && (
                <p className="text-gray-500 text-sm line-clamp-2">{category.description}</p>
              )}
              <div className="flex justify-between items-center mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigateToCategory(category);
                  }}
                >
                  <Edit className="h-4 w-4 ml-1" />
                  تعديل
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(category.id);
                  }}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )) : (
          <div className="col-span-3 text-center p-8 bg-gray-50 rounded-lg border">
            <FolderPlus className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium">لا توجد أقسام رئيسية</h3>
            <p className="text-gray-500 mb-4">يمكنك إضافة أقسام جديدة من خلال الزر أعلاه</p>
          </div>
        )}
      </div>

      {categories.length === 0 && (
        <div className="text-center p-8 bg-gray-50 rounded-lg border">
          <FolderPlus className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium">لا توجد أقسام رئيسية</h3>
          <p className="text-gray-500 mb-4">يمكنك إضافة أقسام جديدة من خلال الزر أعلاه</p>
        </div>
      )}

      <AddMainCategoryDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={fetchCategories}
      />
    </div>
  );
}
