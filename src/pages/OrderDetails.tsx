import "@/components/orders/orders-workspace.css";
import { useQuery } from "@tanstack/react-query";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { OrderDeliverySnapshot } from "@/components/orders/OrderDeliverySnapshot";
import { getCheckoutSnapshot } from "@/services/supabase/checkoutOrderService";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Printer, Check, X, Package, DollarSign, Truck, Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrderDetails } from "@/hooks/orders/useOrderDetails";
import { OrderItemsList } from "@/components/orders/OrderItemsList";
import { CustomerInfoCards } from "@/components/orders/CustomerInfoCards";
import { PaymentConfirmationDialog } from "@/components/orders/PaymentConfirmationDialog";
import { PaymentMethodBadge } from "@/components/orders/PaymentMethodBadge";
import { OrderTimeline } from "@/components/orders/OrderTimeline";
import { PaymentStatusBadge } from "@/components/orders/PaymentStatusBadge";
import { Order } from "@/types";
import { useState } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { findOrCreateCustomer } from "@/services/supabase/customerService";
import { updateProduct } from "@/services/supabase/productService";
import { RegisterType } from "@/services/supabase/cashTrackingService";
import { recordCashTransaction } from "@/services/supabase/cashTrackingService";

export default function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [confirmAction,setConfirmAction] = useState<'next' | 'cancel' | null>(null);
  const snapshot = useQuery({queryKey:['order-delivery-snapshot',id],enabled:!!id,queryFn:() => getCheckoutSnapshot(id!)});
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const {
    order,
    isLoading,
    fetchOrder
  } = useOrderDetails(id as string);

  const getNextStatus = () => {
    const statusOrder = ['pending', 'confirmed', 'preparing', 'ready', 'shipped', 'delivered'];
    const currentIndex = statusOrder.indexOf(order?.status || 'pending');
    return currentIndex < statusOrder.length - 1 ? statusOrder[currentIndex + 1] : null;
  };

  const getNextStatusLabel = () => {
    const nextStatus = getNextStatus();
    const statusLabels = {
      confirmed: 'تأكيد الطلب',
      preparing: 'بدء التجهيز',
      ready: 'جاهز للشحن',
      shipped: 'شحن الطلب',
      delivered: 'تم التسليم'
    };
    return nextStatus ? statusLabels[nextStatus as keyof typeof statusLabels] : '';
  };

  const handleNextStatus = async () => {
    const nextStatus = getNextStatus();
    if (!order || !nextStatus || isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      if (nextStatus === 'delivered' && order.status !== 'delivered') {
        const checkout = await getCheckoutSnapshot(order.id);
        if (checkout.checkout_version !== 1 && (order.customer_name || order.customer_phone)) {
          const customerInfo = {
            name: order.customer_name || 'عميل غير معروف',
            phone: order.customer_phone || undefined
          };
          
          const customer = await findOrCreateCustomer(customerInfo);
          if (customer && !order.customer_id) {
            await supabase
              .from('online_orders')
              .update({ customer_id: customer.id })
              .eq('id', order.id);
          }
        }
        
        const orderItems = checkout.checkout_version === 1 ? [] : (order.items || []);
        
        for (const item of orderItems) {
          const { data: product, error: productError } = await supabase
            .from('products')
            .select('*')
            .eq('id', item.product_id)
            .single();
            
          if (productError) continue;
          
          let quantityToDeduct = item.quantity;
          
          if (product.bulk_enabled && item.barcode === product.bulk_barcode) {
            quantityToDeduct = item.quantity * (product.bulk_quantity || 1);
          }
          
          let newQuantity: number;
          
          if (item.is_weight_based || product.barcode_type === 'scale') {
            const currentQuantity = Math.floor(product.quantity || 0);
            newQuantity = Math.max(0, currentQuantity - Math.floor(quantityToDeduct));
          } else {
            newQuantity = Math.max(0, (product.quantity || 0) - quantityToDeduct);
          }
          
          await updateProduct(product.id, {
            quantity: newQuantity
          });
        }
        
        if (order.payment_status === 'paid') {
          try {
            await recordCashTransaction(
              order.total, 
              'deposit', 
              RegisterType.ONLINE, 
              `أمر الدفع من الطلب الإلكتروني #${order.id.slice(0, 8)}`, 
              ''
            );
          } catch (cashError) {
            console.error("Error recording cash transaction:", cashError);
            toast.error("تم تحديث المخزون لكن حدث خطأ في تسجيل المعاملة المالية");
          }
        }
      }
      
      const { error } = await supabase
        .from('online_orders')
        .update({ 
          status: nextStatus as Order['status'],
          updated_at: new Date().toISOString() 
        })
        .eq('id', order.id);
      
      if (error) throw error;
      
      toast.success(`تم تحديث حالة الطلب إلى ${getNextStatusLabel()}`);
      fetchOrder();
      
    } catch (error) {
      console.error('Error processing order:', error);
      toast.error("حدث خطأ أثناء معالجة الطلب");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order || isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString() 
        })
        .eq('id', order.id);
      
      if (error) throw error;
      
      toast.success('تم إلغاء الطلب بنجاح');
      fetchOrder();
      
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error("حدث خطأ أثناء إلغاء الطلب");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentStatusChange = async (newStatus: Order['payment_status']) => {
    if (!order || isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({
          payment_status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);
      
      if (error) throw error;
      
      toast.success(`تم تحديث حالة الدفع`);
      
      if (newStatus === 'paid' && order.status === 'delivered') {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          await recordCashTransaction(
            order.total, 
            'deposit', 
            RegisterType.ONLINE, 
            `أمر الدفع من الطلب الإلكتروني #${order.id.slice(0, 8)}`, 
            user?.id || ''
          );
        } catch (cashError) {
          console.error("Error recording cash transaction:", cashError);
        }
      }
      
      fetchOrder();
      setPaymentConfirmOpen(false);
    } catch (error) {
      console.error('Error updating payment status:', error);
      toast.error('حدث خطأ أثناء تحديث حالة الدفع');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleItemDeleted = () => {
    fetchOrder();
  };

  const handleItemUpdated = () => {
    fetchOrder();
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="flex justify-center items-center h-[70vh]">
          جاري التحميل...
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

  return <div className="pos-orders pos-order-detail">
    <header className="pos-orders-heading"><div className="flex items-start gap-3"><Button variant="outline" size="icon" aria-label="رجوع للطلبات" onClick={() => navigate('/online-orders')}><ArrowRight size={20} /></Button><div><p className="text-sm">تفاصيل الطلب</p><h1 className="pos-detail-number" dir="ltr">#{order.tracking_number || order.id.slice(0,8)}</h1><time dateTime={order.created_at}>{format(new Date(order.created_at),'dd MMM yyyy · HH:mm',{locale:ar})}</time></div></div><Button variant="outline" onClick={() => window.print()}><Printer size={18} />طباعة</Button></header>
    <div className="pos-detail-layout">
      <div className="pos-detail-content">
        <Card><CardHeader><CardTitle>المنتجات <span className="text-sm font-normal text-muted-foreground">({order.items.length} أصناف)</span></CardTitle></CardHeader><CardContent><OrderItemsList items={order.items} orderId={order.id} onItemDeleted={handleItemDeleted} onItemUpdated={handleItemUpdated} readOnly={snapshot.isPending || !!snapshot.error || snapshot.data?.checkout_version === 1 || ['shipped','delivered','cancelled'].includes(order.status)} /></CardContent></Card>
        <Card><CardHeader><CardTitle>العميل والتوصيل</CardTitle></CardHeader><CardContent className="space-y-4"><OrderDeliverySnapshot orderId={id} /><CustomerInfoCards customerName={order.customer_name} customerEmail={order.customer_email} customerPhone={order.customer_phone} shippingAddress={order.shipping_address} notes={order.notes} governorate={order.governorate} city={order.city} area={order.area} neighborhood={order.neighborhood} /></CardContent></Card>
      </div>
      <aside className="pos-detail-sidebar">
        <Card><CardHeader><CardTitle>ملخص الطلب</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex justify-between"><span>المنتجات</span><strong>{(order.total-(order.shipping_cost || 0)).toFixed(2)} ج.م</strong></div><div className="flex justify-between"><span>التوصيل</span><strong>{(order.shipping_cost || 0).toFixed(2)} ج.م</strong></div><div className="flex justify-between border-t pt-4 text-xl font-bold"><span>الإجمالي</span><span className="text-primary">{order.total.toFixed(2)} ج.م</span></div><div className="flex flex-wrap gap-2"><PaymentStatusBadge status={order.payment_status} editable={false} /><PaymentMethodBadge paymentMethod={order.payment_method} /></div>{order.payment_status !== 'paid' && order.status !== 'cancelled' && <Button variant="outline" className="w-full min-h-12" onClick={() => setPaymentConfirmOpen(true)}>تأكيد استلام الدفع</Button>}</CardContent></Card>
        <OrderTimeline status={order.status} createdAt={order.created_at} />
        <div className="pos-detail-actions">{!['delivered','cancelled'].includes(order.status) ? <><Button disabled={isProcessing} className="min-h-12 flex-1" onClick={() => setConfirmAction('next')}><Check size={18} />{getNextStatusLabel()}</Button>{order.status !== 'shipped' && <Button variant="outline" disabled={isProcessing} className="min-h-12 text-red-700" onClick={() => setConfirmAction('cancel')}>إلغاء الطلب</Button>}</> : <p className="font-semibold">{order.status === 'delivered' ? 'تم تسليم الطلب' : 'الطلب ملغي'}</p>}</div>
      </aside>
    </div>
    <AlertDialog open={!!confirmAction} onOpenChange={open => {if(!open && !isProcessing)setConfirmAction(null);}}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>{confirmAction === 'cancel' ? 'إلغاء الطلب؟' : getNextStatusLabel()}</AlertDialogTitle><AlertDialogDescription>{confirmAction === 'cancel' ? 'لو الطلب مدفوع، راجع رد المبلغ بشكل منفصل.' : 'تأكد من اكتمال الخطوة قبل تحديث حالة الطلب.'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={isProcessing}>رجوع</AlertDialogCancel><AlertDialogAction disabled={isProcessing} onClick={async event => {event.preventDefault();if(confirmAction === 'cancel') await handleCancelOrder();else await handleNextStatus();setConfirmAction(null);}}>{isProcessing ? 'جاري الحفظ…' : 'تأكيد'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <PaymentConfirmationDialog open={paymentConfirmOpen} onOpenChange={setPaymentConfirmOpen} orderId={order.id} onConfirm={fetchOrder} />
  </div>;
}
