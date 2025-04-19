
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
  const handleConfirm = async () => {
    try {
      const { error } = await supabase
        .from('online_orders')
        .update({
          payment_status: 'paid',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) throw error;
      
      toast.success('تم تأكيد الدفع بنجاح');
      onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error('Error confirming payment:', error);
      toast.error('حدث خطأ أثناء تأكيد الدفع');
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="dir-rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>تأكيد اكتمال الدفع</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="text-right py-4">
          <p>هل أنت متأكد من رغبتك في حفظ هذا الطلب كمدفوع بالكامل؟</p>
        </div>
        <div className="flex justify-start gap-3">
          <AlertDialogAction 
            onClick={handleConfirm}
            className="bg-primary hover:bg-primary/90"
          >
            تأكيد الدفع
          </AlertDialogAction>
          <AlertDialogCancel className="mt-0">إلغاء</AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
