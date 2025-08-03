import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Edit } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import AddSubcategoryDialog from "./AddSubcategoryDialog";
import EditSubcategoryDialog from "./EditSubcategoryDialog";
import { fetchSubcategories, deleteSubcategory } from "@/services/supabase/categoryService";
import { Subcategory } from "@/types";
import { toast } from "sonner";
import AddProductsToSubcategoryDialog from "./AddProductsToSubcategoryDialog";

export default function SubcategoryList() {
  const { id: categoryId } = useParams<{ id: string }>();
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedSubcategory, setSelectedSubcategory] = useState<Subcategory | null>(null);
  const [isProductsDialogOpen, setIsProductsDialogOpen] = useState(false);

  useEffect(() => {
    if (categoryId) {
      loadSubcategories();
    }
  }, [categoryId]);

  const loadSubcategories = async () => {
    try {
      setLoading(true);
      const data = await fetchSubcategories(categoryId);
      setSubcategories(data);
    } catch (error) {
      console.error("Error loading subcategories:", error);
      toast.error("حدث خطأ أثناء تحميل الأقسام الفرعية");
    } finally {
      setLoading(false);
    }
  };

  const handleAddProducts = (subcategory: Subcategory) => {
    setSelectedSubcategory(subcategory);
    setIsProductsDialogOpen(true);
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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">الأقسام الفرعية</h2>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="h-4 w-4 ml-2" />
          إضافة قسم فرعي
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8">جاري التحميل...</div>
      ) : (
        <ScrollArea className="h-[500px]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subcategories.map((subcategory) => (
              <Card key={subcategory.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    {subcategory.image_url && (
                      <img 
                        src={subcategory.image_url} 
                        alt={subcategory.name}
                        className="w-12 h-12 object-cover rounded-md"
                      />
                    )}
                    <CardTitle className="text-lg">{subcategory.name}</CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleAddProducts(subcategory)}
                    >
                      <Plus className="h-4 w-4 ml-2" />
                      إضافة منتجات
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(subcategory)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(subcategory)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{subcategory.description}</p>
                </CardContent>
              </Card>
            ))}
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

      {selectedSubcategory && (
        <AddProductsToSubcategoryDialog
          open={isProductsDialogOpen}
          onOpenChange={setIsProductsDialogOpen}
          categoryId={categoryId}
          subcategoryId={selectedSubcategory.id}
          onSuccess={loadSubcategories}
        />
      )}
    </div>
  );
}
