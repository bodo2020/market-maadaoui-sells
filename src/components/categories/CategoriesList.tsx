import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ChevronRight, FolderPlus, Trash, Edit, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useParams } from "react-router-dom";
import AddCategoryDialog from "./AddCategoryDialog";

interface Category {
  id: string;
  name: string;
  description: string | null;
  level: 'category' | 'subcategory' | 'subsubcategory';
  parent_id: string | null;
  image_url: string | null;
  product_count?: number;
}

// Type for the raw database response
interface CategoryFromDB {
  id: string;
  name: string;
  description: string | null;
  level: string;
  parent_id: string | null;
  image_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export default function CategoriesList() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  
  const parentId = id || null;
  
  useEffect(() => {
    fetchCategories();
  }, [parentId]);

  const getNextLevel = (currentLevel: string | null): 'category' | 'subcategory' | 'subsubcategory' => {
    if (!currentLevel) return 'category';
    if (currentLevel === 'category') return 'subcategory';
    if (currentLevel === 'subcategory') return 'subsubcategory';
    return 'subsubcategory';
  };

  const fetchCategories = async () => {
    try {
      setLoading(true);
      let parentCategory = null;
      let currentLevel = null;
      
      if (parentId) {
        const { data: parent, error: parentError } = await supabase
          .from('categories')
          .select('*')
          .eq('id', parentId)
          .single();
          
        if (parentError) throw parentError;
        parentCategory = parent;
        currentLevel = parent.level;
      }
      
      const levelToFetch = getNextLevel(currentLevel);
      
      let query = supabase
        .from('categories')
        .select('*')
        .order('name');
        
      if (parentId) {
        query = query.eq('parent_id', parentId);
      } else {
        query = query.is('parent_id', null).eq('level', 'category');
      }
        
      const { data, error } = await query;
      
      if (error) throw error;

      const typedCategories: Category[] = (data || []).map(cat => ({
        ...cat,
        level: isValidLevel(cat.level) ? cat.level as 'category' | 'subcategory' | 'subsubcategory' : 'category',
        product_count: 0
      }));
      
      await Promise.all(typedCategories.map(async (category) => {
        const { count, error } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq(
            category.level === 'category' 
              ? 'category_id' 
              : category.level === 'subcategory' 
                ? 'subcategory_id' 
                : 'subsubcategory_id', 
            category.id
          );
          
        if (!error) {
          category.product_count = count || 0;
        }
      }));

      setCategories(typedCategories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error("حدث خطأ أثناء تحم��ل التصنيفات");
    } finally {
      setLoading(false);
    }
  };

  const isValidLevel = (level: string): boolean => {
    return ['category', 'subcategory', 'subsubcategory'].includes(level);
  };

  const getLevelLabel = (level: Category['level']) => {
    const labels = {
      category: 'قسم رئيسي',
      subcategory: 'قسم فرعي',
      subsubcategory: 'فئة'
    };
    return labels[level];
  };

  const handleDelete = async (categoryId: string) => {
    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId);

      if (error) throw error;
      toast.success("تم حذف التصنيف بنجاح");
      await fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error("حدث خطأ أثناء حذف التصنيف");
    }
  };

  const navigateToCategory = (category: Category) => {
    navigate(`/categories/${category.id}`);
  };
  
  const getCurrentLevelTitle = (): string => {
    if (!parentId) return "الأقسام الرئيسية";
    const currentLevel = categories[0]?.level;
    
    if (currentLevel === 'subcategory') return "الأقسام الفرعية";
    if (currentLevel === 'subsubcategory') return "الفئات";
    return "الأقسام";
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
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">
          {getCurrentLevelTitle()}
        </h2>
        <Button onClick={() => setShowAddDialog(true)}>
          <FolderPlus className="h-4 w-4 ml-2" />
          إضافة {parentId ? categories.length > 0 ? getLevelLabel(categories[0].level) : "تصنيف جديد" : "قسم جديد"}
        </Button>
      </div>

      {parentId && (
        <Button 
          variant="ghost" 
          className="mb-4"
          onClick={() => navigate(-1)}
        >
          العودة للخلف
        </Button>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {categories.map((category) => (
          <div 
            key={category.id} 
            className="border rounded-lg overflow-hidden hover:border-primary transition-colors cursor-pointer"
            onClick={() => {
              if (category.level === 'subsubcategory') {
                navigateToCategory(category);
              } else {
                navigate(`/categories/${category.id}`);
              }
            }}
          >
            <div className="h-40 bg-gray-100 relative">
              {category.image_url ? (
                <img 
                  src={category.image_url} 
                  alt={category.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <FolderPlus className="h-16 w-16 text-gray-300" />
                </div>
              )}
              <Badge variant="outline" className="absolute top-2 right-2 bg-white">
                {getLevelLabel(category.level)}
              </Badge>
              
              <Badge variant="secondary" className="absolute top-2 left-2 flex items-center gap-1 bg-white">
                <Package className="h-3 w-3" />
                {category.product_count} منتج
              </Badge>
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-lg mb-1">{category.name}</h3>
              {category.description && (
                <p className="text-gray-500 text-sm line-clamp-2">{category.description}</p>
              )}
              <div className="flex justify-between items-center mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigateToCategory(category);
                  }}
                >
                  <Edit className="h-4 w-4 ml-1" />
                  تعديل
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(category.id);
                  }}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {categories.length === 0 && (
        <div className="text-center p-8 bg-gray-50 rounded-lg border">
          <FolderPlus className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium">لا توجد {getCurrentLevelTitle()}</h3>
          <p className="text-gray-500 mb-4">يمكنك إضافة تصنيفات جديدة من خلال الزر أعلاه</p>
        </div>
      )}

      <AddCategoryDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        parentCategory={parentId ? { 
          id: parentId, 
          name: "", 
          level: getNextLevel(null) as any 
        } : null}
        onSuccess={fetchCategories}
      />
    </div>
  );
}
