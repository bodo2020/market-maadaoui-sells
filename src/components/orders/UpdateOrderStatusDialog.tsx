
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Order } from "@/types";

interface UpdateOrderStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  currentStatus: Order['status'];
  onStatusUpdated?: () => void;
}

export function UpdateOrderStatusDialog({
  open,
  onOpenChange,
  orderId,
  currentStatus,
  onStatusUpdated
}: UpdateOrderStatusDialogProps) {
  const [status, setStatus] = useState<Order['status']>(currentStatus);
  const [isUpdating, setIsUpdating] = useState(false);
  
  const handleUpdateStatus = async () => {
    if (!orderId || status === currentStatus || isUpdating) return;
    
    try {
      setIsUpdating(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({
          status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);
      
      if (error) throw error;
      
      toast.success(`تم تحديث حالة الطلب إلى ${
        status === 'waiting' ? 'في الانتظار' : 
        status === 'ready' ? 'جاهز للشحن' : 
        status === 'shipped' ? 'تم الشحن' : 
        status === 'done' ? 'تم التسليم' :
        status === 'cancelled' ? 'ملغي' : 'مرتجع'
      }`);
      
      if (onStatusUpdated) onStatusUpdated();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error("حدث خطأ أثناء تحديث حالة الطلب");
    } finally {
      setIsUpdating(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تحديث حالة الطلب</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="text-sm text-muted-foreground">
            يرجى تحديد الحالة الجديدة للطلب:
          </div>
          
          <RadioGroup 
            value={status} 
            onValueChange={(value) => setStatus(value as Order['status'])} 
            className="space-y-2"
          >
            <div className="flex items-center space-x-2 space-x-reverse">
              <RadioGroupItem value="waiting" id="waiting" />
              <Label htmlFor="waiting">في الانتظار</Label>
            </div>
            
            <div className="flex items-center space-x-2 space-x-reverse">
              <RadioGroupItem value="ready" id="ready" />
              <Label htmlFor="ready">جاهز للشحن</Label>
            </div>
            
            <div className="flex items-center space-x-2 space-x-reverse">
              <RadioGroupItem value="shipped" id="shipped" />
              <Label htmlFor="shipped">تم الشحن</Label>
            </div>
            
            <div className="flex items-center space-x-2 space-x-reverse">
              <RadioGroupItem value="done" id="done" />
              <Label htmlFor="done">تم التسليم</Label>
            </div>
            
            <div className="flex items-center space-x-2 space-x-reverse">
              <RadioGroupItem value="cancelled" id="cancelled" />
              <Label htmlFor="cancelled">ملغي</Label>
            </div>
            
            <div className="flex items-center space-x-2 space-x-reverse">
              <RadioGroupItem value="returned" id="returned" />
              <Label htmlFor="returned">مرتجع</Label>
            </div>
          </RadioGroup>
        </div>
        
        <DialogFooter className="space-x-2 space-x-reverse">
          <Button 
            onClick={handleUpdateStatus} 
            disabled={isUpdating || status === currentStatus}
          >
            {isUpdating ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                جاري التحديث...
              </>
            ) : (
              'تحديث الحالة'
            )}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)} 
            disabled={isUpdating}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
