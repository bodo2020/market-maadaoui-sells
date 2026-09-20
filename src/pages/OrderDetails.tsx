import OrderLocationMap from '@/components/orders/OrderLocationMap';
import BrandLoader from '@/components/ui/BrandLoader';
import OnlineOrderFinalReceiptDialog from '@/components/orders/OnlineOrderFinalReceiptDialog';
import OrderFulfillmentPanel from '@/components/orders/OrderFulfillmentPanel';
import { changeOnlineOrderStatus } from '@/services/supabase/orderOperationsService';
import { acceptPosOnlineOrder } from '@/services/supabase/posOnlineOrdersInboxService';
import "@/components/orders/orders-workspace.css";
import { useQuery } from "@tanstack/react-query";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { OrderDeliverySnapshot } from "@/components/orders/OrderDeliverySnapshot";
import { getCheckoutSnapshot } from "@/services/supabase/checkoutOrderService";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Check, Clock3, MapPin, PackageCheck, Printer, ShoppingBag, Truck, UserRound, Workflow } from "lucide-react";
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

const statusLabel: Record<string, string> = {
  pending: "طلب جديد",
  confirmed: "تم الاستلام",
  preparing: "جاري التجهيز",
  ready: "جاهز للاستلام",
  shipped: "خرج للتوصيل",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

const statusClass: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  confirmed: "border-blue-200 bg-blue-50 text-blue-800",
  preparing: "border-blue-200 bg-blue-50 text-blue-800",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-800",
  shipped: "border-violet-200 bg-violet-50 text-violet-800",
  delivered: "border-emerald-200 bg-emerald-50 text-emerald-800",
  cancelled: "border-red-200 bg-red-50 text-red-800",
};

