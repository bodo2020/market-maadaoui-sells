
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ChevronRight, FolderPlus, Trash } from "lucide-react";
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
import AddCategoryDialog from "./AddCategoryDialog";

interface Category {
  id: string;
  name: string;
  description: string | null;
  level: 'category' | 'subcategory' | 'subsubcategory';
  parent_id: string | null;
  children?: Category[];
}

// Type for the raw database response
interface CategoryFromDB {
  id: string;
  name: string;
  description: string | null;
  level: string;
  parent_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export default function CategoriesList() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedParent, setSelectedParent] = useState<Category | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

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
        id: cat.id,
        name: cat.name,
        description: cat.description,
        // Cast level to our union type, defaulting to 'category' if invalid
        level: isValidLevel(cat.level) ? cat.level as 'category' | 'subcategory' | 'subsubcategory' : 'category',
        parent_id: cat.parent_id,
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>الاسم</TableHead>
            <TableHead>المستوى</TableHead>
            <TableHead>الوصف</TableHead>
            <TableHead>الإجراءات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(selectedParent ? selectedParent.children || [] : categories).map((category) => (
            <TableRow key={category.id}>
              <TableCell>{category.name}</TableCell>
              <TableCell>
                <Badge variant="outline">{getLevelLabel(category.level)}</Badge>
              </TableCell>
              <TableCell>{category.description || '-'}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  {category.level !== 'subsubcategory' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedParent(category)}
                    >
                      عرض الفرعية
                      <ChevronRight className="h-4 w-4 mr-2" />
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(category.id)}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {(selectedParent ? selectedParent.children?.length === 0 : categories.length === 0) && (
            <TableRow>
              <TableCell colSpan={4} className="text-center">
                لا توجد تصنيفات مسجلة
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <AddCategoryDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        parentCategory={selectedParent}
        onSuccess={fetchCategories}
      />
    </div>
  );
}
