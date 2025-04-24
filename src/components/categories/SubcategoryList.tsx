import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import AddSubcategoryDialog from "./AddSubcategoryDialog";
import { fetchSubcategories } from "@/services/supabase/categoryService";
import { Subcategory } from "@/types";
import { toast } from "sonner";
import AddProductsToSubcategoryDialog from "./AddProductsToSubcategoryDialog";
import { navigate } from "react-router-dom";

export default function SubcategoryList() {
  const { id: categoryId } = useParams<{ id: string }>();
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
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
              <Card 
                key={subcategory.id}
                className="cursor-pointer hover:shadow-md transition-all"
                onClick={() => navigate(`/subcategories/${subcategory.id}`)}
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg">{subcategory.name}</CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddProducts(subcategory);
                    }}
                  >
                    <Plus className="h-4 w-4 ml-2" />
                    إضافة منتجات
                  </Button>
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
