
// We only need to update a small part of this file, specifically the part that handles cash transactions
// after a sale is completed.

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// When a cash sale is completed (this is part of a function in the POS component)
const recordSaleToCashRegister = async (saleTotal: number, paymentMethod: string, cashAmount?: number) => {
  if (paymentMethod === 'cash' || paymentMethod === 'mixed') {
    try {
      const amountToRecord = paymentMethod === 'cash' ? saleTotal : cashAmount || 0;
      
      // Only record cash deposit if there's actual cash involved
      if (amountToRecord > 0) {
        console.log('Recording cash sale to register:', {
          amount: amountToRecord,
          transaction_type: 'deposit',
          register_type: 'store',
          notes: 'مبيعات نقطة البيع'
        });
        
        // Record cash transaction using the Edge Function
        const { data, error } = await supabase.functions.invoke('add-cash-transaction', {
          body: {
            amount: amountToRecord,
            transaction_type: 'deposit',
            register_type: 'store',
            notes: 'مبيعات نقطة البيع'
          }
        });
        
        if (error) {
          console.error('Error recording cash transaction:', error);
          toast.error('تم إتمام البيع ولكن حدث خطأ في تسجيل المعاملة النقدية');
        } else {
          console.log('Cash transaction recorded successfully:', data);
        }
      }
    } catch (error) {
      console.error('Error processing cash transaction:', error);
      toast.error('تم إتمام البيع ولكن حدث خطأ في تسجيل المعاملة النقدية');
    }
  }
}
