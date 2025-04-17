
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Product } from "@/types";
import { updateProduct } from "@/services/supabase/productService";
import { supabase } from "@/integrations/supabase/client";

interface ProductAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSaved: () => void;
  type: "category" | "company";
}

export default function ProductAssignmentDialog({
  open,
  onOpenChange,
  product,
  onSaved,
  type
}: ProductAssignmentDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    if (open && product) {
      setIsLoading(true);
      
      // Set the initial selected value based on product data
      if (type === "category") {
        setSelectedId(product.category_id || "");
      } else if (type === "company") {
        setSelectedId(product.company_id || "");
      }
      
      // Load options from database
      const fetchOptions = async () => {
        try {
          if (type === "category") {
            const { data, error } = await supabase
              .from("categories")
              .select("id, name")
              .eq("level", "category")
              .order("name");
            
            if (error) throw error;
            setOptions(data || []);
          } else if (type === "company") {
            const { data, error } = await supabase
              .from("companies")
              .select("id, name")
              .order("name");
            
            if (error) throw error;
            setOptions(data || []);
          }
        } catch (error) {
          console.error(`Error loading ${type === "category" ? "categories" : "companies"}:`, error);
          toast.error(`حدث خطأ أثناء تحميل ${type === "category" ? "الأقسام" : "الشركات"}`);
        } finally {
          setIsLoading(false);
        }
      };
      
      fetchOptions();
    }
  }, [open, product, type]);
  
  const handleSave = async () => {
    if (!product) return;
    
    setIsSaving(true);
    try {
      const updateData = type === "category" 
        ? { category_id: selectedId || null } 
        : { company_id: selectedId || null };
      
      await updateProduct(product.id, updateData);
      
      toast.success(`تم تحديث ${type === "category" ? "القسم" : "الشركة"} بنجاح`);
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error(`Error updating product ${type}:`, error);
      toast.error(`حدث خطأ أثناء تعديل ${type === "category" ? "القسم" : "الشركة"}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {type === "category" ? "تعديل القسم" : "تعديل الشركة المصنعة"}
          </DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="py-4">
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder={type === "category" ? "اختر القسم" : "اختر الشركة"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">
                  {type === "category" ? "بدون قسم" : "بدون شركة"}
                </SelectItem>
                {options.map(option => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
