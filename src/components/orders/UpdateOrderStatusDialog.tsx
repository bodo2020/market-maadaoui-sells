
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
        return <Clock className="h-4 w-4 text-amber-500" />;
      case 'processing':
        return <Package className="h-4 w-4 text-blue-500" />;
      case 'shipped':
        return <Truck className="h-4 w-4 text-indigo-500" />;
      case 'delivered':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'cancelled':
        return <X className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusClass = (statusValue: Order['status']) => {
    switch (statusValue) {
      case 'pending':
        return 'border-amber-500 hover:bg-amber-50';
      case 'processing':
        return 'border-blue-500 hover:bg-blue-50';
      case 'shipped':
        return 'border-indigo-500 hover:bg-indigo-50';
      case 'delivered':
        return 'border-green-500 hover:bg-green-50';
      case 'cancelled':
        return 'border-red-500 hover:bg-red-50';
      default:
        return '';
    }
  };

  const statusOptions: {value: Order['status'], label: string, icon: JSX.Element}[] = [
    { value: 'pending', label: 'قيد الانتظار', icon: <Clock className="h-4 w-4 text-amber-500" /> },
    { value: 'processing', label: 'قيد المعالجة', icon: <Package className="h-4 w-4 text-blue-500" /> },
    { value: 'shipped', label: 'تم الشحن', icon: <Truck className="h-4 w-4 text-indigo-500" /> },
    { value: 'delivered', label: 'تم التسليم', icon: <Check className="h-4 w-4 text-green-500" /> },
    { value: 'cancelled', label: 'ملغي', icon: <X className="h-4 w-4 text-red-500" /> }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">تحديث حالة الطلب</DialogTitle>
        </DialogHeader>
        
        {order && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-muted-foreground">رقم الطلب: #{order.id.slice(0, 8)}</p>
              <p className="text-sm font-medium">اختر حالة الطلب الجديدة</p>
            </div>
            
            <RadioGroup 
              value={status} 
              onValueChange={(value) => setStatus(value as Order['status'])}
              className="grid gap-3"
            >
              {statusOptions.map((item) => (
                <div 
                  key={item.value}
                  className={`flex items-center space-x-2 space-x-reverse rounded-lg border-2 p-3 transition-colors ${getStatusClass(item.value)}`}
                >
                  <RadioGroupItem value={item.value} id={item.value} />
                  <Label 
                    htmlFor={item.value} 
                    className="flex flex-1 items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      {item.icon}
                      {item.label}
                    </span>
                    {status === item.value && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        )}
        
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            إلغاء
          </Button>
          <Button 
            onClick={updateOrderStatus} 
            disabled={isSubmitting || !order || status === order.status}
            className="w-full sm:w-auto gap-2"
          >
            {getStatusIcon(status)}
            تحديث الحالة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
