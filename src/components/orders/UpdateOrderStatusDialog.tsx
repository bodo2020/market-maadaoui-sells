
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Check, X, Clock, Package, Truck } from "lucide-react";
import { Order } from "@/types/index";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface UpdateOrderStatusDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusUpdated: () => void;
}

export function UpdateOrderStatusDialog({ 
  order, 
  open, 
  onOpenChange,
  onStatusUpdated
}: UpdateOrderStatusDialogProps) {
  const [status, setStatus] = useState<Order['status']>(order?.status || 'pending');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset status when order changes
  if (order && status !== order.status) {
    setStatus(order.status);
  }

  const updateOrderStatus = async () => {
    if (!order) return;
    
    try {
      setIsSubmitting(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({ status })
        .eq('id', order.id);
      
      if (error) throw error;
      
      toast.success('تم تحديث حالة الطلب بنجاح');
      onStatusUpdated();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('حدث خطأ أثناء تحديث حالة الطلب');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusIcon = (statusValue: Order['status']) => {
    switch (statusValue) {
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'processing':
        return <Package className="h-4 w-4" />;
      case 'shipped':
        return <Truck className="h-4 w-4" />;
      case 'delivered':
        return <Check className="h-4 w-4" />;
      case 'cancelled':
        return <X className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تحديث حالة الطلب</DialogTitle>
        </DialogHeader>
        
        {order && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-muted-foreground mb-2">رقم الطلب: #{order.id.slice(0, 8)}</p>
              <p className="text-sm">اختر حالة الطلب الجديدة</p>
            </div>
            
            <RadioGroup value={status} onValueChange={(value: Order['status']) => setStatus(value)}>
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="pending" id="pending" />
                  <Label htmlFor="pending" className="flex items-center gap-2 cursor-pointer">
                    <Clock className="h-4 w-4 text-amber-500" />
                    قيد الانتظار
                  </Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="processing" id="processing" />
                  <Label htmlFor="processing" className="flex items-center gap-2 cursor-pointer">
                    <Package className="h-4 w-4 text-blue-500" />
                    قيد المعالجة
                  </Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="shipped" id="shipped" />
                  <Label htmlFor="shipped" className="flex items-center gap-2 cursor-pointer">
                    <Truck className="h-4 w-4 text-indigo-500" />
                    تم الشحن
                  </Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="delivered" id="delivered" />
                  <Label htmlFor="delivered" className="flex items-center gap-2 cursor-pointer">
                    <Check className="h-4 w-4 text-green-500" />
                    تم التسليم
                  </Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="cancelled" id="cancelled" />
                  <Label htmlFor="cancelled" className="flex items-center gap-2 cursor-pointer">
                    <X className="h-4 w-4 text-red-500" />
                    ملغي
                  </Label>
                </div>
              </div>
            </RadioGroup>
          </div>
        )}
        
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button 
            onClick={updateOrderStatus} 
            disabled={isSubmitting || !order || status === order.status}
            className="gap-2"
          >
            {getStatusIcon(status)}
            تحديث الحالة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
