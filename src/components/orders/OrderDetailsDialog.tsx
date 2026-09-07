import { changeOnlineOrderStatus } from '@/services/supabase/orderOperationsService';
import { getCheckoutSnapshot } from "@/services/supabase/checkoutOrderService";

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

  const snapshot = useQuery({queryKey:['order-delivery-snapshot',order?.id],enabled:open && !!order?.id,queryFn:()=>getCheckoutSnapshot(order!.id)});

  if (!order) return null;

  const updateShippingStatus = async (status: 'shipped' | 'delivered') => {
    if (!order || isUpdatingShipping) return;
    
    try {
      setIsUpdatingShipping(true);
      
      await changeOnlineOrderStatus(order.id, order.status, status);

      if (onStatusUpdated) onStatusUpdated();
      toast.success(`تم تحديث حالة الشحن إلى ${status === 'shipped' ? 'خرج للتوصيل' : 'تم التوصيل'}`);
    } catch (error) {
      console.error('Error updating shipping status:', error);
      toast.error(error instanceof Error ? error.message : 'حدث خطأ أثناء تحديث حالة الشحن');
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
                readOnly={snapshot.isPending || !!snapshot.error || snapshot.data?.checkout_version === 1 || ['shipped','delivered','cancelled'].includes(order.status)}
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

