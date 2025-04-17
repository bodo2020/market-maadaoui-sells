
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Product } from "@/types";
import { Search, Plus, X, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { updateProduct } from "@/services/supabase/productService";
import { toast } from "sonner";

interface AddProductsToSubcategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  onSuccess?: () => void;
  products: Product[];
}

export default function AddProductsToSubcategoryDialog({
  open,
  onOpenChange,
  categoryId,
  onSuccess,
  products
}: AddProductsToSubcategoryDialogProps) {
  const [searchSelected, setSearchSelected] = useState("");
  const [searchAvailable, setSearchAvailable] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Product[]>(
    products.filter(p => p.subsubcategory_id === categoryId)
  );
  const [saving, setSaving] = useState(false);

  const availableProducts = products.filter(p => 
    !selectedProducts.find(sp => sp.id === p.id) &&
    p.name.toLowerCase().includes(searchAvailable.toLowerCase())
  );

  const filteredSelectedProducts = selectedProducts.filter(p =>
    p.name.toLowerCase().includes(searchSelected.toLowerCase())
  );

  const handleAdd = (product: Product) => {
    setSelectedProducts([...selectedProducts, product]);
  };

  const handleRemove = (product: Product) => {
    setSelectedProducts(selectedProducts.filter(p => p.id !== product.id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update products with new subsubcategory_id
      await Promise.all([
        // Add subsubcategory_id to selected products
        ...selectedProducts.map(product =>
          updateProduct(product.id, { subsubcategory_id: categoryId })
        ),
        // Remove subsubcategory_id from unselected products
        ...products
          .filter(p => 
            p.subsubcategory_id === categoryId && 
            !selectedProducts.find(sp => sp.id === p.id)
          )
          .map(product =>
            updateProduct(product.id, { subsubcategory_id: null })
          )
      ]);

      toast.success("تم حفظ المنتجات بنجاح");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving products:", error);
      toast.error("حدث خطأ أثناء حفظ المنتجات");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>حدد المنتجات</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6">
          {/* Selected Products */}
          <div>
            <h3 className="font-medium mb-2">المنتجات المختارة</h3>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث عن المنتجات"
                  className="pl-10"
                  value={searchSelected}
                  onChange={e => setSearchSelected(e.target.value)}
                />
              </div>
              <ScrollArea className="h-[400px] border rounded-md">
                <div className="p-4 space-y-2">
                  {filteredSelectedProducts.map(product => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between p-2 border rounded hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 bg-muted rounded overflow-hidden">
                          <img
                            src={product.image_urls?.[0] || "/placeholder.svg"}
                            alt={product.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div>
                          <div className="font-medium">{product.name}</div>
                          <Badge variant="outline" className="mt-1">
                            {product.quantity} في المخزون
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(product)}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Available Products */}
          <div>
            <h3 className="font-medium mb-2">المنتجات المتبقية</h3>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث عن المنتجات"
                  className="pl-10"
                  value={searchAvailable}
                  onChange={e => setSearchAvailable(e.target.value)}
                />
              </div>
              <ScrollArea className="h-[400px] border rounded-md">
                <div className="p-4 space-y-2">
                  {availableProducts.map(product => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between p-2 border rounded hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 bg-muted rounded overflow-hidden">
                          <img
                            src={product.image_urls?.[0] || "/placeholder.svg"}
                            alt={product.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div>
                          <div className="font-medium">{product.name}</div>
                          <Badge variant="outline" className="mt-1">
                            {product.quantity} في المخزون
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleAdd(product)}
                      >
                        <Plus className="h-4 w-4 text-primary" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "جاري الحفظ..." : "احفظ"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
