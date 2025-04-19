
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PaymentConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  onConfirm: () => void;
}

export function PaymentConfirmationDialog({ 
  open, 
  onOpenChange, 
  orderId,
  onConfirm
}: PaymentConfirmationDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const confirmPayment = async () => {
    if (!orderId) return;
    
    try {
      setIsSubmitting(true);
      
      // First, check the current order status
      const { data: orderData, error: fetchError } = await supabase
        .from('online_orders')
        .select('status')
        .eq('id', orderId)
        .single();
      
      if (fetchError) throw fetchError;
      
      // Update payment status and order status if needed
      const updates = { 
        payment_status: 'paid',
        updated_at: new Date().toISOString()
      };
      
      // If order is still waiting, automatically move it to ready state
      if (orderData.status === 'waiting') {
        const { error } = await supabase
          .from('online_orders')
          .update({
            ...updates,
            status: 'ready'
          })
          .eq('id', orderId);
        
        if (error) throw error;
        
        toast.success('تم تأكيد الدفع بنجاح');
        toast.info('تم تحديث حالة الطلب إلى "جاهز"');
      } else {
        const { error } = await supabase
          .from('online_orders')
          .update(updates)
          .eq('id', orderId);
        
        if (error) throw error;
        
        toast.success('تم تأكيد الدفع بنجاح');
      }
      
      onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error('Error confirming payment:', error);
      toast.error('حدث خطأ أثناء تأكيد الدفع');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">تأكيد الدفع</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4 text-center dir-rtl">
          <div>
            <p>هل أنت متأكد من تأكيد استلام هذا الدفع؟</p>
            <p className="text-sm text-muted-foreground mt-2">سيتم تحديث حالة الدفع إلى "مدفوع" وتحديث حالة الطلب إذا لزم الأمر.</p>
          </div>
        </div>
        <DialogFooter className="flex flex-row gap-2 sm:justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={confirmPayment}
          >
            تأكيد الدفع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
