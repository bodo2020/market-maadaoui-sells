
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { Product } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { fetchMainCategories, fetchSubcategories, fetchSubsubcategories } from "@/services/supabase/categoryService";

interface ProductAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSaved: () => void;
  type: 'category' | 'company';
}

export default function ProductAssignmentDialog({
  open,
  onOpenChange,
  product,
  onSaved,
  type
}: ProductAssignmentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [mainCategories, setMainCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [subsubcategories, setSubsubcategories] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedMainCategory, setSelectedMainCategory] = useState<string>("");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("");
  const [selectedSubsubcategory, setSelectedSubsubcategory] = useState<string>("");
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  
  useEffect(() => {
    if (open) {
      loadInitialData();
    }
  }, [open, product]);
  
  const loadInitialData = async () => {
    setLoading(true);
    try {
      if (type === 'category') {
        // Fetch main categories
        const mainCategoriesData = await fetchMainCategories();
        setMainCategories(mainCategoriesData);
        
        // Set initial values from product
        if (product) {
          if (product.main_category_id) {
            setSelectedMainCategory(product.main_category_id);
            
            // If there's a main category, load its subcategories
            const subcategoriesData = await fetchSubcategories(product.main_category_id);
            setSubcategories(subcategoriesData);
            
            if (product.subcategory_id) {
              setSelectedSubcategory(product.subcategory_id);
              
              // If there's a subcategory, load its subsubcategories
              const subsubcategoriesData = await fetchSubsubcategories(product.subcategory_id);
              setSubsubcategories(subsubcategoriesData);
              
              if (product.subsubcategory_id) {
                setSelectedSubsubcategory(product.subsubcategory_id);
              }
            }
          }
        }
      } else if (type === 'company') {
        // Fetch companies
        const { data: companiesData, error } = await supabase
          .from('companies')
          .select('*')
          .order('name');
          
        if (error) throw error;
        setCompanies(companiesData);
        
        // Set initial company if product has one
        if (product && product.company_id) {
          setSelectedCompany(product.company_id);
        }
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
      toast.error("حدث خطأ أثناء تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };
  
  const handleMainCategoryChange = async (value: string) => {
    setSelectedMainCategory(value);
    setSelectedSubcategory("");
    setSelectedSubsubcategory("");
    setSubcategories([]);
    setSubsubcategories([]);
    
    if (value) {
      try {
        const subcategoriesData = await fetchSubcategories(value);
        setSubcategories(subcategoriesData);
      } catch (error) {
        console.error('Error fetching subcategories:', error);
        toast.error("حدث خطأ أثناء تحميل الأقسام الفرعية");
      }
    }
  };
  
  const handleSubcategoryChange = async (value: string) => {
    setSelectedSubcategory(value);
    setSelectedSubsubcategory("");
    setSubsubcategories([]);
    
    if (value) {
      try {
        const subsubcategoriesData = await fetchSubsubcategories(value);
        setSubsubcategories(subsubcategoriesData);
      } catch (error) {
        console.error('Error fetching subsubcategories:', error);
        toast.error("حدث خطأ أثناء تحميل الفئات");
      }
    }
  };
  
  const handleSave = async () => {
    if (!product) return;
    
    setLoading(true);
    try {
      if (type === 'category') {
        const updateData: Record<string, any> = {
          main_category_id: selectedMainCategory || null,
          subcategory_id: selectedSubcategory || null,
          subsubcategory_id: selectedSubsubcategory || null
        };
        
        const { error } = await supabase
          .from('products')
          .update(updateData)
          .eq('id', product.id);
          
        if (error) throw error;
        
        toast.success("تم تحديث تصنيف المنتج بنجاح");
      } else if (type === 'company') {
        const { error } = await supabase
          .from('products')
          .update({ company_id: selectedCompany || null })
          .eq('id', product.id);
          
        if (error) throw error;
        
        toast.success("تم تحديث شركة المنتج بنجاح");
      }
      
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating product:', error);
      toast.error("حدث خطأ أثناء تحديث المنتج");
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {type === 'category' ? 'تعيين تصنيف للمنتج' : 'تعيين شركة للمنتج'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          
          {!loading && type === 'category' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  القسم الرئيسي
                </label>
                <Select
                  value={selectedMainCategory}
                  onValueChange={handleMainCategoryChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر القسم الرئيسي" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">بدون قسم</SelectItem>
                    {mainCategories.map(category => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {selectedMainCategory && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    القسم الفرعي
                  </label>
                  <Select
                    value={selectedSubcategory}
                    onValueChange={handleSubcategoryChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر القسم الفرعي" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">بدون قسم فرعي</SelectItem>
                      {subcategories.map(subcategory => (
                        <SelectItem key={subcategory.id} value={subcategory.id}>
                          {subcategory.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {selectedSubcategory && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    الفئة
                  </label>
                  <Select
                    value={selectedSubsubcategory}
                    onValueChange={setSelectedSubsubcategory}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الفئة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">بدون فئة</SelectItem>
                      {subsubcategories.map(subsubcategory => (
                        <SelectItem key={subsubcategory.id} value={subsubcategory.id}>
                          {subsubcategory.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          
          {!loading && type === 'company' && (
            <div>
              <label className="block text-sm font-medium mb-1">
                الشركة
              </label>
              <Select
                value={selectedCompany}
                onValueChange={setSelectedCompany}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر الشركة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">بدون شركة</SelectItem>
                  {companies.map(company => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
