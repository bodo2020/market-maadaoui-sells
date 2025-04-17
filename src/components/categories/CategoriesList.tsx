import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ChevronRight, FolderPlus, Trash, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
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
  const [selectedParent, setSelectedParent] = useState<Category | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');

      if (error) throw error;

      // Map database response to Category type
      const dbCategories = data as CategoryFromDB[];
      
      // Safely map level to our enum type
      const typedCategories: Category[] = dbCategories.map(cat => ({
        ...cat,
        level: isValidLevel(cat.level) ? cat.level as 'category' | 'subcategory' | 'subsubcategory' : 'category',
        children: [],
      }));

      // Organize categories into a hierarchy
      const mainCategories = typedCategories.filter(cat => cat.level === 'category');
      const subcategories = typedCategories.filter(cat => cat.level === 'subcategory');
      const subsubcategories = typedCategories.filter(cat => cat.level === 'subsubcategory');

      // Add subcategories to their parent categories
      mainCategories.forEach(cat => {
        cat.children = subcategories.filter(sub => sub.parent_id === cat.id);
        cat.children.forEach(sub => {
          sub.children = subsubcategories.filter(subsub => subsub.parent_id === sub.id);
        });
      });

      setCategories(mainCategories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error("حدث خطأ أثناء تحميل التصنيفات");
    } finally {
      setLoading(false);
    }
  };

  // Helper function to validate level values
  const isValidLevel = (level: string): boolean => {
    return ['category', 'subcategory', 'subsubcategory'].includes(level);
  };

  const getLevelLabel = (level: Category['level']) => {
    const labels = {
      category: 'تصنيف رئيسي',
      subcategory: 'تصنيف فرعي',
      subsubcategory: 'تصنيف فرعي ثانوي'
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
          {selectedParent ? `${selectedParent.name} > التصنيفات الفرعية` : 'التصنيفات'}
        </h2>
        <Button onClick={() => setShowAddDialog(true)}>
          <FolderPlus className="h-4 w-4 ml-2" />
          إضافة تصنيف جديد
        </Button>
      </div>

      {selectedParent && (
        <Button 
          variant="ghost" 
          className="mb-4"
          onClick={() => setSelectedParent(null)}
        >
          العودة للتصنيفات الرئيسية
        </Button>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {(selectedParent ? selectedParent.children || [] : categories).map((category) => (
          <div 
            key={category.id} 
            className="border rounded-lg overflow-hidden hover:border-primary transition-colors cursor-pointer"
            onClick={() => {
              if (category.level !== 'subsubcategory' && category.children && category.children.length > 0) {
                setSelectedParent(category);
              } else {
                navigateToCategory(category);
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

      {/* Fallback table view for when there are no cards */}
      {(selectedParent ? selectedParent.children?.length === 0 : categories.length === 0) && (
        <div className="text-center p-8 bg-gray-50 rounded-lg border">
          <FolderPlus className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium">لا توجد تصنيفات</h3>
          <p className="text-gray-500 mb-4">يمكنك إضافة تصنيفات جديدة من خلال الزر أعلاه</p>
        </div>
      )}

      <AddCategoryDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        parentCategory={selectedParent}
        onSuccess={fetchCategories}
      />
    </div>
  );
}
