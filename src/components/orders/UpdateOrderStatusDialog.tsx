
import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Order } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UpdateOrderStatusDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusUpdated?: () => void;
}

export function UpdateOrderStatusDialog({
  order,
  open,
  onOpenChange,
  onStatusUpdated
}: UpdateOrderStatusDialogProps) {
  const [status, setStatus] = useState<Order['status']>(order?.status || 'waiting');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateStatus = async () => {
    if (!order) return;
    
    try {
      setIsUpdating(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);
      
      if (error) throw error;
      
      toast.success("تم تحديث حالة الطلب بنجاح");
      
      if (onStatusUpdated) {
        onStatusUpdated();
      }
      
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error("حدث خطأ أثناء تحديث حالة الطلب");
    } finally {
      setIsUpdating(false);
    }
  };

  const statusLabels: Record<Order['status'], string> = {
    waiting: 'في الانتظار',
    ready: 'جاهز للشحن',
    shipped: 'تم الشحن',
    done: 'تم التسليم',
    cancelled: 'ملغي',
    returned: 'مرتجع'
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>تحديث حالة الطلب</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as Order['status'])}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="waiting">{statusLabels.waiting}</SelectItem>
                <SelectItem value="ready">{statusLabels.ready}</SelectItem>
                <SelectItem value="shipped">{statusLabels.shipped}</SelectItem>
                <SelectItem value="done">{statusLabels.done}</SelectItem>
                <SelectItem value="cancelled">{statusLabels.cancelled}</SelectItem>
                <SelectItem value="returned">{statusLabels.returned}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button 
            onClick={handleUpdateStatus} 
            disabled={isUpdating || status === order?.status}
          >
            {isUpdating ? "جاري التحديث..." : "تحديث الحالة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
