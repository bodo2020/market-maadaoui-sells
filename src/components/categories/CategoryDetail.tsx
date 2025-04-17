import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, ArrowLeft, FolderPlus, Trash, Edit, Package, Plus } from "lucide-react";
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
import CategoriesList from "./CategoriesList";
import ProductsGrid from "./ProductsGrid";
import AddProductsToSubcategoryDialog from "./AddProductsToSubcategoryDialog";

interface Category {
  id: string;
  name: string;
  description: string | null;
  level: 'category' | 'subcategory' | 'subsubcategory';
  parent_id: string | null;
  image_url?: string | null;
  children?: Category[];
  product_count?: number;
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
  const [productCount, setProductCount] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAddProductsDialog, setShowAddProductsDialog] = useState(false);

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  useEffect(() => {
    fetchCategory();
  }, [id]);

  useEffect(() => {
    if (category) {
      fetchProducts();
    }
  }, [category]);

  const fetchCategory = async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      
      const { data: categoryData, error: categoryError } = await supabase
        .from('categories')
        .select('*')
        .eq('id', id)
        .single();

      if (categoryError) throw categoryError;
      
      const categoryWithType = {
        ...categoryData,
        level: categoryData.level as 'category' | 'subcategory' | 'subsubcategory'
      };
      
      setCategory(categoryWithType);
      setName(categoryWithType.name);
      setDescription(categoryWithType.description || "");
      setImagePreview(categoryWithType.image_url || null);
      
      const { count, error: countError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq(
          categoryWithType.level === 'category' 
            ? 'category_id' 
            : categoryWithType.level === 'subcategory' 
              ? 'subcategory_id' 
              : 'subsubcategory_id', 
          id
        );
        
      if (!countError) {
        setProductCount(count || 0);
      }
      
    } catch (error) {
      console.error('Error fetching category:', error);
      toast.error("حدث خطأ أثناء تحميل بيانات التصنيف");
      navigate('/categories');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    if (!category) return;
    
    try {
      setLoadingProducts(true);
      let query = supabase.from('products').select('*');
      
      if (category.level === 'category') {
        query = query.eq('category_id', id);
      } else if (category.level === 'subcategory') {
        query = query.eq('subcategory_id', id);
      } else if (category.level === 'subsubcategory') {
        query = query.eq('subsubcategory_id', id);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error("حدث خطأ أثناء تحميل المنتجات");
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
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
      fetchCategory();
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error("حدث خطأ أثناء حفظ التغييرات");
    } finally {
      setSaving(false);
    }
  };

  const getLevelLabel = (level: Category['level']) => {
    const labels = {
      category: 'قسم رئيسي',
      subcategory: 'قسم فرعي',
      subsubcategory: 'فئة'
    };
    return labels[level];
  };

  const handleAddProductClick = () => {
    navigate(`/add-product?${category.level}_id=${id}`);
  };

  const handleAddProductsClick = () => {
    setShowAddProductsDialog(true);
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
          العودة للأقسام
        </Button>
        <h1 className="text-2xl font-bold">{category?.name}</h1>
        <Badge variant="outline" className="mr-2">
          {category ? getLevelLabel(category.level) : ''}
        </Badge>
        <Badge variant="secondary" className="mr-2 flex items-center gap-1">
          <Package className="h-3 w-3" />
          {productCount} منتج
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>تفاصيل {getLevelLabel(category?.level || 'category')}</CardTitle>
            <CardDescription>تعديل بيانات {category?.name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                rows={4}
              />
            </div>
            <div>
              <Label htmlFor="image">الصورة</Label>
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
          <CardHeader>
            <CardTitle>
              {category?.level === 'category' ? 'الأقسام الفرعية' : 
               category?.level === 'subcategory' ? 'الفئات' : 
               'المنتجات'}
            </CardTitle>
            <CardDescription>
              {category?.level === 'subsubcategory' ? 
                `المنتجات ضمن فئة ${category?.name}` : 
                `إدارة ${category?.level === 'category' ? 'الأقسام الفرعية' : 'الفئات'} ضمن ${category?.name}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {category?.level !== 'subsubcategory' ? (
              <CategoriesList />
            ) : (
              <div className="text-center p-8 bg-gray-50 rounded-lg border">
                <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium">
                  {productCount > 0 ? `يوجد ${productCount} منتج في هذه الفئة` : 'لا توجد منتجات في هذه الفئة'}
                </h3>
                <p className="text-gray-500 mb-4">يمكنك إضافة منتجات جديدة من صفحة المنتجات</p>
                <Button onClick={() => navigate('/products')}>
                  الذهاب إلى صفحة المنتجات
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>المنتجات</CardTitle>
              <CardDescription>
                {`المنتجات في ${category?.name || ''}`}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddProductsClick}>
                <Plus className="ml-2 h-4 w-4" />
                إضافة منتجات
              </Button>
              <Button onClick={handleAddProductClick}>
                <Package className="ml-2 h-4 w-4" />
                إضافة منتج جديد
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingProducts ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <ProductsGrid products={products} onRefresh={fetchProducts} />
          )}
        </CardContent>
      </Card>

      {category && category.level !== 'subsubcategory' && (
        <AddCategoryDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          parentCategory={category}
          onSuccess={fetchCategory}
        />
      )}

      {category && (
        <AddProductsToSubcategoryDialog
          open={showAddProductsDialog}
          onOpenChange={setShowAddProductsDialog}
          categoryId={category.id}
          onSuccess={fetchProducts}
          products={products}
        />
      )}
    </div>
  );
}
