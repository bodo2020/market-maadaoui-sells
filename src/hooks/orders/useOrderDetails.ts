import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Order } from "@/types";
import { toast } from "sonner";

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
            phone_verified
          )
        `)
        .eq('id', orderId)
        .single();
      
      if (error) throw error;
      
      if (data) {
        const validateOrderStatus = (status: string): Order['status'] => {
          const validStatuses: Order['status'][] = ['waiting', 'ready', 'shipped', 'done'];
          return validStatuses.includes(status as Order['status']) ? status as Order['status'] : 'waiting';
        };
        
        const validatePaymentStatus = (status: string): Order['payment_status'] => {
          const validStatuses: Order['payment_status'][] = ['pending', 'paid', 'failed', 'refunded'];
          return validStatuses.includes(status as Order['payment_status']) ? status as Order['payment_status'] : 'pending';
        };
        
        const transformItems = async (items: any): Promise<any[]> => {
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
          
          const transformedItems = [];
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
        
        const customerName = data.customers?.name || '';
        const customerEmail = data.customers?.email || '';
        const customerPhone = data.customers?.phone || '';
        const customerPhoneVerified = data.customers?.phone_verified || false;
        
        const transformedItems = await transformItems(data.items);
        
        const orderObj = {
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
          delivery_person: data.delivery_person || null
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
        selectedStatus === 'shipped' ? 'تم الشحن' : 'تم التسليم'
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
