
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface Category {
  id: string;
  name: string;
  description: string | null;
  level: 'category' | 'subcategory' | 'subsubcategory';
  parent_id: string | null;
}

interface AddCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentCategory: Category | null;
  onSuccess: () => void;
}

export default function AddCategoryDialog({
  open,
  onOpenChange,
  parentCategory,
  onSuccess
}: AddCategoryDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const getLevel = (): Category['level'] => {
    if (!parentCategory) return 'category';
    if (parentCategory.level === 'category') return 'subcategory';
    return 'subsubcategory';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);

      const newCategory = {
        name,
        description: description || null,
        level: getLevel(),
        parent_id: parentCategory?.id || null
      };

      const { error } = await supabase
        .from('categories')
        .insert([newCategory]);

      if (error) throw error;

      toast.success("تم إضافة التصنيف بنجاح");
      onSuccess();
      onOpenChange(false);
      setName("");
      setDescription("");
    } catch (error) {
      console.error('Error adding category:', error);
      toast.error("حدث خطأ أثناء إضافة التصنيف");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة تصنيف جديد</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">اسم التصنيف</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="أدخل اسم التصنيف"
              required
            />
          </div>
          <div>
            <Label htmlFor="description">الوصف (اختياري)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="أدخل وصف التصنيف"
            />
          </div>
          <div>
            <Label>المستوى</Label>
            <Input
              value={
                getLevel() === 'category'
                  ? 'تصنيف رئيسي'
                  : getLevel() === 'subcategory'
                  ? 'تصنيف فرعي'
                  : 'تصنيف فرعي ثانوي'
              }
              disabled
              className="bg-muted"
            />
          </div>
          {parentCategory && (
            <div>
              <Label>التصنيف الأب</Label>
              <Input
                value={parentCategory.name}
                disabled
                className="bg-muted"
              />
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الإضافة...
                </>
              ) : (
                "إضافة"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
