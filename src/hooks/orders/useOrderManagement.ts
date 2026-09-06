import { useBranchStore } from "@/stores/branchStore";
import { readCheckoutSnapshot } from "@/services/supabase/checkoutOrderService";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Order } from "@/types";
import { useNotificationStore } from "@/stores/notificationStore";
import { RegisterType } from "@/services/supabase/cashTrackingService";

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
};

export const useOrderManagement = (activeTab: string) => {
  const { currentBranchId } = useBranchStore();
  const requestVersion = useRef(0);
  const [error, setError] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  const { 
    setUnreadOrders, 
    incrementUnreadOrders,
    setUnreadReturns,
    incrementUnreadReturns
  } = useNotificationStore();

  useEffect(() => {
    fetchOrders();
    fetchPendingOrdersCount();
    fetchPendingReturnsCount();
    const channel = subscribeToOrders();
    return () => {
      requestVersion.current++;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [activeTab, ordersRefreshKey, currentBranchId]);

  const fetchPendingOrdersCount = async () => {
    try {
      const { count, error } = await supabase
      .from('online_orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
      
      if (error) throw error;
      
      setUnreadOrders(count || 0);
    } catch (error) {
      console.error('Error fetching pending orders count:', error);
    }
  };

  const fetchPendingReturnsCount = async () => {
    try {
      const { count, error } = await supabase
        .from('returns')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      
      if (error) throw error;
      
      setUnreadReturns(count || 0);
    } catch (error) {
      console.error('Error fetching pending returns count:', error);
    }
  };

  const subscribeToOrders = () => {
    console.log("Setting up realtime subscription to orders");
    const channel = supabase.channel('online-orders-channel')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'online_orders'
      }, payload => {
        console.log("New order received:", payload);
        toast.info("طلب جديد!", {
          description: "تم استلام طلب جديد"
        });
        fetchOrders();
        incrementUnreadOrders();
        fetchPendingOrdersCount();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'online_orders'
      }, payload => {
        console.log("Order updated:", payload);
        const newStatus = payload.new?.status;
        if (newStatus === 'pending') {
          toast.info("تحديث الطلب", {
            description: "تم تحديث طلب إلى حالة المراجعة"
          });
        }
        fetchOrders();
        fetchPendingOrdersCount();
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'returns'
      }, payload => {
        console.log("New return request:", payload);
        toast.warning("طلب إرجاع جديد!", {
          description: "تم استلام طلب إرجاع جديد"
        });
        incrementUnreadReturns();
        fetchPendingReturnsCount();
      })
      .subscribe();
      
    console.log("Subscription channel established:", channel);
    return channel;
  };

  const validateOrderStatus = (status: string): Order['status'] => {
    const validStatuses: Order['status'][] = ['pending', 'confirmed', 'preparing', 'ready', 'shipped', 'delivered', 'cancelled'];
    return validStatuses.includes(status as Order['status']) ? status as Order['status'] : 'pending';
  };

  const validatePaymentStatus = (status: string): Order['payment_status'] => {
    const validStatuses: Order['payment_status'][] = ['pending', 'paid', 'failed', 'refunded'];
    return validStatuses.includes(status as Order['payment_status']) ? status as Order['payment_status'] : 'pending';
  };

  const fetchOrders = async () => {
    const version = ++requestVersion.current;
    try {
      setError(false);
      setLoading(true);
      let query = supabase.from('online_orders')
        .select(`
          *,
          customers (
            id,
            name,
            phone,
            email,
            phone_verified,
            governorate_id,
            city_id,
            area_id,
            neighborhood_id
          )
        `)
        .order('created_at', {
          ascending: false
        });
      
      if (currentBranchId) query = query.eq('branch_id',currentBranchId);
      const data: any[] = [];
      for (let start = 0; ; start += 1000) {
        const response = await query.range(start,start+999);
        if (response.error) throw response.error;
        if (version !== requestVersion.current) return;
        data.push(...(response.data || []));
        if ((response.data?.length || 0) < 1000) break;
      }

      
      
      console.log(`Fetched ${data?.length || 0} orders for tab ${activeTab}`, data);
      
      const transformedOrders: Order[] = [];
      
      // Batch fetch all location data to improve performance
      const allGovernorateIds = [...new Set(data?.map(item => item.customers?.governorate_id).filter(Boolean))];
      const allCityIds = [...new Set(data?.map(item => item.customers?.city_id).filter(Boolean))];
      const allAreaIds = [...new Set(data?.map(item => item.customers?.area_id).filter(Boolean))];
      const allNeighborhoodIds = [...new Set(data?.map(item => item.customers?.neighborhood_id).filter(Boolean))];
      
      // Fetch all location names in parallel
      const [governoratesData, citiesData, areasData, neighborhoodsData] = await Promise.all([
        allGovernorateIds.length > 0 ? supabase.from('governorates').select('id, name').in('id', allGovernorateIds) : Promise.resolve({ data: [] }),
        allCityIds.length > 0 ? supabase.from('cities').select('id, name').in('id', allCityIds) : Promise.resolve({ data: [] }),
        allAreaIds.length > 0 ? supabase.from('areas').select('id, name').in('id', allAreaIds) : Promise.resolve({ data: [] }),
        allNeighborhoodIds.length > 0 ? supabase.from('neighborhoods').select('id, name').in('id', allNeighborhoodIds) : Promise.resolve({ data: [] })
      ]);
      
      // Create lookup maps for fast access
      const governorateMap = new Map<string, string>();
      governoratesData.data?.forEach(g => governorateMap.set(g.id, g.name));
      
      const cityMap = new Map<string, string>();
      citiesData.data?.forEach(c => cityMap.set(c.id, c.name));
      
      const areaMap = new Map<string, string>();
      areasData.data?.forEach(a => areaMap.set(a.id, a.name));
      
      const neighborhoodMap = new Map<string, string>();
      neighborhoodsData.data?.forEach(n => neighborhoodMap.set(n.id, n.name));
      
      for (const item of data || []) {
        const governorate = governorateMap.get(item.customers?.governorate_id) || '';
        const city = cityMap.get(item.customers?.city_id) || '';
        const area = areaMap.get(item.customers?.area_id) || '';
        const neighborhood = neighborhoodMap.get(item.customers?.neighborhood_id) || '';
        
        transformedOrders.push({
          id: item.id,
          created_at: item.created_at,
          total: item.total,
          status: validateOrderStatus(item.status),
          payment_status: validatePaymentStatus(item.payment_status),
          payment_method: item.payment_method,
          shipping_address: item.shipping_address,
          shipping_cost: item.shipping_cost,
          items: Array.isArray(item.items) ? item.items as any[] : [],
          customer_id: item.customer_id,
          customer_name: readCheckoutSnapshot(item).customer_snapshot?.name || item.customers?.name || '',
          customer_email: item.customers?.email || '',
          customer_phone: readCheckoutSnapshot(item).customer_snapshot?.phone || item.customers?.phone || '',
          customer_phone_verified: Boolean(item.customers?.phone_verified),
          notes: item.notes || '',
          tracking_number: item.tracking_number || null,
          delivery_person: item.delivery_person || null,
          return_status: (item.return_status === 'partial' || item.return_status === 'full') ? item.return_status : 'none',
          governorate,
          city,
          area,
          neighborhood
        });
      }
      
      if (version === requestVersion.current) setOrders(transformedOrders);
    } catch (error) {
      if (version !== requestVersion.current) return;
      setError(true);
      console.error('Error fetching orders:', error);
      toast.error("حدث خطأ أثناء تحميل الطلبات");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };

  const handleOrderUpdate = useCallback(() => {
    setOrdersRefreshKey(prev => prev + 1);
  }, []);

  return {
    orders,
    loading,
    error,
    handleOrderUpdate,
    fetchOrders
  };
};

