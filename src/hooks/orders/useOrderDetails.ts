import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Order, OrderItem } from "@/types";
import { toast } from "sonner";

interface CustomerData {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  phone_verified?: boolean;
  governorate_id?: string;
  city_id?: string;
  area_id?: string;
  neighborhood_id?: string;
}

export function useOrderDetails(orderId: string) {
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<Order['status'] | null>(null);

  const fetchOrder = async () => {
    try {
      setIsLoading(true);
      console.log("Fetching order details for ID:", orderId);
      
      const { data, error } = await supabase.from('online_orders')
        .select(`
          *,
          customers(
            id,
            name,
            email,
            phone,
            phone_verified,
            governorate_id,
            city_id,
            area_id,
            neighborhood_id
          )
        `)
        .eq('id', orderId)
        .single();
      
      if (error) throw error;
      
      if (data) {
        const validateOrderStatus = (status: string): Order['status'] => {
          const validStatuses: Order['status'][] = ['pending', 'confirmed', 'preparing', 'ready', 'shipped', 'delivered', 'cancelled'];
          return validStatuses.includes(status as Order['status']) ? status as Order['status'] : 'pending';
        };
        
        const validatePaymentStatus = (status: string): Order['payment_status'] => {
          const validStatuses: Order['payment_status'][] = ['pending', 'paid', 'failed', 'refunded'];
          return validStatuses.includes(status as Order['payment_status']) ? status as Order['payment_status'] : 'pending';
        };
        
        const transformItems = async (items: any): Promise<OrderItem[]> => {
          if (!Array.isArray(items)) {
            try {
              if (typeof items === 'string') {
                items = JSON.parse(items);
              }
              if (!Array.isArray(items)) {
                items = [items];
              }
            } catch (e) {
              console.error("Error parsing items:", e);
              return [];
            }
          }
          
          const transformedItems: OrderItem[] = [];
          for (const item of items) {
            const { data: product } = await supabase
              .from('products')
              .select('*')
              .eq('id', item.product_id)
              .single();

            transformedItems.push({
              product_id: item.product_id || '',
              product_name: product?.name || item.product_name || '',
              quantity: item.quantity || 0,
              price: item.price || 0,
              total: item.total || item.price * item.quantity || 0,
              image_url: product?.image_urls?.[0] || null,
              barcode: item.barcode || product?.barcode || null,
              is_bulk: product?.bulk_enabled && item.barcode === product?.bulk_barcode,
              is_weight_based: product?.barcode_type === 'scale',
              bulk_quantity: product?.bulk_quantity
            });
          }
          
          return transformedItems;
        };
        
        // Handle customer data safely with proper typing
        const customerData = (data.customers || {}) as CustomerData;
        
        // Extract customer properties with safe fallbacks
        const customerName = customerData.name || '';
        const customerEmail = customerData.email || '';
        const customerPhone = customerData.phone || '';
        const customerPhoneVerified = Boolean(customerData.phone_verified);
        
        const transformedItems = await transformItems(data.items);
        
        // Fetch location names if IDs exist
        let governorate = '';
        let city = '';
        let area = '';
        let neighborhood = '';
        
        if (customerData.governorate_id) {
          const { data: govData } = await supabase
            .from('governorates')
            .select('name')
            .eq('id', customerData.governorate_id)
            .single();
          governorate = govData?.name || '';
        }
        
        if (customerData.city_id) {
          const { data: cityData } = await supabase
            .from('cities')
            .select('name')
            .eq('id', customerData.city_id)
            .single();
          city = cityData?.name || '';
        }
        
        if (customerData.area_id) {
          const { data: areaData } = await supabase
            .from('areas')
            .select('name')
            .eq('id', customerData.area_id)
            .single();
          area = areaData?.name || '';
        }
        
        if (customerData.neighborhood_id) {
          const { data: neighborhoodData } = await supabase
            .from('neighborhoods')
            .select('name')
            .eq('id', customerData.neighborhood_id)
            .single();
          neighborhood = neighborhoodData?.name || '';
        }
        
        const orderObj: Order = {
          id: data.id,
          created_at: data.created_at,
          total: data.total,
          status: validateOrderStatus(data.status),
          payment_status: validatePaymentStatus(data.payment_status),
          payment_method: data.payment_method,
          shipping_address: data.shipping_address,
          items: transformedItems,
          customer_id: data.customer_id,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          customer_phone_verified: customerPhoneVerified,
          notes: data.notes || '',
          tracking_number: data.tracking_number || null,
          delivery_person: data.delivery_person || null,
          governorate,
          city,
          area,
          neighborhood
        };
        
        console.log("Parsed order:", orderObj);
        setOrder(orderObj);
        if (selectedStatus === null || selectedStatus === orderObj.status) {
          setSelectedStatus(null);
        }
      }
    } catch (error) {
      console.error('Error fetching order:', error);
      toast.error("حدث خطأ أثناء تحميل الطلب");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async () => {
    if (!order || !selectedStatus || order.status === selectedStatus || isUpdatingStatus) return;
    
    try {
      setIsUpdatingStatus(true);
      console.log("Updating order status to:", selectedStatus, "for order ID:", orderId);
      
      const currentTime = new Date().toISOString();
      const user = await supabase.auth.getUser();
      const cashierId = user.data.user?.id;
      
      const { error, data } = await supabase
        .from('online_orders')
        .update({ 
          status: selectedStatus,
          updated_at: currentTime,
          cashier_id: cashierId
        })
        .eq('id', orderId)
        .select();
      
      if (error) {
        console.error("Supabase update error:", error);
        throw error;
      }
      
      console.log("Status update response:", data);
      console.log("Status updated successfully in Supabase");
      
      setOrder(prev => prev ? { ...prev, status: selectedStatus } : null);
      
      toast.success(`تم تحديث حالة الطلب إلى ${
        selectedStatus === 'waiting' ? 'في الانتظار' : 
        selectedStatus === 'ready' ? 'جاهز للشحن' : 
        selectedStatus === 'shipped' ? 'تم الشحن' : 
        selectedStatus === 'cancelled' ? 'ملغي' : 'تم التسليم'
      }`);
      
      setSelectedStatus(null);
      await fetchOrder();
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('حدث خطأ أثناء تحديث حالة الطلب');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  return {
    order,
    isLoading,
    isUpdatingStatus,
    selectedStatus,
    setSelectedStatus,
    handleStatusChange,
    fetchOrder
  };
}
