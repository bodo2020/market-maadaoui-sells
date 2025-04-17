
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, ArrowLeft, FolderPlus, Trash, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import AddCategoryDialog from "./AddCategoryDialog";

interface Category {
  id: string;
  name: string;
  description: string | null;
  level: 'category' | 'subcategory' | 'subsubcategory';
  parent_id: string | null;
  image_url?: string | null;
  children?: Category[];
}

export default function CategoryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [category, setCategory] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [subcategories, setSubcategories] = useState<Category[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);

  useEffect(() => {
    fetchCategory();
  }, [id]);

  const fetchCategory = async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      
      // Fetch the category
      const { data: categoryData, error: categoryError } = await supabase
        .from('categories')
        .select('*')
        .eq('id', id)
        .single();

      if (categoryError) throw categoryError;
      
      // Set category data
      const categoryWithType = {
        ...categoryData,
        level: categoryData.level as 'category' | 'subcategory' | 'subsubcategory'
      };
      
      setCategory(categoryWithType);
      setName(categoryWithType.name);
      setDescription(categoryWithType.description || "");
      setImagePreview(categoryWithType.image_url || null);
      
      // Fetch subcategories if this is a category or subcategory
      if (categoryWithType.level !== 'subsubcategory') {
        const { data: subData, error: subError } = await supabase
          .from('categories')
          .select('*')
          .eq('parent_id', id)
          .order('name');
          
        if (subError) throw subError;
        
        setSubcategories(subData.map(sub => ({
          ...sub,
          level: sub.level as 'category' | 'subcategory' | 'subsubcategory'
        })));
      }
      
    } catch (error) {
      console.error('Error fetching category:', error);
      toast.error("حدث خطأ أثناء تحميل بيانات التصنيف");
      navigate('/categories');
    } finally {
      setLoading(false);
    }
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

  const handleSave = async () => {
    if (!id || !category) return;
    
    try {
      setSaving(true);
      
      let image_url = category.image_url;
      if (imageFile) {
        image_url = await uploadImage(imageFile);
      }
      
      const { error } = await supabase
        .from('categories')
        .update({
          name,
          description: description || null,
          image_url
        })
        .eq('id', id);
        
      if (error) throw error;
      
      toast.success("تم حفظ التغييرات بنجاح");
      fetchCategory(); // Refresh data
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error("حدث خطأ أثناء حفظ التغييرات");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubcategory = async (subcategoryId: string) => {
    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', subcategoryId);

      if (error) throw error;
      
      toast.success("تم حذف التصنيف الفرعي بنجاح");
      fetchCategory(); // Refresh data
    } catch (error) {
      console.error('Error deleting subcategory:', error);
      toast.error("حدث خطأ أثناء حذف التصنيف الفرعي");
    }
  };

  const getLevelLabel = (level: Category['level']) => {
    const labels = {
      category: 'تصنيف رئيسي',
      subcategory: 'تصنيف فرعي',
      subsubcategory: 'تصنيف فرعي ثانوي'
    };
    return labels[level];
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
      <div className="flex items-center mb-6">
        <Button 
          variant="ghost" 
          className="ml-2" 
          onClick={() => navigate('/categories')}
        >
          <ArrowLeft className="h-4 w-4 ml-1" />
          العودة للتصنيفات
        </Button>
        <h1 className="text-2xl font-bold">{category?.name}</h1>
        <Badge variant="outline" className="mr-2">
          {category ? getLevelLabel(category.level) : ''}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>تفاصيل التصنيف</CardTitle>
            <CardDescription>تعديل بيانات التصنيف</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                rows={4}
              />
            </div>
            <div>
              <Label htmlFor="image">صورة التصنيف</Label>
              <div className="mt-2 mb-4">
                {imagePreview ? (
                  <div className="relative w-full h-48 rounded-md overflow-hidden border">
                    <img
                      src={imagePreview}
                      alt={name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-full h-48 flex items-center justify-center bg-gray-100 rounded-md border">
                    <FolderPlus className="h-16 w-16 text-gray-300" />
                  </div>
                )}
              </div>
              <Input
                id="image"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              type="button" 
              className="w-full" 
              onClick={handleSave}
              disabled={saving}
            >
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
          </CardFooter>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>التصنيفات الفرعية</CardTitle>
              <CardDescription>
                إدارة التصنيفات الفرعية ضمن {category?.name}
              </CardDescription>
            </div>
            {category && category.level !== 'subsubcategory' && (
              <Button onClick={() => setShowAddDialog(true)}>
                <FolderPlus className="h-4 w-4 ml-2" />
                إضافة تصنيف فرعي
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {subcategories.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {subcategories.map((sub) => (
                  <div 
                    key={sub.id} 
                    className="border rounded-lg overflow-hidden hover:border-primary transition-colors"
                  >
                    <div className="h-24 bg-gray-100 relative">
                      {sub.image_url ? (
                        <img 
                          src={sub.image_url} 
                          alt={sub.name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FolderPlus className="h-10 w-10 text-gray-300" />
                        </div>
                      )}
                      <Badge variant="outline" className="absolute top-2 right-2 bg-white">
                        {getLevelLabel(sub.level)}
                      </Badge>
                    </div>
                    <div className="p-3">
                      <h3 className="font-semibold mb-1">{sub.name}</h3>
                      <div className="flex justify-end gap-2 mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/categories/${sub.id}`)}
                        >
                          <Edit className="h-4 w-4 ml-1" />
                          تعديل
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteSubcategory(sub.id)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-8 bg-gray-50 rounded-lg border">
                <FolderPlus className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium">لا توجد تصنيفات فرعية</h3>
                {category && category.level !== 'subsubcategory' ? (
                  <p className="text-gray-500 mb-4">يمكنك إضافة تصنيفات فرعية من خلال الزر أعلاه</p>
                ) : (
                  <p className="text-gray-500 mb-4">لا يمكن إضافة تصنيفات فرعية للمستوى الثالث</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {category && (
        <AddCategoryDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          parentCategory={category}
          onSuccess={fetchCategory}
        />
      )}
    </div>
  );
}
