
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
        
        const { data: mainCategories, error: mainError } = await supabase
          .from('main_categories')
          .select('*')
          .order('name');
        
        if (mainError) throw mainError;
        setCategories(mainCategories || []);
        
        if (product?.main_category_id) {
          setSelectedId(product.main_category_id);
          setSelectedCategoryLevel('category');
          
          const { data: subcategoriesData, error: subcategoriesError } = await supabase
            .from('subcategories')
            .select('*')
            .eq('category_id', product.main_category_id)
            .order('name');
          
          if (subcategoriesError) throw subcategoriesError;
          setSubcategories(subcategoriesData || []);
          
          if (product?.subcategory_id) {
            setSelectedId(product.subcategory_id);
            setSelectedCategoryLevel('subcategory');
          }
        }
      } catch (error) {
        console.error('Error fetching categories:', error);
        toast.error('حدث خطأ أثناء تحميل الأقسام');
      } finally {
        setLoading(false);
      }
    };
    
    if (type === 'category' && open) {
      fetchCategories();
    }
  }, [open, product, type]);

  const updateProductCategory = async () => {
    try {
      setLoading(true);
      
      const updateData: any = {};
      
      if (type === 'category') {
        if (selectedCategoryLevel === 'category') {
          updateData.main_category_id = selectedId;
          updateData.subcategory_id = null;
        } else if (selectedCategoryLevel === 'subcategory') {
          const subcategory = subcategories.find(sub => sub.id === selectedId);
          if (subcategory) {
            updateData.main_category_id = subcategory.category_id;
            updateData.subcategory_id = selectedId;
          }
        }
      } else if (type === 'company') {
        updateData.company_id = selectedId;
      }
      
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

  // ... بقية الكود كما هو (الدوال handleCategorySelection وغيرها)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        {/* محتوى الحوار كما هو */}
      </DialogContent>
    </Dialog>
  );
};

export default ProductAssignmentDialog;
