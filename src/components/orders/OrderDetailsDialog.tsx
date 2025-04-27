import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Order } from "@/types/index";
import { UpdateOrderStatusDialog } from "./UpdateOrderStatusDialog";
import { PaymentConfirmationDialog } from "./PaymentConfirmationDialog";
import { AssignDeliveryPersonDialog } from "./AssignDeliveryPersonDialog";
import { OrderItemsList } from "./OrderItemsList";
import { OrderSummaryActions } from "./OrderSummaryActions";
import { CustomerInfoCards } from "./CustomerInfoCards";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { findOrCreateCustomer } from "@/services/supabase/customerService";
import { updateProduct } from "@/services/supabase/productService";
import { RegisterType, recordCashTransaction } from "@/services/supabase/cashTrackingService";

interface OrderDetailsDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusUpdated?: () => void;
}

export function OrderDetailsDialog({ 
  order, 
  open, 
  onOpenChange, 
  onStatusUpdated 
}: OrderDetailsDialogProps) {
  const [updateStatusOpen, setUpdateStatusOpen] = useState(false);
  const [isUpdatingShipping, setIsUpdatingShipping] = useState(false);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [assignDeliveryOpen, setAssignDeliveryOpen] = useState(false);

  if (!order) return null;

  const updateShippingStatus = async (status: 'shipped' | 'done') => {
    if (!order) return;
    
    try {
      setIsUpdatingShipping(true);
      
      if (status === 'done' && order.status !== 'done') {
        // If marking as done, process inventory and financial updates
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
          
          // Calculate new quantity based on whether it's a bulk product
          let quantityToDeduct = item.quantity;
          
          // If the item's barcode matches the product's bulk_barcode, handle it as bulk
          if (product.bulk_enabled && item.barcode === product.bulk_barcode) {
            quantityToDeduct = item.quantity * (product.bulk_quantity || 1);
          }
          
          // Convert weight-based product quantities from decimal to integer if needed
          let newQuantity: number;
          
          // Check if the product is weight-based and its quantity in the database is stored as integer
          if (item.is_weight_based || product.barcode_type === 'scale') {
            // For weight-based products, ensure quantity is stored as an integer
            const currentQuantity = Math.floor(product.quantity || 0);
            newQuantity = Math.max(0, currentQuantity - Math.floor(quantityToDeduct));
          } else {
            // For regular products, just subtract directly
            newQuantity = Math.max(0, (product.quantity || 0) - quantityToDeduct);
          }
          
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
          status,
          updated_at: new Date().toISOString() 
        })
        .eq('id', order.id);
      
      if (error) throw error;
      
      // When order is shipped, notify the delivery person
      if (status === 'shipped' && order.delivery_person) {
        try {
          // Send notification to delivery person via Supabase channel
          const notificationChannel = supabase.channel('delivery-notifications');
          await notificationChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await notificationChannel.send({
                type: 'broadcast',
                event: 'new-delivery',
                payload: {
                  order_id: order.id,
                  delivery_person: order.delivery_person,
                  customer_address: order.shipping_address,
                  status: 'shipped'
                }
              });
            }
          });
          
          console.log('Delivery notification sent');
        } catch (notifyError) {
          console.error('Error sending delivery notification:', notifyError);
        }
      }
      
      if (onStatusUpdated) onStatusUpdated();
      toast.success(`تم تحديث حالة الشحن إلى ${status === 'shipped' ? 'خرج للتوصيل' : 'تم التوصيل'}`);
    } catch (error) {
      console.error('Error updating shipping status:', error);
      toast.error('حدث خطأ أثناء تحديث حالة الشحن');
    } finally {
      setIsUpdatingShipping(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[1000px] h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">تجهيز المنتجات #{order.id.slice(0, 8)}</DialogTitle>
        </DialogHeader>
        
        <div className="flex justify-between items-start flex-wrap md:flex-nowrap gap-6 dir-rtl">
          <div className="w-full md:w-3/5 space-y-6">
            <div>
              <h3 className="font-medium text-lg mb-3">المنتجات</h3>
              <OrderItemsList 
                items={order.items} 
                orderId={order.id}
                onItemDeleted={onStatusUpdated}
              />
            </div>

            <OrderSummaryActions
              order={order}
              onUpdateStatus={() => setUpdateStatusOpen(true)}
              onPaymentConfirm={() => setPaymentConfirmOpen(true)}
              onAssignDelivery={() => setAssignDeliveryOpen(true)}
              onUpdateShipping={updateShippingStatus}
              isUpdatingShipping={isUpdatingShipping}
            />
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

        <UpdateOrderStatusDialog 
          order={order}
          open={updateStatusOpen}
          onOpenChange={setUpdateStatusOpen}
          onStatusUpdated={onStatusUpdated}
        />

        <PaymentConfirmationDialog
          open={paymentConfirmOpen}
          onOpenChange={setPaymentConfirmOpen}
          orderId={order.id}
          onConfirm={onStatusUpdated}
        />

        <AssignDeliveryPersonDialog
          open={assignDeliveryOpen}
          onOpenChange={setAssignDeliveryOpen}
          orderId={order.id}
          onConfirm={onStatusUpdated}
        />
      </DialogContent>
    </Dialog>
  );
}