export default function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [receiptOpen,setReceiptOpen] = useState(false);
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
      const result = await acceptPosOnlineOrder(order.id);
      const dispatch = (result as typeof result & { delivery_dispatch?: { ok?: boolean; delivery_name?: string; reason?: string } }).delivery_dispatch;
      if (dispatch?.ok && dispatch.delivery_name) {
        toast.success('تم استلام الطلب وبدأ التجهيز', { description: `تم تكليف ${dispatch.delivery_name} بالتوصيل بالتوازي.` });
      } else {
        toast.success('تم استلام الطلب وبدأ التجهيز', { description: 'بدأ النظام البحث عن مندوب بالتوازي مع تجهيز الطلب.' });
      }
      await fetchOrder();
    } catch (error) {
      console.error('Error confirming order:', error);
      toast.error(error instanceof Error ? error.message : "حدث خطأ أثناء استلام الطلب");
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
  const productsTotal = Math.max(0, order.total - (order.shipping_cost || 0));

  return <div className="pos-orders pos-order-detail">
    <header className="pos-orders-heading">
      <div className="flex items-start gap-3">
        <Button variant="outline" size="icon" aria-label="رجوع للطلبات" onClick={() => navigate('/online-orders')}><ArrowRight size={20} /></Button>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm">تفاصيل الطلب</p>
            <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass[order.status] || "border-slate-200 bg-slate-50 text-slate-700"}`}>
              {statusLabel[order.status] || order.status}
            </span>
          </div>
          <h1 className="pos-detail-number mt-1" dir="ltr">#{order.tracking_number || order.id.slice(0,8)}</h1>
          <time dateTime={order.created_at}>{format(new Date(order.created_at),'dd MMM yyyy · HH:mm',{locale:ar})}</time>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => navigate('/online-orders/operations')}><Workflow size={18} />مركز التشغيل</Button>
        <Button variant="outline" onClick={() => setReceiptOpen(true)}><Printer size={18} />إيصال الطلب</Button>
      </div>
    </header>

    <section className="grid gap-3 md:grid-cols-4">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><UserRound className="h-4 w-4" />العميل</div>
        <strong className="mt-2 block">{order.customer_name || 'غير مسجل'}</strong>
        <span className="text-xs text-muted-foreground">{order.customer_phone || 'بدون رقم'}</span>
      </div>
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShoppingBag className="h-4 w-4" />الأصناف</div>
        <strong className="mt-2 block">{order.items.length} أصناف</strong>
        <span className="text-xs text-muted-foreground">إجمالي المنتجات {productsTotal.toFixed(2)} ج.م</span>
      </div>
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Truck className="h-4 w-4" />التوصيل</div>
        <strong className="mt-2 block">{(order.shipping_cost || 0).toFixed(2)} ج.م</strong>
        <span className="text-xs text-muted-foreground">{order.shipping_address || 'العنوان محفوظ داخل الطلب'}</span>
      </div>
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><PackageCheck className="h-4 w-4" />الإجمالي والدفع</div>
        <strong className="mt-2 block text-lg text-[#005931]">{order.total.toFixed(2)} ج.م</strong>
        <div className="mt-1 flex flex-wrap gap-1"><PaymentStatusBadge status={order.payment_status} editable={false} /><PaymentMethodBadge paymentMethod={order.payment_method} /></div>
      </div>
    </section>

    {order.status === 'pending' ? (
      <Card className="border-amber-200 bg-amber-50/60">
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 font-black text-amber-950"><Clock3 className="h-5 w-5" />الطلب بانتظار الاستلام</div>
            <p className="mt-1 text-sm text-amber-800">عند الاستلام يبدأ تجهيز المنتجات والبحث عن مندوب في نفس اللحظة.</p>
          </div>
          <div className="flex gap-2">
            <Button disabled={isProcessing} className="min-h-12 bg-[#005931] hover:bg-[#004526]" onClick={() => setConfirmAction('confirm')}>
              {isProcessing ? <BrandLoader size="sm" /> : <Check size={18} />}استلام وبدء التجهيز
            </Button>
            <Button variant="outline" disabled={isProcessing} className="min-h-12 text-red-700" onClick={() => setConfirmAction('cancel')}>إلغاء الطلب</Button>
          </div>
        </CardContent>
      </Card>
    ) : operationalFlow ? (
      <OrderFulfillmentPanel orderId={order.id} />
    ) : null}

    <div className="pos-detail-layout">
      <div className="pos-detail-content">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-[#005931]" />المنتجات <span className="text-sm font-normal text-muted-foreground">({order.items.length})</span></CardTitle></CardHeader>
          <CardContent>
            <OrderItemsList items={order.items} orderId={order.id} onItemDeleted={handleItemDeleted} onItemUpdated={handleItemUpdated} readOnly={snapshot.isPending || !!snapshot.error || snapshot.data?.checkout_version === 1 || ['shipped','delivered','cancelled'].includes(order.status)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-[#005931]" />العنوان والتوصيل</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <OrderLocationMap order={order} />
            {snapshot.data?.checkout_version === 1 ? <OrderDeliverySnapshot orderId={id} /> : <CustomerInfoCards customerName={order.customer_name} customerEmail={order.customer_email} customerPhone={order.customer_phone} shippingAddress={order.shipping_address} notes={order.notes} governorate={order.governorate} city={order.city} area={order.area} neighborhood={order.neighborhood} />}
            {order.notes && snapshot.data?.checkout_version === 1 && <p className="rounded-xl bg-amber-50 p-4">ملاحظات العميل: {order.notes}</p>}
          </CardContent>
        </Card>
      </div>

      <aside className="pos-detail-sidebar">
        <Card>
          <CardHeader><CardTitle>الحساب والدفع</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between"><span>المنتجات</span><strong>{productsTotal.toFixed(2)} ج.م</strong></div>
            <div className="flex justify-between"><span>التوصيل</span><strong>{(order.shipping_cost || 0).toFixed(2)} ج.م</strong></div>
            <div className="flex justify-between border-t pt-4 text-xl font-bold"><span>الإجمالي</span><span className="text-primary">{order.total.toFixed(2)} ج.م</span></div>
            {order.payment_status !== 'paid' && order.status !== 'cancelled' && <Button variant="outline" className="w-full min-h-12" onClick={() => setPaymentConfirmOpen(true)}>تأكيد استلام الدفع</Button>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>رحلة الطلب</CardTitle></CardHeader>
          <CardContent><OrderTimeline status={order.status} createdAt={order.created_at} /></CardContent>
        </Card>

        {operationalFlow && order.status !== 'shipped' && (
          <div className="rounded-2xl border border-red-100 bg-red-50/50 p-3">
            <p className="text-xs text-red-800">إلغاء الطلب يوقف مسار التجهيز والتوصيل. لو الطلب مدفوع راجع رد المبلغ.</p>
            <Button variant="ghost" size="sm" disabled={isProcessing} className="mt-2 text-red-700 hover:bg-red-100 hover:text-red-800" onClick={() => setConfirmAction('cancel')}>إلغاء الطلب</Button>
          </div>
        )}

        {order.status === 'delivered' && <p className="rounded-2xl bg-emerald-50 p-4 font-semibold text-emerald-800">تم تسليم الطلب بنجاح.</p>}
        {order.status === 'cancelled' && <p className="rounded-2xl bg-red-50 p-4 font-semibold text-red-800">الطلب ملغي.</p>}
      </aside>
    </div>

    <AlertDialog open={!!confirmAction} onOpenChange={open => {if(!open && !isProcessing)setConfirmAction(null);}}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmAction === 'cancel' ? 'إلغاء الطلب؟' : 'استلام الطلب وبدء التشغيل؟'}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmAction === 'cancel'
              ? 'لو الطلب مدفوع، راجع رد المبلغ بشكل منفصل. أي تجهيز أو تعيين مندوب قائم سيتم إيقافه حسب مسار الإلغاء.'
              : 'سيبدأ تجهيز الطلب والبحث عن مندوب بالتوازي فورًا، ولن ننتظر انتهاء التجهيز لبدء التوصيل.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isProcessing}>رجوع</AlertDialogCancel>
          <AlertDialogAction disabled={isProcessing} onClick={async event => {event.preventDefault();if(confirmAction === 'cancel') await handleCancelOrder();else await handleConfirmOrder();setConfirmAction(null);}}>
            {isProcessing ? 'جاري الحفظ…' : confirmAction === 'cancel' ? 'تأكيد الإلغاء' : 'استلام الطلب'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <OnlineOrderFinalReceiptDialog isOpen={receiptOpen} onClose={()=>setReceiptOpen(false)} order={order} />
    <PaymentConfirmationDialog open={paymentConfirmOpen} onOpenChange={setPaymentConfirmOpen} orderId={order.id} onConfirm={fetchOrder} />
  </div>;
}
