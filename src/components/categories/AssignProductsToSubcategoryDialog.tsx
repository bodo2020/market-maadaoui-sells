import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, Plus, Minus } from "lucide-react";
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

  const availableProducts = allProducts.filter(product => 
    !selectedProducts.find(selected => selected.id === product.id) &&
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSelectedProducts = selectedProducts.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAdd = (product: Product) => {
    setSelectedProducts([...selectedProducts, product]);
  };

  const handleRemove = (product: Product) => {
    setSelectedProducts(selectedProducts.filter(p => p.id !== product.id));
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
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>
            إضافة منتجات للقسم الفرعي: {subcategory.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Selected Products */}
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge variant="default">{filteredSelectedProducts.length}</Badge>
                  المنتجات المحددة
                </h3>
                <div className="border rounded-lg max-h-96 overflow-y-auto">
                  <div className="p-4 space-y-2">
                    {filteredSelectedProducts.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between p-3 border rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          {product.image_urls && product.image_urls.length > 0 && (
                            <img
                              src={product.image_urls[0]}
                              alt={product.name}
                              className="w-10 h-10 rounded object-cover"
                            />
                          )}
                          <div>
                            <div className="font-medium">{product.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {product.price} ج.م
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemove(product)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {filteredSelectedProducts.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        لم يتم تحديد أي منتجات
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Available Products */}
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge variant="outline">{availableProducts.length}</Badge>
                  المنتجات المتاحة
                </h3>
                <div className="border rounded-lg max-h-96 overflow-y-auto">
                  <div className="p-4 space-y-2">
                    {availableProducts.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {product.image_urls && product.image_urls.length > 0 && (
                            <img
                              src={product.image_urls[0]}
                              alt={product.name}
                              className="w-10 h-10 rounded object-cover"
                            />
                          )}
                          <div>
                            <div className="font-medium">{product.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {product.price} ج.م
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAdd(product)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {availableProducts.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        {allProducts.length === 0 ? 
                          "لا توجد منتجات بدون أقسام فرعية" : 
                          "لا توجد نتائج للبحث"
                        }
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t pt-4">
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