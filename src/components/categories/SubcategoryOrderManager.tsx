import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Save, X } from "lucide-react";
import { Subcategory } from "@/types";
import { fetchSubcategories, reorderSubcategories } from "@/services/supabase/categoryService";
import { toast } from "sonner";

interface SubcategoryOrderManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  onSuccess?: () => void;
}

export default function SubcategoryOrderManager({ 
  open, 
  onOpenChange, 
  categoryId, 
  onSuccess 
}: SubcategoryOrderManagerProps) {
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && categoryId) {
      loadSubcategories();
    }
  }, [open, categoryId]);

  const loadSubcategories = async () => {
    try {
      setLoading(true);
      const data = await fetchSubcategories(categoryId);
      setSubcategories(data || []);
    } catch (error) {
      console.error("Error loading subcategories:", error);
      toast.error("حدث خطأ أثناء تحميل الأقسام الفرعية");
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;

    const items = Array.from(subcategories);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update positions
    const updatedSubcategories = items.map((subcategory, index) => ({
      ...subcategory,
      position: index
    }));

    setSubcategories(updatedSubcategories);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      const subcategoryPositions = subcategories.map((subcategory, index) => ({
        id: subcategory.id,
        position: index
      }));

      await reorderSubcategories(subcategoryPositions);
      toast.success("تم حفظ ترتيب الأقسام الفرعية بنجاح");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving subcategory order:", error);
      toast.error("حدث خطأ أثناء حفظ ترتيب الأقسام الفرعية");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>ترتيب الأقسام الفرعية</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-gray-600">اسحب وأفلت الأقسام الفرعية لترتيبها كما تريد</p>
        </CardHeader>
        <CardContent className="overflow-y-auto">
          {loading ? (
            <div className="text-center py-8">جاري التحميل...</div>
          ) : subcategories.length === 0 ? (
            <div className="text-center py-8 text-gray-500">لا توجد أقسام فرعية للترتيب</div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="subcategories">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                    {subcategories.map((subcategory, index) => (
                      <Draggable key={subcategory.id} draggableId={subcategory.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`p-4 border rounded-lg bg-white transition-shadow ${
                              snapshot.isDragging ? "shadow-lg" : "shadow-sm"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div {...provided.dragHandleProps}>
                                <GripVertical className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                              </div>
                              
                              <div className="h-12 w-12 bg-gray-100 rounded-md overflow-hidden flex-shrink-0">
                                {subcategory.image_url ? (
                                  <img 
                                    src={subcategory.image_url} 
                                    alt={subcategory.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gray-200" />
                                )}
                              </div>
                              
                              <div className="flex-1">
                                <h3 className="font-medium">{subcategory.name}</h3>
                                {subcategory.description && (
                                  <p className="text-sm text-gray-500 line-clamp-1">{subcategory.description}</p>
                                )}
                              </div>
                              
                              <Badge variant="outline">المرتبة {index + 1}</Badge>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
          
          <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saving || loading || subcategories.length === 0}
            >
              <Save className="h-4 w-4 ml-2" />
              {saving ? "جاري الحفظ..." : "حفظ الترتيب"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}