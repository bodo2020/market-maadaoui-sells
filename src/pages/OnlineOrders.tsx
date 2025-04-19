
import { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { useOrdersData, OrderFilters } from "@/hooks/orders/useOrdersData";
import { OrdersHeader } from "@/components/orders/OrdersHeader";
import { OrdersList } from "@/components/orders/OrdersList";
import { OrderDetailsDialog } from "@/components/orders/OrderDetailsDialog";
import { ConfirmPaymentDialog } from "@/components/orders/ConfirmPaymentDialog";
import { CancelOrderDialog } from "@/components/orders/CancelOrderDialog";
import { Order } from "@/types";
import { printOrderInvoice } from "@/services/orders/printOrderService";
import { useNotificationStore } from "@/stores/notificationStore";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export default function OnlineOrders() {
  // State for filters and dialogs
  const [filters, setFilters] = useState<OrderFilters>({ status: 'all' });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  
  // Notification store for marking orders as read
  const { markOrdersAsRead } = useNotificationStore();
  
  // Hook for fetching and managing orders
  const { 
    orders, 
    loading, 
    updateOrderStatus,
    confirmPayment,
    assignDeliveryPerson,
    cancelOrder,
    refreshOrders
  } = useOrdersData({
    ...filters,
    searchQuery
  });
  
  // Debug loading state
  useEffect(() => {
    console.log("Orders loading state:", loading);
    console.log("Orders count:", orders.length);
  }, [loading, orders]);
  
  // Update filters when tab changes
  const handleTabChange = (value: string) => {
    console.log("Tab changed to:", value);
    if (value === 'all') {
      setFilters({ ...filters, status: 'all' });
    } else {
      setFilters({ ...filters, status: value as OrderFilters['status'] });
      
      // When viewing pending orders, mark them as read
      if (value === 'pending') {
        markOrdersAsRead();
      }
    }
  };
  
  // Handle action for marking order as ready
  const handleMarkAsReady = (order: Order) => {
    if (order.status === 'processing') {
      updateOrderStatus(order.id, 'ready');
    }
  };
  
  // Open details dialog
  const handleViewDetails = (order: Order) => {
    setSelectedOrder(order);
    setDetailsOpen(true);
    
    // Mark as read if viewing a pending order
    if (order.status === 'pending') {
      markOrdersAsRead();
    }
  };
  
  // Handle payment confirmation action
  const handleConfirmPayment = (order: Order) => {
    setSelectedOrder(order);
    
    if (detailsOpen) {
      setDetailsOpen(false);
      setTimeout(() => {
        setPaymentDialogOpen(true);
      }, 300);
    } else {
      setPaymentDialogOpen(true);
    }
  };
  
  // Handle order cancellation action
  const handleCancelOrder = (order: Order) => {
    setSelectedOrder(order);
    
    if (detailsOpen) {
      setDetailsOpen(false);
      setTimeout(() => {
        setCancelDialogOpen(true);
      }, 300);
    } else {
      setCancelDialogOpen(true);
    }
  };
  
  // Handle print invoice action
  const handlePrintInvoice = (order: Order) => {
    printOrderInvoice(order);
  };
  
  // Load initial data
  useEffect(() => {
    refreshOrders();
  }, []);
  
  return (
    <MainLayout>
      <div className="container py-6 dir-rtl">
        <OrdersHeader
          activeTab={filters.status || 'all'}
          onTabChange={handleTabChange}
          onSearchChange={setSearchQuery}
          searchQuery={searchQuery}
          onRefresh={refreshOrders}
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
            />
          )}
        </div>
        
        {/* Order details dialog */}
        {selectedOrder && (
          <OrderDetailsDialog
            order={selectedOrder}
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
            onPrintInvoice={handlePrintInvoice}
            onMarkAsReady={handleMarkAsReady}
            onAssignDelivery={refreshOrders}
            onConfirmPayment={handleConfirmPayment}
          />
        )}
        
        {/* Payment confirmation dialog */}
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
        
        {/* Cancel order dialog */}
        {selectedOrder && (
          <CancelOrderDialog
            order={selectedOrder}
            open={cancelDialogOpen}
            onOpenChange={setCancelDialogOpen}
            onConfirm={(order) => {
              cancelOrder(order.id);
              setCancelDialogOpen(false);
            }}
          />
        )}
      </div>
    </MainLayout>
  );
}
