
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
  rejected_by?: string;
  rejection_reason?: string;
  order_type: 'online' | 'pos';
  customer_name?: string;
  customer_phone?: string;
}

// This function creates a table for return orders if it doesn't exist
// This should be called when the app initializes
export const setupReturnOrdersTable = async () => {
  try {
    // Check if the table exists first
    const { error } = await supabase
      .from('return_orders')
      .select('id')
      .limit(1);
    
    // If we get a specific error about the table not existing, create it
    if (error && error.message.includes('does not exist')) {
      console.log('Return orders table does not exist, creating it...');
      
      // You would typically run this SQL in a migration
      // For this example, we're showing how you might handle it in code
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS return_orders (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          order_id UUID,
          sale_id UUID,
          items JSONB NOT NULL,
          reason TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          total NUMERIC NOT NULL,
          requested_by UUID REFERENCES users(id),
          approved_by UUID REFERENCES users(id),
          rejected_by UUID REFERENCES users(id),
          rejection_reason TEXT,
          order_type TEXT NOT NULL,
          customer_name TEXT,
          customer_phone TEXT
        );
      `;
      
      // You would run this SQL using a separate migration tool or Supabase dashboard
      // The following is conceptual and won't work directly with Supabase JS client
      toast.info('Return orders system is being set up. Please check the database schema.');
    }
  } catch (error) {
    console.error('Error checking/creating return_orders table:', error);
  }
};

export const createReturnOrder = async (returnOrder: Omit<ReturnOrder, 'id' | 'created_at' | 'status'>) => {
  try {
    const { data, error } = await supabase
      .from('return_orders')
      .insert({
        ...returnOrder,
        status: 'pending',
      })
      .select()
      .single();
    
    if (error) throw error;
    
    toast.success('تم إنشاء طلب الإرجاع بنجاح');
    return data as ReturnOrder;
  } catch (error) {
    console.error('Error creating return order:', error);
    toast.error('حدث خطأ أثناء إنشاء طلب الإرجاع');
    throw error;
  }
};

export const getReturnOrders = async (status?: ReturnOrderStatus) => {
  try {
    let query = supabase.from('return_orders').select('*');
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Transform the data to ensure it matches our ReturnOrder interface
    return (data || []).map(item => ({
      id: item.id,
      created_at: item.created_at,
      updated_at: item.updated_at,
      order_id: item.order_id,
      sale_id: item.sale_id,
      items: item.items,
      reason: item.reason,
      status: item.status,
      total: item.total,
      requested_by: item.requested_by,
      approved_by: item.approved_by,
      rejected_by: item.rejected_by,
      rejection_reason: item.rejection_reason,
      order_type: item.order_type,
      customer_name: item.customer_name,
      customer_phone: item.customer_phone
    })) as ReturnOrder[];
  } catch (error) {
    console.error('Error fetching return orders:', error);
    toast.error('حدث خطأ أثناء تحميل طلبات الإرجاع');
    throw error;
  }
};

export const approveReturnOrder = async (
  id: string, 
  approverId: string,
  updateInventory: boolean = true
) => {
  try {
    const { data: returnOrder, error: fetchError } = await supabase
      .from('return_orders')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError) throw fetchError;
    
    const { error } = await supabase
      .from('return_orders')
      .update({
        status: 'approved',
        approved_by: approverId,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (error) throw error;
    
    // Here you would also update inventory if updateInventory is true
    // And update original orders/sales if needed
    
    toast.success('تم الموافقة على طلب الإرجاع');
    return true;
  } catch (error) {
    console.error('Error approving return order:', error);
    toast.error('حدث خطأ أثناء الموافقة على طلب الإرجاع');
    throw error;
  }
};

export const rejectReturnOrder = async (
  id: string, 
  rejecterId: string, 
  reason: string
) => {
  try {
    const { error } = await supabase
      .from('return_orders')
      .update({
        status: 'rejected',
        rejected_by: rejecterId,
        rejection_reason: reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (error) throw error;
    
    toast.success('تم رفض طلب الإرجاع');
    return true;
  } catch (error) {
    console.error('Error rejecting return order:', error);
    toast.error('حدث خطأ أثناء رفض طلب الإرجاع');
    throw error;
  }
};
