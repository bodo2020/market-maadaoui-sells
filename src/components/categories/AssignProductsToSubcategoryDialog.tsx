import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Product } from "@/types";
import { 
  fetchProductsWithoutSubcategory, 
  assignProductsToSubcategory 
} from "@/services/supabase/productService";

interface AssignProductsToSubcategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subcategory: {
    id: string;
    name: string;
    category_id: string;
  };
  onSuccess?: () => void;
}

const AssignProductsToSubcategoryDialog = ({
  open,
  onOpenChange,
  subcategory,
  onSuccess
}: AssignProductsToSubcategoryDialogProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedProducts([]);
      loadProducts();
    }
  }, [open]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const products = await fetchProductsWithoutSubcategory();
      setAllProducts(products);
    } catch (error) {
      console.error("Error loading products:", error);
      toast.error("حدث خطأ أثناء تحميل المنتجات");
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = allProducts.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleProductToggle = (product: Product) => {
    const isSelected = selectedProducts.find(p => p.id === product.id);
    if (isSelected) {
      setSelectedProducts(selectedProducts.filter(p => p.id !== product.id));
    } else {
      setSelectedProducts([...selectedProducts, product]);
    }
  };

  const handleSelectAll = () => {
    if (selectedProducts.length === allProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts([...allProducts]);
    }
  };

  const handleSave = async () => {
    if (selectedProducts.length === 0) {
      toast.error("يرجى اختيار منتج واحد على الأقل");
      return;
    }

    try {
      setSaving(true);
      const productIds = selectedProducts.map(p => p.id);
      
      await assignProductsToSubcategory(
        subcategory.id, 
        subcategory.category_id, 
        productIds
      );

      toast.success(`تم إضافة ${selectedProducts.length} منتج بنجاح`);
      onSuccess?.();
      onOpenChange(false);
      setSelectedProducts([]);
      setSearchTerm("");
    } catch (error) {
      console.error("Error assigning products:", error);
      toast.error("حدث خطأ أثناء إضافة المنتجات");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 p-0 rounded-none">
        <div className="flex flex-col h-full">
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle>
              إضافة منتجات للقسم الفرعي: {subcategory.name}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Search and select all */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="البحث في المنتجات..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              onClick={handleSelectAll}
              disabled={loading || allProducts.length === 0}
            >
              {selectedProducts.length === allProducts.length ? "إلغاء الكل" : "تحديد الكل"}
            </Button>
            <Badge variant="secondary">
              المحددة: {selectedProducts.length}
            </Badge>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="mr-2">جاري تحميل المنتجات...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Badge variant="outline">{filteredProducts.length}</Badge>
                جميع المنتجات المتاحة
              </h3>
              <ScrollArea className="h-[calc(100vh-300px)] border rounded-lg">
                <div className="p-3 space-y-2">
                  {filteredProducts.map((product) => {
                    const isSelected = selectedProducts.find(p => p.id === product.id);
                    return (
                      <div
                        key={product.id}
                        className={`flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer ${
                          isSelected ? 'bg-primary/5 border-primary' : ''
                        }`}
                        onClick={() => handleProductToggle(product)}
                      >
                        <Checkbox
                          checked={!!isSelected}
                          onCheckedChange={() => handleProductToggle(product)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        {product.image_urls && product.image_urls.length > 0 && (
                          <img
                            src={product.image_urls[0]}
                            alt={product.name}
                            className="w-12 h-12 rounded object-cover"
                          />
                        )}
                        <div className="flex-1">
                          <div className="font-medium">{product.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {product.price} ج.م
                            {product.barcode && ` • ${product.barcode}`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      {allProducts.length === 0 ? 
                        "لا توجد منتجات بدون أقسام فرعية" : 
                        "لا توجد نتائج للبحث"
                      }
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 border-t p-4 bg-background">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || selectedProducts.length === 0}
            >
              {saving ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                `حفظ (${selectedProducts.length})`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssignProductsToSubcategoryDialog;