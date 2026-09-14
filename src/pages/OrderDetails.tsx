import OrderLocationMap from '@/components/orders/OrderLocationMap';
import BrandLoader from '@/components/ui/BrandLoader';
import OnlineOrderInvoiceDialog from '@/components/orders/OnlineOrderInvoiceDialog';
import OrderFulfillmentPanel from '@/components/orders/OrderFulfillmentPanel';
import { changeOnlineOrderStatus } from '@/services/supabase/orderOperationsService';
import "@/components/orders/orders-workspace.css";
import { useQuery } from "@tanstack/react-query";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { OrderDeliverySnapshot } from "@/components/orders/OrderDeliverySnapshot";
import { getCheckoutSnapshot } from "@/services/supabase/checkoutOrderService";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Printer, Check, Workflow } from "lucide-react";
import { toast } from "sonner";
import { useOrderDetails } from "@/hooks/orders/useOrderDetails";
import { OrderItemsList } from "@/components/orders/OrderItemsList";
import { CustomerInfoCards } from "@/components/orders/CustomerInfoCards";
import { PaymentConfirmationDialog } from "@/components/orders/PaymentConfirmationDialog";
import { PaymentMethodBadge } from "@/components/orders/PaymentMethodBadge";
import { OrderTimeline } from "@/components/orders/OrderTimeline";
import { PaymentStatusBadge } from "@/components/orders/PaymentStatusBadge";
import { useState } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

