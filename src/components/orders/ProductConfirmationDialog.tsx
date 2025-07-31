import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OrderItem } from "@/types";
import { Check, AlertTriangle, Scale, Box } from "lucide-react";
import { toast } from "sonner";

interface ProductConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: OrderItem | null;
  onConfirm: (productId: string) => void;
}

export function ProductConfirmationDialog({
  open,
  onOpenChange,
  product,
  onConfirm
}: ProductConfirmationDialogProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (!product) return null;

  const handleConfirm = async () => {
    try {
      setIsConfirming(true);
      onConfirm(product.product_id);
      toast.success("تم تأكيد المنتج بنجاح");
      onOpenChange(false);
    } catch (error) {
      console.error("Error confirming product:", error);
      toast.error("حدث خطأ أثناء تأكيد المنتج");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تأكيد المنتج</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 dir-rtl">
          <div className="border rounded-lg p-4 space-y-3">
            {product.image_url && (
              <div className="w-20 h-20 rounded-md overflow-hidden mx-auto">
                <img 
                  src={product.image_url} 
                  alt={product.product_name} 
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            
            <div className="text-center space-y-2">
              <h3 className="font-semibold text-lg">{product.product_name}</h3>
              
              <div className="flex justify-center gap-2">
                {product.is_bulk && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                    <Box className="h-3 w-3 ml-1" />
                    جملة
                  </Badge>
                )}
                {product.is_weight_based && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    <Scale className="h-3 w-3 ml-1" />
                    وزن
                  </Badge>
                )}
              </div>

              <div className="space-y-1 text-sm text-muted-foreground">
                <p>الباركود: {product.barcode || 'غير محدد'}</p>
                <p>الكمية: {product.quantity}</p>
                <p>السعر: {product.price} ج.م</p>
                <p>المجموع: {product.total || (product.price * product.quantity)} ج.م</p>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">يرجى التأكد من:</p>
              <ul className="mt-1 space-y-1 text-xs">
                <li>• مطابقة المنتج للطلب</li>
                <li>• صحة الكمية والوزن</li>
                <li>• جودة المنتج</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleConfirm}
              disabled={isConfirming}
              className="bg-green-600 hover:bg-green-700"
            >
              <Check className="h-4 w-4 ml-2" />
              {isConfirming ? "جاري التأكيد..." : "تأكيد المنتج"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}