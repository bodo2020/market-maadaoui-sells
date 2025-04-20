
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Order } from "@/types";

export const useOrderDetails = (orderId: string) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<Order['status']>("waiting");

  const fetchOrder = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('online_orders')
        .select('*')
        .eq('id', orderId)
        .single();
      
      if (error) throw error;
      
      const orderData: Order = {
        id: data.id,
        created_at: data.created_at,
        total: data.total,
        status: data.status,
        payment_status: data.payment_status,
        payment_method: data.payment_method,
        shipping_address: data.shipping_address,
        items: Array.isArray(data.items) ? data.items : [],
        customer_name: data.customer_name || 'غير معروف',
        customer_email: data.customer_email || '',
        customer_phone: data.customer_phone || '',
        notes: data.notes || '',
        tracking_number: data.tracking_number || null,
        delivery_person: data.delivery_person || null,
        is_returned: data.is_returned || false,
        is_cancelled: data.is_cancelled || false
      };
      
      setOrder(orderData);
      setSelectedStatus(orderData.status);
    } catch (error) {
      console.error('Error fetching order:', error);
      toast.error("حدث خطأ أثناء تحميل بيانات الطلب");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  const handleStatusChange = async () => {
    if (!order || selectedStatus === order.status || isUpdatingStatus) return;
    
    try {
      setIsUpdatingStatus(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({
          status: selectedStatus,
          updated_at: new Date().toISOString(),
          is_returned: selectedStatus === "returned",
          is_cancelled: selectedStatus === "cancelled"
        })
        .eq('id', order.id);
      
      if (error) throw error;
      
      fetchOrder();
      toast.success(`تم تحديث حالة الطلب إلى ${selectedStatus}`);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error("حدث خطأ أثناء تحديث حالة الطلب");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return {
    order,
    isLoading,
    isUpdatingStatus,
    selectedStatus,
    setSelectedStatus,
    handleStatusChange,
    fetchOrder
  };
};
