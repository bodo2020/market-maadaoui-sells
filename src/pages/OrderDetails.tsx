import { useParams, useNavigate } from "react-router-dom";
import { Order } from "@/types";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { OrderItemsList } from "@/components/orders/OrderItemsList";
import { CustomerInfoCards } from "@/components/orders/CustomerInfoCards";
import { OrderStatusSelection } from "@/components/orders/OrderStatusSelection";
import { PaymentConfirmationDialog } from "@/components/orders/PaymentConfirmationDialog";
import { PaymentStatusBadge } from "@/components/orders/PaymentStatusBadge";
import { OrderStatusProgress } from "@/components/orders/OrderStatusProgress";
import { useOrderDetails } from "@/hooks/orders/useOrderDetails";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { findOrCreateCustomer } from "@/services/supabase/customerService";
import { updateProduct } from "@/services/supabase/productService";
import { RegisterType } from "@/services/supabase/cashTrackingService";
import { recordCashTransaction } from "@/services/supabase/cashTrackingService";

export default function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);

  const {
    order,
    isLoading,
    isUpdatingStatus,
    selectedStatus,
    setSelectedStatus,
    handleStatusChange: originalHandleStatusChange,
    fetchOrder
  } = useOrderDetails(id as string);

  const handlePaymentStatusUpdate = () => {
    if (!order || order.payment_status === 'paid') return;
    setPaymentConfirmOpen(true);
  };

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
    if (!order || !nextStatus || isProcessingOrder) return;
    
    try {
      setIsProcessingOrder(true);
      
      if (nextStatus === 'delivered' && order.status !== 'delivered') {
        if (order.customer_name || order.customer_phone) {
          const customerInfo = {
            name: order.customer_name || 'عميل غير معروف',
            phone: order.customer_phone || undefined
          };
          
          const customer = await findOrCreateCustomer(customerInfo);
          if (customer) {
            console.log("Customer linked to order:", customer);
            if (!order.customer_id) {
              await supabase
                .from('online_orders')
                .update({ customer_id: customer.id })
                .eq('id', order.id);
            }
          }
        }
        
        const orderItems = order.items || [];
        console.log("Processing inventory for items:", orderItems);
        
        for (const item of orderItems) {
          const { data: product, error: productError } = await supabase
            .from('products')
            .select('*')
            .eq('id', item.product_id)
            .single();
            
          if (productError) {
            console.error("Error fetching product:", productError);
            continue;
          }
          
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
          
          console.log(`Updated inventory for product ${product.name}: ${product.quantity} -> ${newQuantity}`);
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
            console.log(`Added ${order.total} to online cash register`);
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
      setIsProcessingOrder(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order || isProcessingOrder) return;
    
    try {
      setIsProcessingOrder(true);
      
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
      setIsProcessingOrder(false);
    }
  };

  const handlePaymentStatusChange = async (newStatus: Order['payment_status']) => {
    if (!order || isUpdatingPayment) return;
    
    try {
      setIsUpdatingPayment(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({
          payment_status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);
      
      if (error) throw error;
      
      toast.success(`تم تحديث حالة الدفع إلى ${
        newStatus === 'paid' ? 'مدفوع' : 
        newStatus === 'pending' ? 'في انتظار الدفع' : 
        newStatus === 'failed' ? 'فشل الدفع' : 'تم الاسترجاع'
      }`);
      
      if (newStatus === 'paid' && order.status === 'delivered') {
        try {
          // Get current user ID (may be null if not authenticated)
          const { data: { user } } = await supabase.auth.getUser();
          const userId = user?.id ?? null;
          
          await recordCashTransaction(
            order.total, 
            'deposit', 
            RegisterType.ONLINE, 
            `أمر الدفع من الطلب الإلكتروني #${order.id.slice(0, 8)}`, 
            userId
          );
          console.log(`Added ${order.total} to online cash register`);
        } catch (cashError) {
          console.error("Error recording cash transaction:", cashError);
          toast.error("تم تحديث حالة الدفع لكن حدث خطأ في تسجيل المعاملة المالية");
        }
      }
      
      fetchOrder();
    } catch (error) {
      console.error('Error updating payment status:', error);
      toast.error('حدث خطأ أثناء تحديث حالة الدفع');
    } finally {
      setIsUpdatingPayment(false);
    }
  };

  const onPaymentConfirmed = () => {
    fetchOrder();
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="container mx-auto p-6">
          <div className="flex justify-center items-center h-[70vh]">
            جاري التحميل...
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!order) {
    return (
      <MainLayout>
        <div className="container mx-auto p-6">
          <div className="flex justify-center items-center h-[70vh]">
            لم يتم العثور على الطلب
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto p-6 dir-rtl">
        <div className="flex justify-between items-center mb-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">تجهيز الطلب #{order?.id.slice(0, 8)}</h1>
              {order && (
                <PaymentStatusBadge 
                  status={order.payment_status} 
                  onStatusChange={handlePaymentStatusChange} 
                  editable 
                />
              )}
            </div>
            
            {/* Visual Progress Line */}
            <div className="bg-card p-4 rounded-lg border">
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">مراحل الطلب</h3>
              <OrderStatusProgress status={order?.status || 'pending'} />
            </div>
            
            {/* Next Status Button */}
            {order?.status !== 'delivered' && order?.status !== 'cancelled' && (
              <Button 
                onClick={handleNextStatus}
                disabled={isUpdatingStatus || isProcessingOrder}
                className="w-full"
                size="lg"
              >
                {isUpdatingStatus || isProcessingOrder ? 'جاري المعالجة...' : getNextStatusLabel()}
              </Button>
            )}

            {/* Cancel Order Button */}
            {order?.status !== 'delivered' && order?.status !== 'cancelled' && (
              <Button 
                onClick={handleCancelOrder}
                disabled={isUpdatingStatus || isProcessingOrder}
                variant="destructive"
                className="w-full"
                size="lg"
              >
                {isUpdatingStatus || isProcessingOrder ? 'جاري الإلغاء...' : 'إلغاء الطلب'}
              </Button>
            )}
          </div>
          <Button variant="outline" onClick={() => navigate('/online-orders')}>
            عودة
          </Button>
        </div>

        <div className="flex justify-between items-start flex-wrap md:flex-nowrap gap-6">
          <div className="w-full md:w-3/5 space-y-6">
            <div>
              <h3 className="font-medium text-lg mb-3">المنتجات</h3>
              <OrderItemsList 
                items={order?.items || []} 
                orderId={order?.id}
                onItemDeleted={fetchOrder}
                onItemUpdated={fetchOrder}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 mt-4">
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={handlePaymentStatusUpdate}
                  disabled={order?.payment_status === 'paid' || isUpdatingStatus || isProcessingOrder}
                >
                  {order?.payment_status === 'pending' ? 'تأكيد الدفع' : 'تم الدفع'}
                </Button>
              </div>
            </div>
          </div>

          <div className="w-full md:w-2/5">
            <CustomerInfoCards
              customerName={order?.customer_name}
              customerEmail={order?.customer_email}
              customerPhone={order?.customer_phone}
              shippingAddress={order?.shipping_address}
              notes={order?.notes}
              governorate={order?.governorate}
              city={order?.city}
              area={order?.area}
              neighborhood={order?.neighborhood}
            />
          </div>
        </div>

        <PaymentConfirmationDialog
          open={paymentConfirmOpen}
          onOpenChange={setPaymentConfirmOpen}
          orderId={order?.id || ''}
          onConfirm={onPaymentConfirmed}
        />
      </div>
    </MainLayout>
  );
}
