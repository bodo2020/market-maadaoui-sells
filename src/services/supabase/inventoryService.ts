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
  branch_id?: string;
  // بيانات المنتج المرتبط
  products?: {
    id: string;
    name: string;
    barcode?: string;
    image_urls?: string[];
    unit_of_measure?: string;
    shelf_location?: string;
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
  status: 'active' | 'completed' | 'approved';
  created_by?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

// إنشاء سجلات جرد جديدة
export const createInventoryRecords = async (
  products: Array<{
    product_id: string;
    expected_quantity: number;
    purchase_price: number;
  }>,
  branchId?: string
) => {
  console.log(`Creating inventory records for ${products.length} products, branch: ${branchId}`);
  
  const currentDate = new Date().toISOString().slice(0, 10);
  
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
        status: 'pending' as const,
        branch_id: branchId || null
      }))
    )
    .select();

  if (error) {
    console.error('Error creating inventory records:', error);
    throw error;
  }
  
  // Create inventory session for this branch
  if (branchId) {
    await supabase
      .from('inventory_sessions')
      .insert({
        session_date: currentDate,
        branch_id: branchId,
        status: 'active',
        total_products: products.length,
        completed_products: 0,
        matched_products: 0,
        discrepancy_products: 0,
        total_difference_value: 0
      });
  }
  
  console.log(`Successfully created ${data?.length || 0} inventory records`);
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
export const fetchInventoryRecordsByDate = async (date: string, branchId?: string) => {
  console.log(`Fetching inventory records for date: ${date}, branch: ${branchId}`);
  
  // إذا لم يتم تمرير branchId، استخدم الفرع الحالي من localStorage
  let targetBranchId = branchId;
  if (!targetBranchId) {
    targetBranchId = typeof window !== 'undefined' ? localStorage.getItem('currentBranchId') : null;
  }

  let query = supabase
    .from('inventory_records')
    .select(`
      *,
      products (
        id,
        name,
        barcode,
        image_urls,
        unit_of_measure,
        shelf_location
      )
    `)
    .eq('inventory_date', date)
    .order('created_at', { ascending: false });

  // Only add branch filter if branchId is provided and not null
  if (targetBranchId && targetBranchId !== 'null') {
    query = query.eq('branch_id', targetBranchId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching inventory records:', error);
    throw error;
  }
  
  console.log(`Found ${data?.length || 0} inventory records`);
  return data as InventoryRecord[];
};

// جلب جلسات الجرد
export const fetchInventorySessions = async (branchId?: string) => {
  let query = supabase
    .from('inventory_sessions')
    .select('*')
    .order('session_date', { ascending: false });

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data as InventorySession[];
};

// جلب جلسة جرد بالتاريخ
export const fetchInventorySessionByDate = async (date: string, branchId?: string) => {
  let query = supabase
    .from('inventory_sessions')
    .select('*')
    .eq('session_date', date);

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data as InventorySession | null;
};

// حذف سجلات جرد لتاريخ معين
export const deleteInventoryRecordsByDate = async (date: string, branchId?: string) => {
  let query = supabase
    .from('inventory_records')
    .delete()
    .eq('inventory_date', date);

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { error } = await query;

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

// إكمال جلسة جرد بناءً على التاريخ
export const completeInventorySessionByDate = async (date: string, branchId?: string) => {
  let query = supabase
    .from('inventory_sessions')
    .update({ status: 'completed' })
    .eq('session_date', date)
    .eq('status', 'active');

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data, error } = await query.select();

  if (error) throw error;
  return data[0];
};

// جلب إحصائيات الجرد
export const fetchInventoryStats = async (branchId?: string) => {
  let query = supabase
    .from('inventory_sessions')
    .select('*')
    .order('session_date', { ascending: false })
    .limit(12);

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data: sessions, error } = await query;

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
    const alert = item.inventory_alerts;
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
    const alert = item.inventory_alerts;
    if (!alert || !alert.alert_enabled || !alert.min_stock_level) return false;
    return (item.quantity || 0) < alert.min_stock_level;
  }) || [];
  
  const normalStock = data?.filter(item => {
    const alert = item.inventory_alerts;
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

// الموافقة على الجرد وتحديث الكميات
export const approveInventorySession = async (sessionId: string) => {
  console.log(`Approving inventory session: ${sessionId}`);
  
  try {
    // جلب session details أولاً
    const { data: session, error: sessionError } = await supabase
      .from('inventory_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError) throw sessionError;

    // التحقق من أن الجرد مكتمل
    if (session.status !== 'completed') {
      throw new Error('يجب أن يكون الجرد مكتملاً أولاً');
    }

    // جلب جميع inventory records للجلسة
    const { data: records, error: recordsError } = await supabase
      .from('inventory_records')
      .select('*')
      .eq('inventory_date', session.session_date)
      .neq('status', 'pending');

    if (recordsError) throw recordsError;

    // تحديث الكميات في جدول inventory للفرع المحدد
    for (const record of records) {
      let updateQuery = supabase
        .from('inventory')
        .update({ 
          quantity: record.actual_quantity,
          updated_at: new Date().toISOString()
        })
        .eq('product_id', record.product_id);
      
      // Add branch filter if available
      if (record.branch_id) {
        updateQuery = updateQuery.eq('branch_id', record.branch_id);
      }
      
      await updateQuery;
        
      console.log(`Updated inventory for product ${record.product_id} in branch ${record.branch_id}: ${record.actual_quantity}`);
    }

    // تحديث حالة session إلى approved
    const { data: updatedSession, error: updateError } = await supabase
      .from('inventory_sessions')
      .update({ 
        status: 'approved',
        approved_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log(`Successfully approved inventory session ${sessionId}`);
    return updatedSession;
  } catch (error) {
    console.error('Error approving inventory session:', error);
    throw error;
  }
};

// حذف جلسة جرد
export const deleteInventorySession = async (sessionId: string, sessionDate: string, branchId?: string) => {
  console.log(`Deleting inventory session: ${sessionId} for date: ${sessionDate}, branch: ${branchId}`);
  
  try {
    // حذف جميع inventory records أولاً
    let deleteRecordsQuery = supabase
      .from('inventory_records')
      .delete()
      .eq('inventory_date', sessionDate);
    
    if (branchId) {
      deleteRecordsQuery = deleteRecordsQuery.eq('branch_id', branchId);
    }

    const { error: recordsError } = await deleteRecordsQuery;
    if (recordsError) throw recordsError;

    // حذف الجلسة
    const { error: sessionError } = await supabase
      .from('inventory_sessions')
      .delete()
      .eq('id', sessionId);

    if (sessionError) throw sessionError;

    console.log(`Successfully deleted inventory session ${sessionId}`);
    return true;
  } catch (error) {
    console.error('Error deleting inventory session:', error);
    throw error;
  }
};