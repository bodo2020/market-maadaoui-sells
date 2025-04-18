
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, FolderPlus, Trash, Edit, Package, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { fetchSubsubcategories, deleteSubsubcategory, fetchSubcategoryById } from "@/services/supabase/categoryService";
import { Subsubcategory, Subcategory } from "@/types";
import { fetchProductsBySubsubcategory } from "@/services/supabase/productService";
import AddSubsubcategoryDialog from "./AddSubsubcategoryDialog";

interface SubsubcategoriesListProps {
  subcategoryId: string;
}

export default function SubsubcategoriesList({ subcategoryId }: SubsubcategoriesListProps) {
  const [subsubcategories, setSubsubcategories] = useState<(Subsubcategory & { product_count?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [parentSubcategory, setParentSubcategory] = useState<Subcategory | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const navigate = useNavigate();
  
  useEffect(() => {
    if (subcategoryId) {
      fetchSubsubcategoriesList();
      fetchParentSubcategory();
    }
  }, [subcategoryId]);

  const fetchParentSubcategory = async () => {
    try {
      const subcategory = await fetchSubcategoryById(subcategoryId);
      setParentSubcategory(subcategory);
    } catch (error) {
      console.error('Error fetching parent subcategory:', error);
      toast.error("حدث خطأ أثناء تحميل القسم الفرعي");
    }
  };

  const fetchSubsubcategoriesList = async () => {
    try {
      setLoading(true);
      const data = await fetchSubsubcategories(subcategoryId);
      
      const subsubcategoriesWithCount = await Promise.all(
        data.map(async (subsubcategory) => {
          try {
            const products = await fetchProductsBySubsubcategory(subsubcategory.id);
            return {
              ...subsubcategory,
              product_count: products.length
            };
          } catch (error) {
            console.error(`Error fetching products for subsubcategory ${subsubcategory.id}:`, error);
            return {
              ...subsubcategory,
              product_count: 0
            };
          }
        })
      );
      
      setSubsubcategories(subsubcategoriesWithCount);
    } catch (error) {
      console.error('Error fetching subsubcategories:', error);
      toast.error("حدث خطأ أثناء تحميل الفئات");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (subsubcategoryId: string) => {
    try {
      await deleteSubsubcategory(subsubcategoryId);
      toast.success("تم حذف الفئة بنجاح");
      await fetchSubsubcategoriesList();
    } catch (error) {
      console.error('Error deleting subsubcategory:', error);
      toast.error("حدث خطأ أثناء حذف الفئة");
    }
  };

  const navigateToSubsubcategory = (subsubcategory: Subsubcategory) => {
    navigate(`/subsubcategories/${subsubcategory.id}`);
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
            الفئات {parentSubcategory && `- ${parentSubcategory.name}`}
          </h2>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <FolderPlus className="h-4 w-4 ml-2" />
          إضافة فئة جديدة
        </Button>
      </div>

      <Button 
        variant="ghost" 
        className="mb-4"
        onClick={() => navigate(`/categories/${parentSubcategory?.category_id}`)}
      >
        <ArrowLeft className="h-4 w-4 ml-1" />
        العودة للأقسام الفرعية
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {subsubcategories.map((subsubcategory) => (
          <div 
            key={subsubcategory.id} 
            className="border rounded-lg overflow-hidden hover:border-primary transition-colors cursor-pointer"
            onClick={() => navigateToSubsubcategory(subsubcategory)}
          >
            <div className="h-40 bg-gray-100 relative">
              {subsubcategory.image_url ? (
                <img 
                  src={subsubcategory.image_url} 
                  alt={subsubcategory.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <FolderPlus className="h-16 w-16 text-gray-300" />
                </div>
              )}
              <Badge variant="outline" className="absolute top-2 right-2 bg-white">
                فئة
              </Badge>
              
              <Badge variant="secondary" className="absolute top-2 left-2 flex items-center gap-1 bg-white">
                <Package className="h-3 w-3" />
                {subsubcategory.product_count || 0} منتج
              </Badge>
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-lg mb-1">{subsubcategory.name}</h3>
              {subsubcategory.description && (
                <p className="text-gray-500 text-sm line-clamp-2">{subsubcategory.description}</p>
              )}
              <div className="flex justify-between items-center mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigateToSubsubcategory(subsubcategory);
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
                    handleDelete(subsubcategory.id);
                  }}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {subsubcategories.length === 0 && (
        <div className="text-center p-8 bg-gray-50 rounded-lg border">
          <FolderPlus className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium">لا توجد فئات</h3>
          <p className="text-gray-500 mb-4">يمكنك إضافة فئات جديدة من خلال الزر أعلاه</p>
        </div>
      )}

      <AddSubsubcategoryDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        subcategoryId={subcategoryId}
        onSuccess={fetchSubsubcategoriesList}
      />
    </div>
  );
}
