import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { updateSubcategory } from "@/services/supabase/categoryService";
import { DragDropImage } from "@/components/ui/drag-drop-image";
import { Subcategory } from "@/types";

interface EditSubcategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subcategory: Subcategory | null;
  onSuccess: () => void;
}

const EditSubcategoryDialog = ({
  open,
  onOpenChange,
  subcategory,
  onSuccess
}: EditSubcategoryDialogProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (subcategory && open) {
      setName(subcategory.name);
      setDescription(subcategory.description || "");
      setImageUrl(subcategory.image_url || null);
    }
  }, [subcategory, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subcategory) return;
    
    try {
      setLoading(true);

      await updateSubcategory(subcategory.id, {
        name,
        description: description || null,
        image_url: imageUrl
      });

      toast.success("تم تحديث القسم الفرعي بنجاح");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating subcategory:', error);
      toast.error("حدث خطأ أثناء تحديث القسم الفرعي");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            تعديل القسم الفرعي
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="image">الصورة</Label>
              <DragDropImage
                value={imageUrl}
                onChange={setImageUrl}
                bucketName="images"
              />
            </div>

            <div>
              <Label htmlFor="name">الاسم</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="أدخل الاسم"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">الوصف (اختياري)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="أدخل الوصف"
              />
            </div>
          </div>

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
                  جاري التحديث...
                </>
              ) : (
                "تحديث"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default EditSubcategoryDialog;