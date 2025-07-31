import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrderItem } from "@/types";
import { Edit, Scale } from "lucide-react";
import { toast } from "sonner";

interface EditProductInOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: OrderItem | null;
  onProductUpdated: (productId: string, updates: Partial<OrderItem>) => void;
}

export function EditProductInOrderDialog({
  open,
  onOpenChange,
  product,
  onProductUpdated
}: EditProductInOrderDialogProps) {
  const [quantity, setQuantity] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (product) {
      setQuantity(product.quantity.toString());
      setPrice(product.price.toString());
    }
  }, [product]);

  if (!product) return null;

  const handleSubmit = async () => {
    const numQuantity = parseFloat(quantity);
    const numPrice = parseFloat(price);

    if (isNaN(numQuantity) || numQuantity <= 0) {
      toast.error("يرجى إدخال كمية صحيحة");
      return;
    }

    if (isNaN(numPrice) || numPrice <= 0) {
      toast.error("يرجى إدخال سعر صحيح");
      return;
    }

    try {
      setIsSubmitting(true);
      
      const updates: Partial<OrderItem> = {
        quantity: numQuantity,
        price: numPrice,
        total: numQuantity * numPrice
      };

      onProductUpdated(product.product_id, updates);
      toast.success("تم تحديث المنتج بنجاح");
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating product:", error);
      toast.error("حدث خطأ أثناء تحديث المنتج");
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateTotal = () => {
    const numQuantity = parseFloat(quantity) || 0;
    const numPrice = parseFloat(price) || 0;
    return (numQuantity * numPrice).toFixed(2);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            تعديل المنتج في الطلب
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 dir-rtl">
          <div className="text-center space-y-2 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium">{product.product_name}</h3>
            {product.is_weight_based && (
              <div className="flex items-center justify-center gap-1 text-blue-600">
                <Scale className="h-4 w-4" />
                <span className="text-sm">منتج معتمد على الوزن</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">
                {product.is_weight_based ? "الوزن (كجم)" : "الكمية"}
              </Label>
              <Input
                id="quantity"
                type="number"
                step={product.is_weight_based ? "0.01" : "1"}
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={product.is_weight_based ? "0.00" : "0"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">السعر (ج.م)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="font-medium">المجموع:</span>
              <span className="text-lg font-bold text-blue-600">
                {calculateTotal()} ج.م
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "جاري التحديث..." : "حفظ التغييرات"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}