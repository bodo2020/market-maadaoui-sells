import { supabase } from "@/integrations/supabase/client";

export interface InventoryRecord {
  id: string;
  inventory_date: string;
  product_id: string;
  expected_quantity: number;
  actual_quantity: number;
  difference: number;
  purchase_price: number;
  difference_value: number;
  status: 'pending' | 'checked' | 'discrepancy';
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // بيانات المنتج المرتبط
  products?: {
    id: string;
    name: string;
    barcode?: string;
    image_urls?: string[];
    unit_of_measure?: string;
  };
}

export interface InventorySession {
  id: string;
  session_date: string;
  total_products: number;
  completed_products: number;
  matched_products: number;
  discrepancy_products: number;
  total_difference_value: number;
  status: 'active' | 'completed';
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// إنشاء سجلات جرد جديدة
export const createInventoryRecords = async (
  products: Array<{
    product_id: string;
    expected_quantity: number;
    purchase_price: number;
  }>
) => {
  const { data, error } = await supabase
    .from('inventory_records')
    .insert(
      products.map(product => ({
        product_id: product.product_id,
        expected_quantity: product.expected_quantity,
        actual_quantity: 0,
        difference: -product.expected_quantity,
        purchase_price: product.purchase_price,
        difference_value: -product.expected_quantity * product.purchase_price,
        status: 'pending' as const
      }))
    )
    .select();

  if (error) throw error;
  return data;
};

// تحديث سجل جرد
export const updateInventoryRecord = async (
  id: string,
  updates: {
    actual_quantity: number;
    notes?: string;
  }
) => {
  // جلب السجل الحالي لحساب الفروقات
  const { data: record, error: fetchError } = await supabase
    .from('inventory_records')
    .select('expected_quantity, purchase_price')
    .eq('id', id)
    .single();

  if (fetchError) throw fetchError;

  const difference = updates.actual_quantity - record.expected_quantity;
  const difference_value = difference * record.purchase_price;
  const status = difference === 0 ? 'checked' : 'discrepancy';

  const { data, error } = await supabase
    .from('inventory_records')
    .update({
      actual_quantity: updates.actual_quantity,
      difference,
      difference_value,
      status,
      notes: updates.notes
    })
    .eq('id', id)
    .select();

  if (error) throw error;
  return data[0];
};

// جلب سجلات الجرد لتاريخ معين
export const fetchInventoryRecordsByDate = async (date: string) => {
  const { data, error } = await supabase
    .from('inventory_records')
    .select(`
      *,
      products (
        id,
        name,
        barcode,
        image_urls,
        unit_of_measure
      )
    `)
    .eq('inventory_date', date)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as InventoryRecord[];
};

// جلب جلسات الجرد
export const fetchInventorySessions = async () => {
  const { data, error } = await supabase
    .from('inventory_sessions')
    .select('*')
    .order('session_date', { ascending: false });

  if (error) throw error;
  return data as InventorySession[];
};

// جلب جلسة جرد بالتاريخ
export const fetchInventorySessionByDate = async (date: string) => {
  const { data, error } = await supabase
    .from('inventory_sessions')
    .select('*')
    .eq('session_date', date)
    .maybeSingle();

  if (error) throw error;
  return data as InventorySession | null;
};

// حذف سجلات جرد لتاريخ معين
export const deleteInventoryRecordsByDate = async (date: string) => {
  const { error } = await supabase
    .from('inventory_records')
    .delete()
    .eq('inventory_date', date);

  if (error) throw error;
};

// إكمال جلسة جرد
export const completeInventorySession = async (sessionId: string) => {
  const { data, error } = await supabase
    .from('inventory_sessions')
    .update({ status: 'completed' })
    .eq('id', sessionId)
    .select();

  if (error) throw error;
  return data[0];
};

// جلب إحصائيات الجرد
export const fetchInventoryStats = async () => {
  const { data: sessions, error } = await supabase
    .from('inventory_sessions')
    .select('*')
    .order('session_date', { ascending: false })
    .limit(12);

  if (error) throw error;

  return {
    recent_sessions: sessions as InventorySession[],
    total_sessions: sessions.length,
    total_discrepancy_value: sessions.reduce((sum, session) => 
      sum + (session.total_difference_value || 0), 0
    )
  };
};

// جلب المنتجات التي تحتاج تنبيه (أقل من الحد الأدنى)
export const fetchLowStockProducts = async () => {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      inventory_alerts (
        min_stock_level,
        alert_enabled
      )
    `)
    .order('quantity', { ascending: true });

  if (error) throw error;
  
  // فلترة المنتجات التي تحتاج تنبيه وتم تفعيل التنبيه لها
  const lowStockItems = data?.filter(item => {
    const alert = item.inventory_alerts?.[0];
    if (!alert || !alert.alert_enabled || !alert.min_stock_level) return false;
    return (item.quantity || 0) < alert.min_stock_level;
  }) || [];
  
  return lowStockItems;
};

// جلب جميع معلومات المخزون مع التنبيهات
export const fetchInventoryWithAlerts = async () => {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      inventory_alerts (
        min_stock_level,
        alert_enabled
      )
    `)
    .order('quantity', { ascending: true });

  if (error) throw error;
  
  // تصنيف المنتجات حسب حالة المخزون
  const lowStock = data?.filter(item => {
    const alert = item.inventory_alerts?.[0];
    if (!alert || !alert.alert_enabled || !alert.min_stock_level) return false;
    return (item.quantity || 0) < alert.min_stock_level;
  }) || [];
  
  const normalStock = data?.filter(item => {
    const alert = item.inventory_alerts?.[0];
    if (!alert || !alert.alert_enabled || !alert.min_stock_level) return true;
    return (item.quantity || 0) >= alert.min_stock_level;
  }) || [];

  return {
    all: data || [],
    lowStock,
    normalStock,
    totalProducts: data?.length || 0,
    lowStockCount: lowStock.length,
  };
};

// حفظ إعدادات التنبيه للمنتج
export const saveInventoryAlert = async (productId: string, minStockLevel: number | null, alertEnabled: boolean) => {
  const { data, error } = await supabase
    .from('inventory_alerts')
    .upsert({
      product_id: productId,
      min_stock_level: minStockLevel,
      alert_enabled: alertEnabled
    }, {
      onConflict: 'product_id'
    })
    .select();

  if (error) throw error;
  return data[0];
};

// جلب إعدادات التنبيه للمنتج
export const getInventoryAlert = async (productId: string) => {
  const { data, error } = await supabase
    .from('inventory_alerts')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle();

  if (error) throw error;
  return data;
};