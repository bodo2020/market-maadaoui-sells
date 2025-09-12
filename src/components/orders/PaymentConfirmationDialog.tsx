
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RegisterType, recordCashTransaction } from "@/services/supabase/cashTrackingService";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [transactionId, setTransactionId] = useState<string>('');
  
  const confirmPayment = async () => {
    if (!orderId || isSubmitting) return;
    
    try {
      setIsSubmitting(true);
      
      // Fetch the order details to get the total
      const { data: orderData, error: orderError } = await supabase
        .from('online_orders')
        .select('*')
        .eq('id', orderId)
        .single();
        
      if (orderError) throw orderError;
      
      // Update the payment status
      const { error } = await supabase
        .from('online_orders')
        .update({ 
          payment_status: 'paid',
          payment_method: paymentMethod,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);
      
      if (error) throw error;
      
      // If the order is already marked as done, add the amount to cash tracking
      if (orderData.status === 'delivered') {
        try {
          await recordCashTransaction(
            orderData.total, 
            'deposit', 
            RegisterType.ONLINE, 
            `أمر الدفع من الطلب الإلكتروني #${orderId.slice(0, 8)} - ${
              paymentMethod === 'cash' ? 'نقداً' : 
              paymentMethod === 'card' ? 'بطاقة' : 
              'تحويل بنكي'
            }`, 
            ''
          );
          console.log(`Added ${orderData.total} to online cash register`);
        } catch (cashError) {
          console.error("Error recording cash transaction:", cashError);
          toast.error("تم تأكيد الدفع لكن حدث خطأ في تسجيل المعاملة المالية");
        }
      }
      
      toast.success('تم تأكيد الدفع بنجاح');
      onOpenChange(false);
      if (onConfirm) onConfirm();
    } catch (error) {
      console.error('Error confirming payment:', error);
      toast.error('حدث خطأ أثناء تأكيد الدفع');
    } finally {
      setIsSubmitting(false);
      // Reset form
      setPaymentMethod('cash');
      setTransactionId('');
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] dir-rtl">
        <DialogHeader>
          <DialogTitle>تأكيد الدفع</DialogTitle>
          <DialogDescription>
            تأكيد استلام الدفع للطلب #{orderId.slice(0, 8)}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>طريقة الدفع</Label>
            <RadioGroup 
              value={paymentMethod} 
              onValueChange={setPaymentMethod}
              className="grid gap-3"
            >
              <div className="flex items-center space-x-2 space-x-reverse rounded-lg border p-3 transition-colors hover:bg-muted/50">
                <RadioGroupItem value="cash" id="cash" />
                <Label htmlFor="cash" className="flex flex-1 cursor-pointer">
                  نقدي
                </Label>
                {paymentMethod === 'cash' && <Check className="h-4 w-4 text-primary" />}
              </div>
              
              <div className="flex items-center space-x-2 space-x-reverse rounded-lg border p-3 transition-colors hover:bg-muted/50">
                <RadioGroupItem value="card" id="card" />
                <Label htmlFor="card" className="flex flex-1 cursor-pointer">
                  بطاقة ائتمان
                </Label>
                {paymentMethod === 'card' && <Check className="h-4 w-4 text-primary" />}
              </div>
              
              <div className="flex items-center space-x-2 space-x-reverse rounded-lg border p-3 transition-colors hover:bg-muted/50">
                <RadioGroupItem value="bank_transfer" id="bank_transfer" />
                <Label htmlFor="bank_transfer" className="flex flex-1 cursor-pointer">
                  تحويل بنكي
                </Label>
                {paymentMethod === 'bank_transfer' && <Check className="h-4 w-4 text-primary" />}
              </div>
            </RadioGroup>
          </div>
          
          {(paymentMethod === 'card' || paymentMethod === 'bank_transfer') && (
            <div className="space-y-2">
              <Label htmlFor="transaction-id">رقم العملية</Label>
              <Input 
                id="transaction-id" 
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="أدخل رقم العملية (اختياري)"
              />
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button 
            type="submit" 
            onClick={confirmPayment} 
            disabled={isSubmitting}
          >
            {isSubmitting ? 'جاري المعالجة...' : 'تأكيد الدفع'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
