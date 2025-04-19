
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Order, OrderItem } from "@/types";
import { useNotificationStore } from "@/stores/notificationStore";

export type OrderStatus = 'pending' | 'processing' | 'ready' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface OrderFilters {
  status?: OrderStatus | 'all';
  paymentStatus?: PaymentStatus | 'all';
  searchQuery?: string;
}

export function useOrdersData(filters: OrderFilters = {}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { setUnreadOrders } = useNotificationStore();

  useEffect(() => {
    fetchOrders();
    setupRealtimeSubscription();
    
    return () => {
      cleanupRealtimeSubscription();
    };
  }, [filters, refreshTrigger]);

  const setupRealtimeSubscription = () => {
    const channel = supabase.channel('online-orders-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'online_orders' }, 
        (payload) => {
          console.log('Order change detected:', payload);
          toast.info('تم تحديث الطلبات', {
            description: 'اضغط على زر التحديث لتحميل التغييرات'
          });
        })
      .subscribe();
      
    return channel;
  };

  const cleanupRealtimeSubscription = () => {
    supabase.removeChannel(supabase.channel('online-orders-changes'));
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      console.log("Fetching orders with filters:", filters);
      
      let query = supabase.from('online_orders')
        .select(`
          *,
          customers(
            name,
            email,
            phone,
            address
          )
        `)
        .order('created_at', { ascending: false });
      
      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      
      if (filters.paymentStatus && filters.paymentStatus !== 'all') {
        query = query.eq('payment_status', filters.paymentStatus);
      }
      
      if (filters.searchQuery) {
        const searchTerm = `%${filters.searchQuery}%`;
        query = query.or(`id.ilike.${searchTerm},shipping_address.ilike.${searchTerm}`);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error("Supabase error:", error);
        throw error;
      }
      
      console.log("Orders data from Supabase:", data);
      
      const transformedOrders: Order[] = (data || []).map(item => {
        let parsedItems: OrderItem[] = [];
        
        if (Array.isArray(item.items)) {
          parsedItems = item.items.map((itemData: any) => ({
            product_id: itemData.product_id || '',
            product_name: itemData.product_name || '',
            quantity: itemData.quantity || 0,
            price: itemData.price || 0,
            total: itemData.total || 0,
            image_url: itemData.image_url
          }));
        }
        
        return {
          id: item.id,
          created_at: item.created_at,
          total: item.total,
          status: transformStatus(item.status),
          payment_status: transformPaymentStatus(item.payment_status),
          payment_method: item.payment_method,
          shipping_address: item.shipping_address,
          items: parsedItems,
          customer_name: item.customers?.name || 'غير معروف',
          customer_email: item.customers?.email || '',
          customer_phone: item.customers?.phone || '',
          notes: item.notes || '',
          tracking_number: item.tracking_number || null,
          delivery_person: item.delivery_person || null
        };
      });
      
      console.log("Transformed orders:", transformedOrders);
      setOrders(transformedOrders);
      
      const pendingCount = data?.filter(order => order.status === 'pending').length || 0;
      setUnreadOrders(pendingCount);
      
    } catch (error) {
      console.error('Error in fetchOrders:', error);
      toast.error("حدث خطأ أثناء تحميل الطلبات");
      throw error;
    } finally {
      setLoading(false);
      console.log("Orders loading finished");
    }
  };

  const transformStatus = (status: string): Order['status'] => {
    const validStatuses: Order['status'][] = ['pending', 'processing', 'ready', 'shipped', 'delivered', 'cancelled'];
    return validStatuses.includes(status as Order['status']) ? status as Order['status'] : 'pending';
  };

  const transformPaymentStatus = (status: string): Order['payment_status'] => {
    const validStatuses: Order['payment_status'][] = ['pending', 'paid', 'failed', 'refunded'];
    return validStatuses.includes(status as Order['payment_status']) ? status as Order['payment_status'] : 'pending';
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      const updates = {
        status,
        updated_at: new Date().toISOString()
      };
      
      const { error } = await supabase
        .from('online_orders')
        .update(updates)
        .eq('id', orderId);
      
      if (error) throw error;
      
      toast.success(`تم تحديث حالة الطلب إلى ${getOrderStatusText(status)}`);
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error("حدث خطأ أثناء تحديث حالة الطلب");
    }
  };

  const confirmPayment = async (orderId: string) => {
    try {
      const { data: orderData, error: fetchError } = await supabase
        .from('online_orders')
        .select('status')
        .eq('id', orderId)
        .single();
      
      if (fetchError) throw fetchError;
      
      let updates: { 
        payment_status: string; 
        updated_at: string;
        status?: string;
      } = { 
        payment_status: 'paid',
        updated_at: new Date().toISOString()
      };
      
      if (orderData.status === 'pending') {
        updates.status = 'processing';
      }
      
      const { error } = await supabase
        .from('online_orders')
        .update(updates)
        .eq('id', orderId);
      
      if (error) throw error;
      
      toast.success('تم تأكيد الدفع بنجاح');
      if (updates.status === 'processing') {
        toast.info('تم تحديث حالة الطلب إلى "قيد المعالجة"');
      }
      
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Error confirming payment:', error);
      toast.error('حدث خطأ أثناء تأكيد الدفع');
    }
  };

  const assignDeliveryPerson = async (orderId: string, deliveryPerson: string, trackingNumber?: string) => {
    try {
      const updates: {
        delivery_person: string;
        tracking_number?: string;
        updated_at: string;
      } = {
        delivery_person: deliveryPerson,
        updated_at: new Date().toISOString()
      };
      
      if (trackingNumber) {
        updates.tracking_number = trackingNumber;
      }
      
      const { error } = await supabase
        .from('online_orders')
        .update(updates)
        .eq('id', orderId);
      
      if (error) throw error;
      
      toast.success('تم تعيين مندوب التوصيل بنجاح');
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Error assigning delivery person:', error);
      toast.error('حدث خطأ أثناء تعيين مندوب التوصيل');
    }
  };

  const cancelOrder = async (orderId: string) => {
    try {
      const { error } = await supabase
        .from('online_orders')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);
      
      if (error) throw error;
      
      toast.success('تم إلغاء الطلب بنجاح');
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error('حدث خطأ أثناء إلغاء الطلب');
    }
  };

  const getOrderStatusText = (status: string): string => {
    switch(status) {
      case 'pending': return 'قيد الانتظار';
      case 'processing': return 'قيد المعالجة';
      case 'ready': return 'جاهز للتوصيل';
      case 'shipped': return 'تم الشحن';
      case 'delivered': return 'تم التسليم';
      case 'cancelled': return 'ملغي';
      default: return 'غير معروف';
    }
  };

  const refreshOrders = () => {
    fetchOrders();
  };

  return {
    orders,
    loading,
    updateOrderStatus,
    confirmPayment,
    assignDeliveryPerson,
    cancelOrder,
    refreshOrders
  };
}