export default function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoiceOpen,setInvoiceOpen] = useState(false);
  const [confirmAction,setConfirmAction] = useState<'confirm' | 'cancel' | null>(null);
  const snapshot = useQuery({queryKey:['order-delivery-snapshot',id],enabled:!!id,queryFn:() => getCheckoutSnapshot(id!)});
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const {
    order,
    isLoading,
    fetchOrder
  } = useOrderDetails(id as string);

  const handleConfirmOrder = async () => {
    if (!order || order.status !== 'pending' || isProcessing) return;
    try {
      setIsProcessing(true);
      await changeOnlineOrderStatus(order.id, 'pending', 'confirmed');
      toast.success('تم تأكيد الطلب وفتح مهمة التجهيز');
      await fetchOrder();
    } catch (error) {
      console.error('Error confirming order:', error);
      toast.error(error instanceof Error ? error.message : "حدث خطأ أثناء تأكيد الطلب");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order || isProcessing) return;
    try {
      setIsProcessing(true);
      await changeOnlineOrderStatus(order.id, order.status, 'cancelled');
      toast.success('تم إلغاء الطلب بنجاح');
      await fetchOrder();
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error(error instanceof Error ? error.message : "حدث خطأ أثناء إلغاء الطلب");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleItemDeleted = () => { fetchOrder(); };
  const handleItemUpdated = () => { fetchOrder(); };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="flex justify-center items-center h-[70vh]">
          <BrandLoader size="lg" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="flex justify-center items-center h-[70vh]">
          لم يتم العثور على الطلب
        </div>
      </div>
    );
  }

  const operationalFlow = ['confirmed','preparing','ready','shipped'].includes(order.status);

  return <div className="pos-orders pos-order-detail">
    <header className="pos-orders-heading"><div className="flex items-start gap-3"><Button variant="outline" size="icon" aria-label="رجوع للطلبات" onClick={() => navigate('/online-orders')}><ArrowRight size={20} /></Button><div><p className="text-sm">تفاصيل الطلب</p><h1 className="pos-detail-number" dir="ltr">#{order.tracking_number || order.id.slice(0,8)}</h1><time dateTime={order.created_at}>{format(new Date(order.created_at),'dd MMM yyyy · HH:mm',{locale:ar})}</time></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate('/online-orders/operations')}><Workflow size={18} />مركز التشغيل</Button><Button variant="outline" onClick={() => setInvoiceOpen(true)}><Printer size={18} />طباعة</Button></div></header>
    <div className="pos-detail-overview"><div><span>العميل</span><strong>{order.customer_name || 'غير مسجل'}</strong></div><div><span>الأصناف</span><strong>{order.items.length} أصناف</strong></div><div><span>قيمة الطلب</span><strong>{order.total.toFixed(2)} ج.م</strong></div><div><span>الدفع</span><PaymentStatusBadge status={order.payment_status} editable={false} /></div></div>
    <div className="pos-detail-layout">
      <div className="pos-detail-content">
        <OrderLocationMap order={order} />
        <Card><CardHeader><CardTitle>المنتجات <span className="text-sm font-normal text-muted-foreground">({order.items.length} أصناف)</span></CardTitle></CardHeader><CardContent><OrderItemsList items={order.items} orderId={order.id} onItemDeleted={handleItemDeleted} onItemUpdated={handleItemUpdated} readOnly={snapshot.isPending || !!snapshot.error || snapshot.data?.checkout_version === 1 || ['shipped','delivered','cancelled'].includes(order.status)} /></CardContent></Card>
        <Card><CardHeader><CardTitle>العميل والتوصيل</CardTitle></CardHeader><CardContent className="space-y-4">{snapshot.data?.checkout_version === 1 ? <OrderDeliverySnapshot orderId={id} /> : <CustomerInfoCards customerName={order.customer_name} customerEmail={order.customer_email} customerPhone={order.customer_phone} shippingAddress={order.shipping_address} notes={order.notes} governorate={order.governorate} city={order.city} area={order.area} neighborhood={order.neighborhood} />} {order.notes && snapshot.data?.checkout_version === 1 && <p className="rounded-xl bg-amber-50 p-4">ملاحظات العميل: {order.notes}</p>}</CardContent></Card>
      </div>
      <aside className="pos-detail-sidebar">
        <Card><CardHeader><CardTitle>ملخص الطلب</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex justify-between"><span>المنتجات</span><strong>{(order.total-(order.shipping_cost || 0)).toFixed(2)} ج.م</strong></div><div className="flex justify-between"><span>التوصيل</span><strong>{(order.shipping_cost || 0).toFixed(2)} ج.م</strong></div><div className="flex justify-between border-t pt-4 text-xl font-bold"><span>الإجمالي</span><span className="text-primary">{order.total.toFixed(2)} ج.م</span></div><div className="flex flex-wrap gap-2"><PaymentStatusBadge status={order.payment_status} editable={false} /><PaymentMethodBadge paymentMethod={order.payment_method} /></div>{order.payment_status !== 'paid' && order.status !== 'cancelled' && <Button variant="outline" className="w-full min-h-12" onClick={() => setPaymentConfirmOpen(true)}>تأكيد استلام الدفع</Button>}</CardContent></Card>
        <OrderFulfillmentPanel orderId={order.id} />
        <OrderTimeline status={order.status} createdAt={order.created_at} />
        <div className="pos-detail-actions">
          {order.status === 'pending' ? <><Button disabled={isProcessing} className="min-h-12 flex-1" onClick={() => setConfirmAction('confirm')}>{isProcessing ? <BrandLoader size="sm" /> : <Check size={18} />}تأكيد الطلب</Button><Button variant="outline" disabled={isProcessing} className="min-h-12 text-red-700" onClick={() => setConfirmAction('cancel')}>إلغاء الطلب</Button></> : operationalFlow ? <div className="w-full rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-950"><strong>المسار التشغيلي مفعّل.</strong><p className="mt-1 text-xs text-emerald-800">التجهيز والتعبئة وتعيين المندوب تتم من لوحة التجهيز والتوزيع أعلى الـTimeline. حالة الشحن والتسليم يحدّثها تطبيق المندوب تلقائيًا.</p>{!['shipped'].includes(order.status) && <Button variant="ghost" size="sm" disabled={isProcessing} className="mt-2 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setConfirmAction('cancel')}>إلغاء الطلب</Button>}</div> : <p className="font-semibold">{order.status === 'delivered' ? 'تم تسليم الطلب' : 'الطلب ملغي'}</p>}
        </div>
      </aside>
    </div>
    <AlertDialog open={!!confirmAction} onOpenChange={open => {if(!open && !isProcessing)setConfirmAction(null);}}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>{confirmAction === 'cancel' ? 'إلغاء الطلب؟' : 'تأكيد الطلب'}</AlertDialogTitle><AlertDialogDescription>{confirmAction === 'cancel' ? 'لو الطلب مدفوع، راجع رد المبلغ بشكل منفصل. لو فيه تجهيز أو تعيين مندوب سيتم إيقاف مسار الطلب.' : 'بعد التأكيد هيتفتح مسار التجهيز ويتحسب وقت الجاهزية المتوقع للمندوب.'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={isProcessing}>رجوع</AlertDialogCancel><AlertDialogAction disabled={isProcessing} onClick={async event => {event.preventDefault();if(confirmAction === 'cancel') await handleCancelOrder();else await handleConfirmOrder();setConfirmAction(null);}}>{isProcessing ? 'جاري الحفظ…' : 'تأكيد'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <OnlineOrderInvoiceDialog isOpen={invoiceOpen} onClose={()=>setInvoiceOpen(false)} order={order} />
    <PaymentConfirmationDialog open={paymentConfirmOpen} onOpenChange={setPaymentConfirmOpen} orderId={order.id} onConfirm={fetchOrder} />
  </div>;
}
