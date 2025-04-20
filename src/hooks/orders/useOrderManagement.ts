
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Order } from "@/types";
import { useNotificationStore } from "@/stores/notificationStore";

export type OrderFromDB = {
  id: string;
  created_at: string;
  total: number;
  status: string;
  payment_status: string;
  payment_method: string | null;
  shipping_address: string | null;
  items: any;
  customer_id?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  tracking_number?: string | null;
  shipping_cost?: number | null;
  notes?: string | null;
  updated_at?: string | null;
  delivery_person?: string | null;
  is_returned?: boolean;
  is_cancelled?: boolean;
};

export const useOrderManagement = (activeTab: string) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  const { setUnreadOrders } = useNotificationStore();

  useEffect(() => {
    fetchOrders();
    fetchPendingOrdersCount();
    const channel = subscribeToOrders();
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [activeTab, ordersRefreshKey]);

  const fetchPendingOrdersCount = async () => {
    try {
      const { count, error } = await supabase
        .from('online_orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'waiting');
      
      if (error) throw error;
      
      setUnreadOrders(count || 0);
    } catch (error) {
      console.error('Error fetching pending orders count:', error);
    }
  };

  const subscribeToOrders = () => {
    const channel = supabase.channel('online-orders')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'online_orders'
      }, payload => {
        toast.info("طلب جديد!", {
          description: "تم استلام طلب جديد"
        });
        fetchOrders();
        fetchPendingOrdersCount();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'online_orders'
      }, payload => {
        console.log("Order updated:", payload);
        fetchOrders();
        fetchPendingOrdersCount();
      })
      .subscribe();
    return channel;
  };

  const validateOrderStatus = (status: string): Order['status'] => {
    const validStatuses = ['waiting', 'ready', 'shipped', 'done', 'cancelled', 'returned'] as const;
    return validStatuses.includes(status as any) ? status as Order['status'] : 'waiting';
  };

  const validatePaymentStatus = (status: string): Order['payment_status'] => {
    const validStatuses: Order['payment_status'][] = ['pending', 'paid', 'failed', 'refunded'];
    return validStatuses.includes(status as Order['payment_status']) ? status as Order['payment_status'] : 'pending';
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      const validStatus = validateOrderStatus(status);
      
      const { data, error } = await supabase
        .from('online_orders')
        .update({ 
          status: validStatus,
          is_cancelled: validStatus === 'cancelled',
          is_returned: validStatus === 'returned'
        })
        .eq('id', orderId);
      
      if (error) throw error;
      
      fetchOrders();
      fetchPendingOrdersCount();
    } catch (error) {
      console.error("Error updating order status:", error);
      throw error;
    }
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      let query = supabase.from('online_orders').select('*').order('created_at', {
        ascending: false
      });
      
      if (activeTab === "waiting") {
        query = query.eq('status', 'waiting');
      } else if (activeTab === "ready") {
        query = query.eq('status', 'ready');
      } else if (activeTab === "shipped") {
        query = query.eq('status', 'shipped');
      } else if (activeTab === "done") {
        query = query.eq('status', 'done');
      } else if (activeTab === "unpaid") {
        query = query.eq('payment_status', 'pending');
      } else if (activeTab === "cancelled") {
        query = query.eq('status', 'cancelled');
      } else if (activeTab === "returned") {
        query = query.eq('status', 'returned');
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      const transformedOrders: Order[] = (data || []).map((item: OrderFromDB) => ({
        id: item.id,
        created_at: item.created_at,
        total: item.total,
        status: validateOrderStatus(item.status),
        payment_status: validatePaymentStatus(item.payment_status),
        payment_method: item.payment_method,
        shipping_address: item.shipping_address,
        items: Array.isArray(item.items) ? item.items : [],
        customer_name: item.customer_name || 'غير معروف',
        customer_email: item.customer_email || '',
        customer_phone: item.customer_phone || '',
        notes: item.notes || '',
        tracking_number: item.tracking_number || null,
        delivery_person: item.delivery_person || null,
        is_returned: item.is_returned || false,
        is_cancelled: item.is_cancelled || false
      }));
      
      setOrders(transformedOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error("حدث خطأ أثناء تحميل الطلبات");
    } finally {
      setLoading(false);
    }
  };

  const handleOrderUpdate = () => {
    setOrdersRefreshKey(prev => prev + 1);
  };

  return {
    orders,
    loading,
    handleOrderUpdate
  };
};
