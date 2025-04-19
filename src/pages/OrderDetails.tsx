
import { useParams, useNavigate } from "react-router-dom";
import { Order } from "@/types";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { OrderItemsList } from "@/components/orders/OrderItemsList";
import { CustomerInfoCards } from "@/components/orders/CustomerInfoCards";
import { OrderStatusSelection } from "@/components/orders/OrderStatusSelection";
import { PaymentConfirmationDialog } from "@/components/orders/PaymentConfirmationDialog";
import { useOrderDetails } from "@/hooks/orders/useOrderDetails";
import { useState } from "react";

export default function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);

  const {
    order,
    isLoading,
    isUpdatingStatus,
    selectedStatus,
    setSelectedStatus,
    handleStatusChange,
    fetchOrder
  } = useOrderDetails(id as string);

  const handlePaymentStatusUpdate = () => {
    if (!order || order.payment_status === 'paid') return;
    setPaymentConfirmOpen(true);
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
            <h1 className="text-2xl font-bold">تجهيز الطلب #{order?.id.slice(0, 8)}</h1>
            <OrderStatusSelection
              selectedStatus={selectedStatus}
              onStatusSelect={setSelectedStatus}
              onStatusConfirm={handleStatusChange}
              currentStatus={order.status}
              isUpdating={isUpdatingStatus}
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
                  disabled={order.payment_status === 'paid' || isUpdatingStatus}
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
