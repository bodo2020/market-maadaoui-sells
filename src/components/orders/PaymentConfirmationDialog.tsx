import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Order } from "@/types";

interface PaymentConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  onConfirm?: () => void;
}

export function PaymentConfirmationDialog({
  open,
  onOpenChange,
  orderId,
  onConfirm
}: PaymentConfirmationDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [isUpdating, setIsUpdating] = useState(false);
  
  const handleConfirm = async () => {
    if (!orderId || isUpdating) return;
    
    try {
      setIsUpdating(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({
          payment_status: "paid",
          payment_method: paymentMethod,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);
      
      if (error) throw error;
      
      toast.success("تم تأكيد الدفع بنجاح");
      
      // Check if the order status is still waiting, update it to ready
      const { data: orderData } = await supabase
        .from('online_orders')
        .select('status')
        .eq('id', orderId)
        .single();
      
      if (orderData && orderData.status === 'waiting') {
        await supabase
          .from('online_orders')
          .update({
            status: 'ready',
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId);
          
        toast.success("تم تحديث حالة الطلب إلى 'جاهز للشحن'");
      }
      
      if (onConfirm) onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error('Error confirming payment:', error);
      toast.error("حدث خطأ أثناء تأكيد الدفع");
    } finally {
      setIsUpdating(false);
    }
  };
  
  const handleStatusChange = (newStatus: string) => {
    // Make sure this function can handle all possible status values
    // including "cancelled" and "returned"
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تأكيد الدفع</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="text-sm text-muted-foreground">
            يرجى تحديد طريقة الدفع التي استخدمها العميل:
          </div>
          
          <RadioGroup 
            value={paymentMethod} 
            onValueChange={setPaymentMethod} 
            className="space-y-2"
          >
            <div className="flex items-center space-x-2 space-x-reverse">
              <RadioGroupItem value="cash" id="cash" />
              <Label htmlFor="cash">نقداً</Label>
            </div>
            
            <div className="flex items-center space-x-2 space-x-reverse">
              <RadioGroupItem value="bank_transfer" id="bank_transfer" />
              <Label htmlFor="bank_transfer">تحويل بنكي</Label>
            </div>
            
            <div className="flex items-center space-x-2 space-x-reverse">
              <RadioGroupItem value="card" id="card" />
              <Label htmlFor="card">بطاقة ائتمان</Label>
            </div>
            
            <div className="flex items-center space-x-2 space-x-reverse">
              <RadioGroupItem value="e_wallet" id="e_wallet" />
              <Label htmlFor="e_wallet">محفظة إلكترونية</Label>
            </div>
          </RadioGroup>
        </div>
        
        <DialogFooter className="space-x-2 space-x-reverse">
          <Button onClick={handleConfirm} disabled={isUpdating}>
            {isUpdating ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                جاري التأكيد...
              </>
            ) : (
              'تأكيد الدفع'
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
