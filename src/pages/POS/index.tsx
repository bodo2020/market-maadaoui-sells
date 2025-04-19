// We only need to update a small part of this file, specifically the part that handles cash transactions
// after a sale is completed.

// When a cash sale is completed
if (payment_method === 'cash' || payment_method === 'mixed') {
  try {
    const amountToRecord = payment_method === 'cash' ? total : cash_amount || 0;
    
    // Only record cash deposit if there's actual cash involved
    if (amountToRecord > 0) {
      // Record cash transaction using the Edge Function
      const { error } = await supabase.functions.invoke('add-cash-transaction', {
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
      }
    }
  } catch (error) {
    console.error('Error processing cash transaction:', error);
    toast.error('تم إتمام البيع ولكن حدث خطأ في تسجيل المعاملة النقدية');
  }
}
