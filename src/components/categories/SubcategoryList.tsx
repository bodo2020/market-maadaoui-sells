
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, FolderPlus, Trash, Edit, Package, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { fetchSubcategories, deleteSubcategory, fetchMainCategoryById } from "@/services/supabase/categoryService";
import { Subcategory, MainCategory } from "@/types";
import { fetchProductsBySubcategory } from "@/services/supabase/productService";
import AddSubcategoryDialog from "./AddSubcategoryDialog";

interface SubcategoryListProps {
  categoryId: string;
}

export default function SubcategoryList({ categoryId }: SubcategoryListProps) {
  const [subcategories, setSubcategories] = useState<(Subcategory & { product_count?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [parentCategory, setParentCategory] = useState<MainCategory | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const navigate = useNavigate();
  
  useEffect(() => {
    if (categoryId) {
      fetchSubcategories();
      fetchParentCategory();
    }
  }, [categoryId]);

  const fetchParentCategory = async () => {
    try {
      const category = await fetchMainCategoryById(categoryId);
      setParentCategory(category);
    } catch (error) {
      console.error('Error fetching parent category:', error);
      toast.error("حدث خطأ أثناء تحميل القسم الرئيسي");
    }
  };

  const fetchSubcategories = async () => {
    try {
      setLoading(true);
      const data = await fetchSubcategories(categoryId);
      
      const subcategoriesWithCount = await Promise.all(
        data.map(async (subcategory) => {
          try {
            const products = await fetchProductsBySubcategory(subcategory.id);
            return {
              ...subcategory,
              product_count: products.length
            };
          } catch (error) {
            console.error(`Error fetching products for subcategory ${subcategory.id}:`, error);
            return {
              ...subcategory,
              product_count: 0
            };
          }
        })
      );
      
      setSubcategories(subcategoriesWithCount);
    } catch (error) {
      console.error('Error fetching subcategories:', error);
      toast.error("حدث خطأ أثناء تحميل الأقسام الفرعية");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (subcategoryId: string) => {
    try {
      await deleteSubcategory(subcategoryId);
      toast.success("تم حذف القسم الفرعي بنجاح");
      await fetchSubcategories();
    } catch (error) {
      console.error('Error deleting subcategory:', error);
      toast.error("حدث خطأ أثناء حذف القسم الفرعي");
    }
  };

  const navigateToSubcategory = (subcategory: Subcategory) => {
    navigate(`/subcategories/${subcategory.id}`);
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
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">
            الأقسام الفرعية {parentCategory && `- ${parentCategory.name}`}
          </h2>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <FolderPlus className="h-4 w-4 ml-2" />
          إضافة قسم فرعي
        </Button>
      </div>

      <Button 
        variant="ghost" 
        className="mb-4"
        onClick={() => navigate('/categories')}
      >
        <ArrowLeft className="h-4 w-4 ml-1" />
        العودة للأقسام الرئيسية
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {subcategories.map((subcategory) => (
          <div 
            key={subcategory.id} 
            className="border rounded-lg overflow-hidden hover:border-primary transition-colors cursor-pointer"
            onClick={() => navigateToSubcategory(subcategory)}
          >
            <div className="h-40 bg-gray-100 relative">
              {subcategory.image_url ? (
                <img 
                  src={subcategory.image_url} 
                  alt={subcategory.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <FolderPlus className="h-16 w-16 text-gray-300" />
                </div>
              )}
              <Badge variant="outline" className="absolute top-2 right-2 bg-white">
                قسم فرعي
              </Badge>
              
              <Badge variant="secondary" className="absolute top-2 left-2 flex items-center gap-1 bg-white">
                <Package className="h-3 w-3" />
                {subcategory.product_count || 0} منتج
              </Badge>
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-lg mb-1">{subcategory.name}</h3>
              {subcategory.description && (
                <p className="text-gray-500 text-sm line-clamp-2">{subcategory.description}</p>
              )}
              <div className="flex justify-between items-center mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigateToSubcategory(subcategory);
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
                    handleDelete(subcategory.id);
                  }}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {subcategories.length === 0 && (
        <div className="text-center p-8 bg-gray-50 rounded-lg border">
          <FolderPlus className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium">لا توجد أقسام فرعية</h3>
          <p className="text-gray-500 mb-4">يمكنك إضافة أقسام فرعية جديدة من خلال الزر أعلاه</p>
        </div>
      )}

      <AddSubcategoryDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        categoryId={categoryId}
        onSuccess={fetchSubcategories}
      />
    </div>
  );
}
