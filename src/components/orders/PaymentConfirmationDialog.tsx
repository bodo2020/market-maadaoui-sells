import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { confirmOnlineOrderPayment } from '@/services/supabase/orderOperationsService';
import { readCheckoutSnapshot } from '@/services/supabase/checkoutOrderService';
import { toast } from 'sonner';

interface Props { open:boolean; onOpenChange:(open:boolean)=>void; orderId:string; onConfirm?:()=>void; }
const methods: Record<string,string> = {cash:'نقدي',card:'بطاقة',bank_transfer:'تحويل بنكي',wallet:'محفظة إلكترونية'};
export function PaymentConfirmationDialog({open,onOpenChange,orderId,onConfirm}:Props) {
  const [method,setMethod] = useState('cash');
  const [reference,setReference] = useState('');
  const [saving,setSaving] = useState(false);
  const query = useQuery({queryKey:['order-payment',orderId],enabled:open && !!orderId,staleTime:0,queryFn:async()=>{
    const {data,error}=await supabase.from('online_orders').select('*').eq('id',orderId).single();
    if(error)throw error; return data;
  }});
  useEffect(()=>{if(open){setMethod(query.data?.payment_method || 'cash');setReference('');}},[open,orderId,query.data?.payment_method]);
  const order=query.data;
  const immutable=order && readCheckoutSnapshot(order).checkout_version===1;
  const blocked=!order || query.isFetching || !!query.error || order.status==='cancelled' || order.payment_status==='paid' || order.payment_status==='refunded';
  const confirm=async()=>{
    if(saving || blocked)return;
    setSaving(true);
    try {
      await confirmOnlineOrderPayment(orderId,immutable ? order.payment_method : method,reference);
      toast.success('تم تأكيد استلام الدفع');onOpenChange(false);onConfirm?.();
    } catch(error){toast.error(error instanceof Error ? error.message : 'تعذّر تأكيد الدفع');}
    finally{setSaving(false);}
  };
  return <Dialog open={open} onOpenChange={value=>{if(!saving)onOpenChange(value);}}>
    <DialogContent dir="rtl" className="w-[calc(100%-2rem)] max-w-md max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>تأكيد استلام الدفع</DialogTitle><DialogDescription>راجع استلام المبلغ فعليًا قبل التأكيد.</DialogDescription></DialogHeader>
      {query.isPending ? <p role="status">جاري تحميل بيانات الدفع…</p> : query.error ? <div role="alert"><p>تعذّر تحميل الطلب.</p><Button onClick={()=>query.refetch()} variant="outline">حاول تاني</Button></div> : order && <div className="space-y-5">
        <div className="rounded-xl bg-muted p-4"><p className="text-sm">المبلغ المطلوب</p><p className="mt-1 text-2xl font-bold">{Number(order.total).toFixed(2)} ج.م</p><p className="mt-2 text-xs text-muted-foreground" dir="ltr">#{order.tracking_number || order.id.slice(0,8)}</p></div>
        {immutable ? <p>طريقة الدفع: <strong>{methods[order.payment_method] || order.payment_method}</strong></p> : <fieldset><legend className="mb-2 font-medium">طريقة استلام الدفع</legend><RadioGroup value={method} onValueChange={setMethod} disabled={saving || blocked} className="grid grid-cols-2 gap-2">{Object.entries(methods).map(([value,label])=><Label key={value} htmlFor={`payment-${value}`} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border p-3"><RadioGroupItem id={`payment-${value}`} value={value}/>{label}</Label>)}</RadioGroup></fieldset>}
        {(immutable ? order.payment_method : method)!=='cash' && <div className="space-y-2"><Label htmlFor="payment-reference">رقم العملية (اختياري)</Label><Input id="payment-reference" dir="ltr" maxLength={120} value={reference} onChange={event=>setReference(event.target.value)} disabled={saving || blocked}/></div>}
        {order.payment_status==='paid' && <p role="status">الدفع مؤكد بالفعل.</p>}
        {(order.status==='cancelled' || order.payment_status==='refunded') && <p role="alert">الطلب غير متاح لتأكيد الدفع.</p>}
      </div>}
      <DialogFooter><Button variant="outline" disabled={saving} onClick={()=>onOpenChange(false)}>رجوع</Button><Button className="min-h-12" disabled={saving || blocked} onClick={confirm}>{saving?'جاري التأكيد…':'تأكيد استلام المبلغ'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
