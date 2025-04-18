
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Save, FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { 
  fetchMainCategoryById,
  fetchSubcategoryById,
  fetchSubsubcategoryById,
  updateMainCategory,
  updateSubcategory,
  updateSubsubcategory
} from "@/services/supabase/categoryService";

export default function CategoryDetail() {
  const { id, subId } = useParams<{ id: string; subId: string }>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  // Determine which level we're dealing with
  const getCategoryLevel = () => {
    if (subId) return 'subsubcategory';
    if (id) return 'subcategory';
    return 'category';
  };
  
  useEffect(() => {
    if (!id) return;
    
    const fetchCategoryDetails = async () => {
      try {
        setLoading(true);
        
        if (subId) {
          // Fetch subsubcategory
          const subsubcategory = await fetchSubsubcategoryById(subId);
          setName(subsubcategory.name);
          setDescription(subsubcategory.description || "");
          setImageUrl(subsubcategory.image_url);
        } else if (id) {
          // Check if it's a subcategory
          try {
            const subcategory = await fetchSubcategoryById(id);
            setName(subcategory.name);
            setDescription(subcategory.description || "");
            setImageUrl(subcategory.image_url);
          } catch (error) {
            // If not a subcategory, try as main category
            const mainCategory = await fetchMainCategoryById(id);
            setName(mainCategory.name);
            setDescription(mainCategory.description || "");
            setImageUrl(mainCategory.image_url);
          }
        }
      } catch (error) {
        console.error('Error fetching category details:', error);
        toast.error("حدث خطأ أثناء تحميل بيانات القسم");
      } finally {
        setLoading(false);
      }
    };
    
    fetchCategoryDetails();
  }, [id, subId]);
  
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

    try {
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };
  
  const handleSave = async () => {
    if (!name) {
      toast.error("الاسم مطلوب");
      return;
    }
    
    try {
      setSaving(true);
      
      let updatedImageUrl = imageUrl;
      if (imageFile) {
        updatedImageUrl = await uploadImage(imageFile);
      }
      
      const updatedData = {
        name,
        description: description || null,
        image_url: updatedImageUrl
      };
      
      if (subId) {
        // Update subsubcategory
        await updateSubsubcategory(subId, updatedData);
      } else if (id) {
        try {
          // Try to update as subcategory
          await updateSubcategory(id, updatedData);
        } catch (error) {
          // If not a subcategory, update as main category
          await updateMainCategory(id, updatedData);
        }
      }
      
      toast.success("تم حفظ التغييرات بنجاح");
      setImageFile(null);
      setImagePreview(null);
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error("حدث خطأ أثناء حفظ التغييرات");
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <div className="mt-8 p-6 border rounded-lg bg-card">
      <h2 className="text-xl font-semibold mb-6">تعديل القسم</h2>
      
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">الاسم</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="أدخل اسم القسم"
          />
        </div>
        
        <div>
          <Label htmlFor="description">الوصف (اختياري)</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="أدخل وصف القسم"
          />
        </div>
        
        <div>
          <Label htmlFor="image">الصورة (اختياري)</Label>
          <div className="flex items-start gap-4 mt-2">
            <div className="flex-1">
              <Input
                id="image"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
              />
            </div>
            <div className="h-24 w-24 rounded-md overflow-hidden border flex items-center justify-center bg-gray-50">
              {(imagePreview || imageUrl) ? (
                <img 
                  src={imagePreview || imageUrl || ""} 
                  alt={name} 
                  className="h-full w-full object-cover"
                />
              ) : (
                <FileImage className="h-12 w-12 text-gray-300" />
              )}
            </div>
          </div>
        </div>
        
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                جاري الحفظ...
              </>
            ) : (
              <>
                <Save className="ml-2 h-4 w-4" />
                حفظ التغييرات
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
