
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

  const updateShippingStatus = async (status: 'shipped' | 'delivered') => {
    if (!order) return;
    
    try {
      setIsUpdatingShipping(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({ status })
        .eq('id', order.id);
      
      if (error) throw error;
      
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
      <DialogContent className="w-[95vw] max-w-[1400px] h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">تجهيز المنتجات #{order.id.slice(0, 8)}</DialogTitle>
        </DialogHeader>
        
        <div className="flex justify-between items-start flex-wrap md:flex-nowrap gap-6 dir-rtl">
          <div className="w-full md:w-3/5 space-y-6">
            <div>
              <h3 className="font-medium text-lg mb-3">المنتجات</h3>
              <OrderItemsList items={order.items} />
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
