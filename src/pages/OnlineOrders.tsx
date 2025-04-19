
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { useNotificationStore } from "@/stores/notificationStore";
import { Order } from "@/types";
import { useOrderManagement } from "@/hooks/orders/useOrderManagement";
import { OrderStats } from "@/components/orders/OrderStats";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { CustomerProfileDialog } from "@/components/orders/CustomerProfileDialog";
import { PaymentConfirmationDialog } from "@/components/orders/PaymentConfirmationDialog";
import { AssignDeliveryPersonDialog } from "@/components/orders/AssignDeliveryPersonDialog";

export default function OnlineOrders() {
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [assignDeliveryOpen, setAssignDeliveryOpen] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  
  const { orders, loading, handleOrderUpdate } = useOrderManagement(activeTab);
  const { markOrdersAsRead } = useNotificationStore();
  const navigate = useNavigate();

  const handleArchive = (order: Order) => {
    toast.success("تم أرشفة الطلب");
  };

  const handleProcess = (order: Order) => {
    navigate(`/online-orders/${order.id}`);
  };

  const handleComplete = async (order: Order) => {
    try {
      const { error } = await supabase.from('online_orders')
        .update({
          status: 'delivered',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);
        
      if (error) throw error;
      handleOrderUpdate();
      toast.success("تم اكتمال الطلب");
    } catch (error) {
      console.error('Error completing order:', error);
      toast.error("حدث خطأ أثناء اكتمال الطلب");
    }
  };

  const handleCancel = async (order: Order) => {
    try {
      const { error } = await supabase.from('online_orders')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);
        
      if (error) throw error;
      handleOrderUpdate();
      toast.success("تم إلغاء الطلب");
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error("حدث خطأ أثناء إلغاء الطلب");
    }
  };

  const handlePaymentConfirm = (order: Order) => {
    setCurrentOrderId(order.id);
    setPaymentConfirmOpen(true);
  };

  const handleAssignDelivery = (order: Order) => {
    setCurrentOrderId(order.id);
    setAssignDeliveryOpen(true);
  };

  const showCustomerProfile = (order: Order) => {
    setSelectedCustomer({
      name: order.customer_name,
      email: order.customer_email,
      phone: order.customer_phone,
      address: order.shipping_address,
      order: order
    });
  };

  const filteredOrders = orders.filter(order => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return order.id.toLowerCase().includes(searchLower) || 
           order.customer_name?.toLowerCase().includes(searchLower) || 
           order.customer_phone?.toLowerCase().includes(searchLower);
  });

  return (
    <MainLayout>
      <div className="container mx-auto p-6 dir-rtl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">الطلبات</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex items-center gap-1">
              <Download className="h-4 w-4" />
              استخراج
            </Button>
            <Button variant="default" size="sm" className="flex items-center gap-1">
              <Plus className="h-4 w-4" />
              أنشئ طلب
            </Button>
          </div>
        </div>

        <OrderStats
          orders={orders}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <div className="mb-4 flex">
          <div className="relative w-full max-w-sm">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="البحث والتصنيفات"
              className="pl-10 pr-10"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>قائمة الطلبات</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-4">جاري التحميل...</p>
            ) : (
              <div className="overflow-x-auto">
                <OrdersTable
                  orders={filteredOrders}
                  onShowCustomer={showCustomerProfile}
                  onArchive={handleArchive}
                  onCancel={handleCancel}
                  onProcess={handleProcess}
                  onComplete={handleComplete}
                  onPaymentConfirm={handlePaymentConfirm}
                  onAssignDelivery={handleAssignDelivery}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <CustomerProfileDialog
          customer={selectedCustomer}
          open={!!selectedCustomer}
          onOpenChange={open => !open && setSelectedCustomer(null)}
        />

        {currentOrderId && (
          <>
            <PaymentConfirmationDialog
              open={paymentConfirmOpen}
              onOpenChange={setPaymentConfirmOpen}
              orderId={currentOrderId}
              onConfirm={handleOrderUpdate}
            />
            
            <AssignDeliveryPersonDialog
              open={assignDeliveryOpen}
              onOpenChange={setAssignDeliveryOpen}
              orderId={currentOrderId}
              onConfirm={handleOrderUpdate}
            />
          </>
        )}
      </div>
    </MainLayout>
  );
}
