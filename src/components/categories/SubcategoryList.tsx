import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit, FolderPlus, Package, ShoppingCart, ArrowUpDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import AddSubcategoryDialog from "./AddSubcategoryDialog";
import EditSubcategoryDialog from "./EditSubcategoryDialog";
import AssignProductsToSubcategoryDialog from "./AssignProductsToSubcategoryDialog";
import SubcategoryOrderManager from "./SubcategoryOrderManager";
import { fetchSubcategories, deleteSubcategory } from "@/services/supabase/categoryService";
import { 
  fetchProductsBySubcategory, 
  getProductsWithoutSubcategoryCount 
} from "@/services/supabase/productService";
import { Subcategory } from "@/types";
import { toast } from "sonner";

export default function SubcategoryList() {
  const { id: categoryId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [subcategories, setSubcategories] = useState<(Subcategory & { product_count?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isOrderManagerOpen, setIsOrderManagerOpen] = useState(false);
  const [selectedSubcategory, setSelectedSubcategory] = useState<Subcategory | null>(null);
  const [selectedAssignSubcategory, setSelectedAssignSubcategory] = useState<{
    id: string;
    name: string;
    category_id: string;
  } | null>(null);
  const [productsWithoutSubcategoryCount, setProductsWithoutSubcategoryCount] = useState(0);

  useEffect(() => {
    if (categoryId) {
      loadSubcategories();
    }
  }, [categoryId]);

  const loadSubcategories = async () => {
    try {
      setLoading(true);
      const data = await fetchSubcategories(categoryId);
      
      // Load products without subcategory count
      const withoutSubcategoryCount = await getProductsWithoutSubcategoryCount();
      setProductsWithoutSubcategoryCount(withoutSubcategoryCount);
      
      if (!data || data.length === 0) {
        setSubcategories([]);
        return;
      }
      
      const subcategoriesWithCount = await Promise.all(
        data.map(async (subcategory) => {
          try {
            const products = await fetchProductsBySubcategory(subcategory.id);
            return {
              ...subcategory,
              product_count: products ? products.length : 0
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
      console.error("Error loading subcategories:", error);
      toast.error("حدث خطأ أثناء تحميل الأقسام الفرعية");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (subcategory: Subcategory) => {
    setSelectedSubcategory(subcategory);
    setIsEditDialogOpen(true);
  };

  const handleDelete = async (subcategory: Subcategory) => {
    try {
      await deleteSubcategory(subcategory.id);
      toast.success("تم حذف القسم الفرعي بنجاح");
      loadSubcategories();
    } catch (error) {
      console.error("Error deleting subcategory:", error);
      toast.error("حدث خطأ أثناء حذف القسم الفرعي");
    }
  };

  const handleAssignProducts = (subcategory: Subcategory) => {
    setSelectedAssignSubcategory({
      id: subcategory.id,
      name: subcategory.name,
      category_id: subcategory.category_id
    });
    setIsAssignDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">الأقسام الفرعية</h2>
          {productsWithoutSubcategoryCount > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="flex items-center gap-1">
                <ShoppingCart className="h-3 w-3" />
                {productsWithoutSubcategoryCount} منتج بدون قسم فرعي
              </Badge>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsOrderManagerOpen(true)}>
            <ArrowUpDown className="h-4 w-4 ml-2" />
            ترتيب الأقسام الفرعية
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-4 w-4 ml-2" />
            إضافة قسم فرعي
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">جاري التحميل...</div>
      ) : (
        <ScrollArea className="h-[500px]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subcategories.length > 0 ? subcategories.map((subcategory) => (
              <div 
                key={subcategory.id} 
                className="border rounded-lg overflow-hidden hover:border-primary transition-colors cursor-pointer"
                onClick={() => navigate(`/subcategory/${subcategory.id}`)}
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
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(subcategory);
                      }}
                    >
                      <Edit className="h-4 w-4 ml-1" />
                      تعديل
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAssignProducts(subcategory);
                      }}
                      disabled={productsWithoutSubcategoryCount === 0}
                    >
                      <Plus className="h-4 w-4 ml-1" />
                      إضافة منتجات
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(subcategory);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )) : (
              <div className="col-span-3 text-center p-8 bg-gray-50 rounded-lg border">
                <FolderPlus className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium">لا توجد أقسام فرعية</h3>
                <p className="text-gray-500 mb-4">يمكنك إضافة أقسام فرعية جديدة من خلال الزر أعلاه</p>
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {categoryId && (
        <AddSubcategoryDialog
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          categoryId={categoryId}
          onSuccess={loadSubcategories}
        />
      )}

      <EditSubcategoryDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        subcategory={selectedSubcategory}
        onSuccess={loadSubcategories}
      />

      {selectedAssignSubcategory && (
        <AssignProductsToSubcategoryDialog
          open={isAssignDialogOpen}
          onOpenChange={setIsAssignDialogOpen}
          subcategory={selectedAssignSubcategory}
          onSuccess={loadSubcategories}
        />
      )}

      {categoryId && (
        <SubcategoryOrderManager
          open={isOrderManagerOpen}
          onOpenChange={setIsOrderManagerOpen}
          categoryId={categoryId}
          onSuccess={loadSubcategories}
        />
      )}
    </div>
  );
}
