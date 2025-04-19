
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { useOrdersData, OrderFilters } from "@/hooks/orders/useOrdersData";
import { OrdersHeader } from "@/components/orders/OrdersHeader";
import { OrdersList } from "@/components/orders/OrdersList";
import { ConfirmPaymentDialog } from "@/components/orders/ConfirmPaymentDialog";
import { CancelOrderDialog } from "@/components/orders/CancelOrderDialog";
import { Order } from "@/types";
import { printOrderInvoice } from "@/services/orders/printOrderService";
import { useNotificationStore } from "@/stores/notificationStore";
import { Skeleton } from "@/components/ui/skeleton";

export default function OnlineOrders() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<OrderFilters>({ status: 'all' });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  
  const { markOrdersAsRead } = useNotificationStore();
  
  const { 
    orders, 
    loading, 
    updateOrderStatus,
    confirmPayment,
    assignDeliveryPerson,
    cancelOrder,
  } = useOrdersData({
    ...filters,
    searchQuery
  });
  
  const handleTabChange = (value: string) => {
    setFilters(prev => {
      const newFilters = { 
        ...prev, 
        status: value as OrderFilters['status'] 
      };
      
      if (value === 'pending') {
        markOrdersAsRead();
      }
      
      return newFilters;
    });
  };
  
  const handleViewDetails = (order: Order) => {
    navigate(`/orders/${order.id}`);
    
    if (order.status === 'pending') {
      markOrdersAsRead();
    }
  };
  
  const handleMarkAsReady = (order: Order) => {
    if (order.status === 'processing') {
      updateOrderStatus(order.id, 'ready');
    }
  };
  
  const handleConfirmPayment = (order: Order) => {
    setSelectedOrder(order);
    setPaymentDialogOpen(true);
  };
  
  const handleCancelOrder = (order: Order) => {
    setSelectedOrder(order);
    setCancelDialogOpen(true);
  };
  
  const handlePrintInvoice = (order: Order) => {
    printOrderInvoice(order);
  };

  const handleRestoreOrder = (order: Order) => {
    if (order.status === 'cancelled') {
      updateOrderStatus(order.id, 'pending');
    }
  };
  
  return (
    <MainLayout>
      <div className="container py-6 dir-rtl">
        <OrdersHeader
          activeTab={filters.status || 'all'}
          onTabChange={handleTabChange}
          onSearchChange={setSearchQuery}
          searchQuery={searchQuery}
          onRefresh={() => {}}
          isLoading={loading}
        />
        
        <div className="mt-6">
          {loading ? (
            <div className="p-6 bg-white rounded-lg shadow">
              <div className="space-y-3">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <div className="text-center mt-4 text-muted-foreground">جاري تحميل الطلبات...</div>
              </div>
            </div>
          ) : orders.length === 0 ? (
            <div className="p-6 bg-white rounded-lg shadow text-center">
              <p className="text-muted-foreground">لا توجد طلبات متاحة</p>
            </div>
          ) : (
            <OrdersList
              orders={orders}
              loading={loading}
              onViewDetails={handleViewDetails}
              onPrintInvoice={handlePrintInvoice}
              onMarkAsReady={handleMarkAsReady}
              onAssignDelivery={handleViewDetails}
              onConfirmPayment={handleConfirmPayment}
              onCancelOrder={handleCancelOrder}
              onChangeFilters={setFilters}
              onRestoreOrder={handleRestoreOrder}
            />
          )}
        </div>
        
        {selectedOrder && (
          <ConfirmPaymentDialog
            order={selectedOrder}
            open={paymentDialogOpen}
            onOpenChange={setPaymentDialogOpen}
            onConfirm={(order) => {
              confirmPayment(order.id);
              setPaymentDialogOpen(false);
            }}
          />
        )}
        
        {selectedOrder && (
          <CancelOrderDialog
            order={selectedOrder}
            open={cancelDialogOpen}
            onOpenChange={setCancelDialogOpen}
            onConfirm={(order) => {
              cancelOrder(order.id);
              setCancelDialogOpen(false);
              setFilters(prev => ({ ...prev, status: 'cancelled' }));
            }}
          />
        )}
      </div>
    </MainLayout>
  );
}
