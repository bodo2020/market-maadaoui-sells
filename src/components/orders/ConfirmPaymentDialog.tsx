
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Order } from "@/types";
import { Loader } from "lucide-react";

interface ConfirmPaymentDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (order: Order) => void;
}

export function ConfirmPaymentDialog({
  order,
  open,
  onOpenChange,
  onConfirm
}: ConfirmPaymentDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleConfirm = () => {
    if (!order) return;
    
    setIsSubmitting(true);
    
    try {
      onConfirm(order);
      onOpenChange(false);
    } catch (error) {
      console.error("Error confirming payment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (!order) return null;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md dir-rtl">
        <DialogHeader>
          <DialogTitle>تأكيد الدفع</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4 text-center">
          <div>
            <p>هل أنت متأكد من تأكيد استلام الدفع للطلب #{order.id.slice(0, 8)}؟</p>
            <p className="text-sm text-muted-foreground mt-2">
              سيتم تحديث حالة الدفع إلى "مدفوع" وتحديث حالة الطلب إذا لزم الأمر.
            </p>
          </div>
        </div>
        
        <DialogFooter className="sm:justify-center flex flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            إلغاء
          </Button>
          <Button 
            type="button"
            disabled={isSubmitting}
            onClick={handleConfirm}
          >
            {isSubmitting && <Loader className="h-4 w-4 animate-spin mr-2" />}
            تأكيد الدفع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
