import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload } from "lucide-react";

interface Category {
  id: string;
  name: string;
  description: string | null;
  level: 'category' | 'subcategory' | 'subsubcategory';
  parent_id: string | null;
  image_url?: string | null;
}

interface AddCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentCategory: Category | null;
  onSuccess: () => void;
}

const AddCategoryDialog = ({
  open,
  onOpenChange,
  parentCategory,
  onSuccess
}: AddCategoryDialogProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const getLevel = (): Category['level'] => {
    if (!parentCategory) return 'category';
    if (parentCategory.level === 'category') return 'subcategory';
    return 'subsubcategory';
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      // Create image preview
      const reader = new FileReader();
      reader.onload = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (file: File) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `categories/${fileName}`;

    const { data, error } = await supabase.storage
      .from('images')
      .upload(filePath, file);

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('images')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);

      let image_url = null;
      if (imageFile) {
        image_url = await uploadImage(imageFile);
      }

      const newCategory = {
        name,
        description: description || null,
        level: getLevel(),
        parent_id: parentCategory?.id || null,
        image_url
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
      setImageFile(null);
      setImagePreview(null);
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
            <Label htmlFor="image">صورة التصنيف (اختياري)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="image"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="flex-1"
              />
              {imagePreview && (
                <div className="w-12 h-12 rounded overflow-hidden border">
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
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

export default AddCategoryDialog;
