
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { Product, MainCategory, Subcategory } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface ProductAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSaved: () => void;
  type: 'category' | 'company';
}

const ProductAssignmentDialog = ({
  open,
  onOpenChange,
  product,
  onSaved,
  type
}: ProductAssignmentDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<MainCategory[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryLevel, setSelectedCategoryLevel] = useState<'category' | 'subcategory'>('category');

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true);
        
        // Fetch main categories
        const { data: mainCategories, error: mainError } = await supabase
          .from('main_categories')
          .select('*')
          .order('name');
        
        if (mainError) throw mainError;
        setCategories(mainCategories || []);
        
        // If a category is already assigned, select it
        if (product?.main_category_id) {
          setSelectedId(product.main_category_id);
          setSelectedCategoryLevel('category');
          
          // Fetch subcategories for the selected category
          const { data: subcategoriesData, error: subcategoriesError } = await supabase
            .from('subcategories')
            .select('*')
            .eq('category_id', product.main_category_id)
            .order('name');
          
          if (subcategoriesError) throw subcategoriesError;
          setSubcategories(subcategoriesData || []);
          
          // If a subcategory is already assigned, select it
          if (product?.subcategory_id) {
            setSelectedId(product.subcategory_id);
            setSelectedCategoryLevel('subcategory');
          } else {
            setSubcategories([]);
          }
        } else {
          setSubcategories([]);
        }
      } catch (error) {
        console.error('Error fetching categories:', error);
        toast.error('حدث خطأ أثناء تحميل الأقسام');
      } finally {
        setLoading(false);
      }
    };
    
    if (type === 'category') {
      fetchCategories();
    }
  }, [open, product, type]);

  const updateProductCategory = async () => {
    try {
      setLoading(true);
      
      // Prepare update data
      const updateData: any = {};
      
      if (type === 'category') {
        // Determine category levels
        if (selectedCategoryLevel === 'category') {
          updateData.main_category_id = selectedId;
          updateData.subcategory_id = null;
        } else if (selectedCategoryLevel === 'subcategory') {
          updateData.subcategory_id = selectedId;
          // Find parent category
          const { data } = await supabase
            .from('subcategories')
            .select('category_id')
            .eq('id', selectedId)
            .single();
          updateData.main_category_id = data?.category_id;
        }
      } else if (type === 'company') {
        updateData.company_id = selectedId;
      }
      
      // Update the product
      await supabase
        .from('products')
        .update(updateData)
        .eq('id', product?.id);
      
      toast.success(`تم تحديث ${type === 'category' ? 'قسم' : 'شركة'} المنتج بنجاح`);
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating product:', error);
      toast.error(`حدث خطأ أثناء تحديث ${type === 'category' ? 'قسم' : 'شركة'} المنتج`);
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySelection = async (categoryId: string) => {
    setSelectedId(categoryId);
    
    if (selectedCategoryLevel === 'category') {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('subcategories')
          .select('*')
          .eq('category_id', categoryId)
          .order('name');
          
        if (error) throw error;
        setSubcategories(data || []);
      } catch (error) {
        console.error('Error fetching subcategories:', error);
        toast.error('حدث خطأ أثناء تحميل الأقسام الفرعية');
      } finally {
        setLoading(false);
      }
    }
  };

  const filteredCategories = categories.filter(category =>
    category.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSubcategories = subcategories.filter(subcategory =>
    subcategory.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            تغيير {type === 'category' ? 'القسم' : 'الشركة'}
          </DialogTitle>
          <DialogDescription>
            اختر {type === 'category' ? 'القسم' : 'الشركة'} الذي تريد تعيينه لهذا المنتج.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="search" className="text-right">
              بحث
            </Label>
            <Input
              id="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="col-span-3"
            />
          </div>
          
          {type === 'category' && (
            <RadioGroup 
              defaultValue={selectedCategoryLevel} 
              onValueChange={(value: 'category' | 'subcategory') => setSelectedCategoryLevel(value)} 
              className="pb-4"
            >
              <div className="flex items-center space-x-2 space-x-reverse justify-end">
                <Label htmlFor="category">قسم رئيسي</Label>
                <RadioGroupItem value="category" id="category" />
              </div>
              <div className="flex items-center space-x-2 space-x-reverse justify-end">
                <Label htmlFor="subcategory">قسم فرعي</Label>
                <RadioGroupItem value="subcategory" id="subcategory" />
              </div>
            </RadioGroup>
          )}

          {type === 'category' && selectedCategoryLevel === 'category' && (
            <div className="space-y-2">
              <Label>الأقسام الرئيسية</Label>
              <div className="max-h-40 overflow-y-auto border rounded-md">
                {loading ? (
                  <div className="flex justify-center items-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : filteredCategories.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    لا توجد أقسام رئيسية مطابقة للبحث
                  </div>
                ) : (
                  <ul className="divide-y">
                    {filteredCategories.map(category => (
                      <li
                        key={category.id}
                        className={`p-2 cursor-pointer hover:bg-accent ${selectedId === category.id ? 'bg-accent text-accent-foreground' : ''}`}
                        onClick={() => handleCategorySelection(category.id)}
                      >
                        {category.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {type === 'category' && selectedCategoryLevel === 'subcategory' && (
            <div className="space-y-2">
              <Label>الأقسام الفرعية</Label>
              <div className="max-h-40 overflow-y-auto border rounded-md">
                {loading ? (
                  <div className="flex justify-center items-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : filteredSubcategories.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    لا توجد أقسام فرعية مطابقة للبحث
                  </div>
                ) : (
                  <ul className="divide-y">
                    {filteredSubcategories.map(subcategory => (
                      <li
                        key={subcategory.id}
                        className={`p-2 cursor-pointer hover:bg-accent ${selectedId === subcategory.id ? 'bg-accent text-accent-foreground' : ''}`}
                        onClick={() => setSelectedId(subcategory.id)}
                      >
                        {subcategory.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={updateProductCategory} disabled={loading}>
            {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProductAssignmentDialog;
