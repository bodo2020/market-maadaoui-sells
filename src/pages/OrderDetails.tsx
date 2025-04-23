
import { useParams, useNavigate } from "react-router-dom";
import { Order } from "@/types";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { OrderItemsList } from "@/components/orders/OrderItemsList";
import { CustomerInfoCards } from "@/components/orders/CustomerInfoCards";
import { OrderStatusSelection } from "@/components/orders/OrderStatusSelection";
import { PaymentConfirmationDialog } from "@/components/orders/PaymentConfirmationDialog";
import { PaymentStatusBadge } from "@/components/orders/PaymentStatusBadge";
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

  // Enhanced status change handler that also processes inventory and financials
  const handleStatusChange = async (newStatus: Order['status']) => {
    if (!order || isProcessingOrder) return;
    
    try {
      setIsProcessingOrder(true);
      
      // If the status is being changed to 'done', we need to process inventory and add to cash register
      if (newStatus === 'done' && order.status !== 'done') {
        // First, make sure we have a valid customer record
        if (order.customer_name || order.customer_phone) {
          const customerInfo = {
            name: order.customer_name || 'عميل غير معروف',
            phone: order.customer_phone || undefined
          };
          
          const customer = await findOrCreateCustomer(customerInfo);
          if (customer) {
            console.log("Customer linked to order:", customer);
            // Update the customer_id in the order if it was missing
            if (!order.customer_id) {
              await supabase
                .from('online_orders')
                .update({ customer_id: customer.id })
                .eq('id', order.id);
            }
          }
        }
        
        // Process inventory reduction for each item in the order
        const orderItems = order.items || [];
        console.log("Processing inventory for items:", orderItems);
        
        for (const item of orderItems) {
          // Get the current product
          const { data: product, error: productError } = await supabase
            .from('products')
            .select('*')
            .eq('id', item.product_id)
            .single();
            
          if (productError) {
            console.error("Error fetching product:", productError);
            continue;
          }
          
          // Calculate new quantity
          const newQuantity = Math.max(0, (product.quantity || 0) - item.quantity);
          
          // Update the product quantity
          await updateProduct(product.id, {
            quantity: newQuantity
          });
          
          console.log(`Updated inventory for product ${product.name}: ${product.quantity} -> ${newQuantity}`);
        }
        
        // If the order is marked as paid, add the amount to the online cash register
        if (order.payment_status === 'paid') {
          try {
            await recordCashTransaction(
              order.total, 
              'deposit', 
              RegisterType.ONLINE, 
              `أمر الدفع من الطلب الإلكتروني #${order.id.slice(0, 8)}`, 
              ''  // User ID can be empty here as the system will handle it
            );
            console.log(`Added ${order.total} to online cash register`);
          } catch (cashError) {
            console.error("Error recording cash transaction:", cashError);
            toast.error("تم تحديث المخزون لكن حدث خطأ في تسجيل المعاملة المالية");
          }
        }
      }
      
      // Call the original status change handler to update the order status
      await originalHandleStatusChange(newStatus);
      toast.success("تم تحديث حالة الطلب وتحديث المخزون بنجاح");
      
    } catch (error) {
      console.error('Error processing order completion:', error);
      toast.error("حدث خطأ أثناء معالجة الطلب");
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
      
      // If payment is marked as paid and order is already completed, add to cash register
      if (newStatus === 'paid' && order.status === 'done') {
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
          <div className="space-y-2">
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
            <OrderStatusSelection
              selectedStatus={selectedStatus}
              onStatusSelect={setSelectedStatus}
              onStatusConfirm={handleStatusChange}
              currentStatus={order.status}
              isUpdating={isUpdatingStatus || isProcessingOrder}
            />
          </div>
          <Button variant="outline" onClick={() => navigate('/online-orders')}>
            عودة
          </Button>
        </div>

        <div className="flex justify-between items-start flex-wrap md:flex-nowrap gap-6">
          <div className="w-full md:w-3/5 space-y-6">
            <div>
              <h3 className="font-medium text-lg mb-3">المنتجات</h3>
              <OrderItemsList items={order.items} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 mt-4">
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={handlePaymentStatusUpdate}
                  disabled={order.payment_status === 'paid' || isUpdatingStatus || isProcessingOrder}
                >
                  {order?.payment_status === 'pending' ? 'تأكيد الدفع' : 'تم الدفع'}
                </Button>
              </div>
            </div>
          </div>

          <div className="w-full md:w-2/5">
            <CustomerInfoCards
              customerName={order.customer_name}
              customerEmail={order.customer_email}
              customerPhone={order.customer_phone}
              shippingAddress={order.shipping_address}
              notes={order.notes}
            />
          </div>
        </div>

        <PaymentConfirmationDialog
          open={paymentConfirmOpen}
          onOpenChange={setPaymentConfirmOpen}
          orderId={order.id}
          onConfirm={onPaymentConfirmed}
        />
      </div>
    </MainLayout>
  );
}
