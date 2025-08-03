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
type RegisterType = 'store' | 'online';

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

  const handleStatusChange = async () => {
    if (!order || isProcessingOrder || !selectedStatus) return;
    
    try {
      setIsProcessingOrder(true);
      
      if (selectedStatus === 'done' && order.status !== 'done') {
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
          
          // Calculate new quantity based on whether it's a bulk product
          let quantityToDeduct = item.quantity;
          
          // If the item's barcode matches the product's bulk_barcode, handle it as bulk
          if (product.bulk_enabled && item.barcode === product.bulk_barcode) {
            quantityToDeduct = item.quantity * (product.bulk_quantity || 1);
          }
          
          // Handle weight-based products by ensuring integer storage
          let newQuantity: number;
          
          if (item.is_weight_based || product.barcode_type === 'scale') {
            // For weight-based products, ensure we're working with integers
            const currentQuantity = Math.floor(product.quantity || 0);
            newQuantity = Math.max(0, currentQuantity - Math.floor(quantityToDeduct));
          } else {
            // For regular products
            newQuantity = Math.max(0, (product.quantity || 0) - quantityToDeduct);
          }
          
          await updateProduct(product.id, {
            quantity: newQuantity
          });
          
          console.log(`Updated inventory for product ${product.name}: ${product.quantity} -> ${newQuantity}`);
        }
        
      }
      
      await originalHandleStatusChange();
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
              currentStatus={order?.status}
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
