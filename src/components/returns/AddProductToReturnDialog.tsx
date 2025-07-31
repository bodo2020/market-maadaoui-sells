import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Barcode, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchProductByBarcode } from "@/services/supabase/productService";

interface AddProductToReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProductAdded: (product: any, quantity: number) => void;
}

export function AddProductToReturnDialog({
  open,
  onOpenChange,
  onProductAdded
}: AddProductToReturnDialogProps) {
  const [barcode, setBarcode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [foundProduct, setFoundProduct] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleBarcodeSearch = async () => {
    if (!barcode.trim()) {
      toast.error("الرجاء إدخال الباركود");
      return;
    }

    try {
      setIsSearching(true);
      const product = await fetchProductByBarcode(barcode.trim());
      
      if (product) {
        setFoundProduct(product);
        toast.success("تم العثور على المنتج");
      } else {
        toast.error("لم يتم العثور على منتج بهذا الباركود");
        setFoundProduct(null);
      }
    } catch (error) {
      console.error("Error searching for product:", error);
      toast.error("حدث خطأ أثناء البحث عن المنتج");
      setFoundProduct(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddProduct = () => {
    if (!foundProduct) {
      toast.error("الرجاء البحث عن منتج أولاً");
      return;
    }

    if (quantity <= 0) {
      toast.error("الرجاء إدخال كمية صحيحة");
      return;
    }

    onProductAdded(foundProduct, quantity);
    
    // Reset form
    setBarcode("");
    setQuantity(1);
    setFoundProduct(null);
    onOpenChange(false);
    
    toast.success("تم إضافة المنتج للمرتجع");
  };

  const handleDialogClose = () => {
    setBarcode("");
    setQuantity(1);
    setFoundProduct(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Barcode className="h-5 w-5" />
            إضافة منتج بالباركود
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 dir-rtl">
          <div className="space-y-2">
            <label className="text-sm font-medium">الباركود</label>
            <div className="flex gap-2">
              <Input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="ادخل الباركود أو امسحه"
                onKeyPress={(e) => e.key === 'Enter' && handleBarcodeSearch()}
              />
              <Button 
                onClick={handleBarcodeSearch}
                disabled={isSearching}
                size="sm"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {foundProduct && (
            <div className="border rounded-lg p-3 bg-muted/50">
              <h4 className="font-medium">{foundProduct.name}</h4>
              <p className="text-sm text-muted-foreground">
                السعر: {foundProduct.price} ج.م
              </p>
              <p className="text-sm text-muted-foreground">
                المخزون المتاح: {foundProduct.quantity}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">الكمية المرتجعة</label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              disabled={!foundProduct}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleDialogClose}>
              إلغاء
            </Button>
            <Button 
              onClick={handleAddProduct}
              disabled={!foundProduct || quantity <= 0}
            >
              إضافة للمرتجع
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}