
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ReturnOrderStatus = 'pending' | 'approved' | 'rejected';

export interface ReturnOrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface ReturnOrder {
  id: string;
  created_at: string;
  updated_at?: string;
  order_id?: string;
  sale_id?: string;
  items: ReturnOrderItem[];
  reason: string;
  status: ReturnOrderStatus;
  total: number;
  requested_by: string;
  approved_by?: string;
  rejection_reason?: string;
  order_type: 'online' | 'pos';
  customer_name?: string;
  customer_phone?: string;
  invoice_number?: string;
}

export const createReturnOrder = async (
  returnOrder: Omit<ReturnOrder, "id" | "created_at" | "status">
): Promise<ReturnOrder | null> => {
  try {
    const { data, error } = await supabase
      .from('return_orders')
      .insert([{
        ...returnOrder,
        status: 'pending'
      }])
      .select()
      .single();

    if (error) throw error;
    
    return data as ReturnOrder;
  } catch (error) {
    console.error("Error creating return order:", error);
    toast.error("حدث خطأ أثناء إنشاء طلب المرتجع");
    return null;
  }
};

export const fetchReturnOrders = async (
  filter?: { status?: ReturnOrderStatus, order_type?: 'online' | 'pos' }
): Promise<ReturnOrder[]> => {
  try {
    let query = supabase
      .from('return_orders')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (filter?.status) {
      query = query.eq('status', filter.status);
    }
    
    if (filter?.order_type) {
      query = query.eq('order_type', filter.order_type);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return data as ReturnOrder[];
  } catch (error) {
    console.error("Error fetching return orders:", error);
    toast.error("حدث خطأ أثناء تحميل طلبات المرتجع");
    return [];
  }
};

export const approveReturnOrder = async (
  id: string, 
  approvedBy: string
): Promise<boolean> => {
  try {
    // 1. First update the return order status
    const { error: updateError } = await supabase
      .from('return_orders')
      .update({
        status: 'approved',
        approved_by: approvedBy,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
      
    if (updateError) throw updateError;
    
    // 2. Get the return order details
    const { data: returnOrder, error: fetchError } = await supabase
      .from('return_orders')
      .select('*')
      .eq('id', id)
      .single();
      
    if (fetchError) throw fetchError;
    
    // 3. Adjust inventory for returned items
    for (const item of returnOrder.items) {
      // Get current product quantity
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('quantity')
        .eq('id', item.product_id)
        .single();
      
      if (productError) {
        console.error(`Error fetching product ${item.product_id}:`, productError);
        continue;
      }
      
      // Update product quantity by adding returned items back to inventory
      const newQuantity = (product.quantity || 0) + item.quantity;
      
      const { error: updateProductError } = await supabase
        .from('products')
        .update({ quantity: newQuantity })
        .eq('id', item.product_id);
      
      if (updateProductError) {
        console.error(`Error updating product ${item.product_id} quantity:`, updateProductError);
      }
    }
    
    // 4. Record a negative transaction to adjust sales records
    if (returnOrder.order_type === 'pos' && returnOrder.sale_id) {
      // Create a negative sale transaction to record the return
      const negativeTransaction = {
        date: new Date().toISOString(),
        items: returnOrder.items,
        subtotal: -returnOrder.total,
        discount: 0,
        total: -returnOrder.total,
        profit: 0, // Actual profit calculation would need cost data
        payment_method: 'cash', // Default to cash for returns
        invoice_number: `RET-${returnOrder.invoice_number || returnOrder.id.slice(0, 8)}`,
        notes: `مرتجع للفاتورة ${returnOrder.invoice_number || ''} - ${returnOrder.reason}`
      };
      
      await supabase.from('sales').insert([negativeTransaction]);
      
      // Add the returned amount back to the store cash register
      await supabase.functions.invoke('add-cash-transaction', {
        body: {
          amount: returnOrder.total,
          transaction_type: 'deposit',
          register_type: 'store',
          notes: `مبلغ مرتجع - ${returnOrder.invoice_number || returnOrder.id.slice(0, 8)}`
        }
      });
    }
    
    return true;
  } catch (error) {
    console.error("Error approving return order:", error);
    toast.error("حدث خطأ أثناء الموافقة على طلب المرتجع");
    return false;
  }
};

export const rejectReturnOrder = async (
  id: string, 
  rejectionReason: string
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('return_orders')
      .update({
        status: 'rejected',
        rejection_reason: rejectionReason,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
      
    if (error) throw error;
    
    return true;
  } catch (error) {
    console.error("Error rejecting return order:", error);
    toast.error("حدث خطأ أثناء رفض طلب المرتجع");
    return false;
  }
};

export const fetchReturnOrderById = async (id: string): Promise<ReturnOrder | null> => {
  try {
    const { data, error } = await supabase
      .from('return_orders')
      .select('*')
      .eq('id', id)
      .single();
      
    if (error) throw error;
    
    return data as ReturnOrder;
  } catch (error) {
    console.error("Error fetching return order:", error);
    return null;
  }
};

export const checkExistingReturn = async (orderId: string): Promise<boolean> => {
  try {
    const { count, error } = await supabase
      .from('return_orders')
      .select('*', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .eq('status', 'pending');
      
    if (error) throw error;
    
    return count !== null && count > 0;
  } catch (error) {
    console.error("Error checking existing return:", error);
    return false;
  }
};
