
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
import { useBranchStore } from "@/stores/branchStore";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Check, FileText, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import OnlineOrderInvoiceDialog from "./OnlineOrderInvoiceDialog";
import { useQuery } from "@tanstack/react-query";

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
  const { currentBranchId } = useBranchStore();
  const [updateStatusOpen, setUpdateStatusOpen] = useState(false);
  const [isUpdatingShipping, setIsUpdatingShipping] = useState(false);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [assignDeliveryOpen, setAssignDeliveryOpen] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);

  // Fetch routing information
  const { data: routingInfo } = useQuery({
    queryKey: ["order-routing", order?.id],
    queryFn: async () => {
      if (!order?.id) return null;
      const { data, error } = await supabase
        .from('order_routing_log')
        .select(`
          *,
          branches:assigned_branch_id (
            name,
            address,
            phone
          ),
          neighborhoods:neighborhood_id (
            name,
            areas (
              name,
              cities (
                name,
                governorates (
                  name
                )
              )
            )
          )
        `)
        .eq('order_id', order.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error) {
        console.error("Error fetching routing info:", error);
        return null;
      }
      return data;
    },
    enabled: !!order?.id,
  });

  if (!order) return null;

  const updateShippingStatus = async (status: 'shipped' | 'delivered') => {
    if (!order) return;
    
    try {
      setIsUpdatingShipping(true);
      
      if (status === 'delivered' && order.status !== 'delivered') {
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
            const branchId = order.branch_id || currentBranchId || undefined;
            await recordCashTransaction(
              order.total, 
              'deposit', 
              RegisterType.ONLINE, 
              `أمر الدفع من الطلب الإلكتروني #${order.id.slice(0, 8)}`, 
              '',
              branchId
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

  const renderCustomerNameWithVerification = () => {
    if (!order.customer_name) return <span>عميل غير معروف</span>;
    
    return (
      <div className="flex items-center gap-2">
        <Link 
          to={`/customer-profile/${order.customer_id || 'unknown'}`} 
          className="text-primary hover:underline"
        >
          {order.customer_name}
        </Link>
        {order.customer_phone_verified && (
          <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200 flex items-center gap-1">
            <Check size={14} className="text-blue-600" />
            <span>موثق</span>
          </Badge>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[1000px] h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center justify-between">
            <span>تجهيز المنتجات #{order.id.slice(0, 8)}</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setInvoiceDialogOpen(true)}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              طباعة الفاتورة
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex justify-between items-start flex-wrap md:flex-nowrap gap-6 dir-rtl">
          <div className="w-full md:w-3/5 space-y-6">
            <div>
              <h3 className="font-medium text-lg mb-3">المنتجات</h3>
              <OrderItemsList 
                items={order.items} 
                orderId={order.id}
                onItemDeleted={onStatusUpdated}
                onItemUpdated={onStatusUpdated}
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

          <div className="w-full md:w-2/5 space-y-4">
            {/* Routing Information Card */}
            {routingInfo && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                    معلومات التوزيع
                  </h3>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">الفرع المخصص:</span>
                    <p className="font-medium">{routingInfo.branches?.name}</p>
                  </div>
                  
                  {routingInfo.neighborhoods && (
                    <div>
                      <span className="text-muted-foreground">منطقة التوصيل:</span>
                      <p className="font-medium">
                        {routingInfo.neighborhoods.name} - {routingInfo.neighborhoods.areas?.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {routingInfo.neighborhoods.areas?.cities?.name} - {routingInfo.neighborhoods.areas?.cities?.governorates?.name}
                      </p>
                    </div>
                  )}
                  
                  <div>
                    <span className="text-muted-foreground">سبب التوزيع:</span>
                    <p className="text-xs">{routingInfo.routing_reason}</p>
                  </div>
                </div>
              </div>
            )}
            
            <CustomerInfoCards
              customerName={renderCustomerNameWithVerification()}
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

        <OnlineOrderInvoiceDialog
          isOpen={invoiceDialogOpen}
          onClose={() => setInvoiceDialogOpen(false)}
          order={order}
        />
      </DialogContent>
    </Dialog>
  );
}
