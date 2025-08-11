import { supabase } from "@/integrations/supabase/client";
import { useBranchStore } from "@/stores/branchStore";

export interface InventoryItem {
  id: string;
  product_id: string;
  branch_id: string;
  quantity: number;
  min_stock_level?: number;
  max_stock_level?: number;
  reorder_point?: number;
  created_at: string;
  updated_at: string;
  product?: {
    name: string;
    price: number;
    purchase_price: number;
    barcode?: string;
  };
}

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

// جلب المخزون للفرع المحدد
export async function fetchInventoryByBranch(branchId?: string): Promise<InventoryItem[]> {
  try {
    // استخدام الفرع المحدد أو الفرع الحالي
    const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
    
    if (!targetBranchId) {
      console.warn("No branch selected");
      return [];
    }

    const { data, error } = await supabase
      .from("inventory")
      .select(`
        id,
        product_id,
        branch_id,
        quantity,
        min_stock_level,
        max_stock_level,
        created_at,
        updated_at,
        products:product_id (
          name,
          price,
          purchase_price,
          barcode
        )
      `)
      .eq("branch_id", targetBranchId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching inventory:", error);
      throw error;
    }

    return (data || []).map(item => ({
      ...item,
      product: Array.isArray(item.products) ? item.products[0] : item.products
    })) as InventoryItem[];
  } catch (error) {
    console.error("Error in fetchInventoryByBranch:", error);
    return [];
  }
}

// تحديث كمية المخزون لمنتج في فرع معين
export async function updateInventoryQuantity(
  productId: string, 
  newQuantity: number, 
  branchId?: string
): Promise<boolean> {
  try {
    const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
    
    if (!targetBranchId) {
      throw new Error("No branch selected");
    }

    const { error } = await supabase
      .from("inventory")
      .upsert({
        product_id: productId,
        branch_id: targetBranchId,
        quantity: newQuantity,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'product_id,branch_id'
      });

    if (error) {
      console.error("Error updating inventory quantity:", error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error("Error in updateInventoryQuantity:", error);
    throw error;
  }
}

// جلب المنتجات منخفضة المخزون للفرع المحدد
export async function getLowStockProducts(threshold?: number, branchId?: string) {
  try {
    const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
    
    if (!targetBranchId) {
      console.warn("No branch selected");
      return [];
    }

    let query = supabase
      .from("inventory")
      .select(`
        id,
        product_id,
        quantity,
        min_stock_level,
        products:product_id (
          name,
          price,
          purchase_price
        )
      `)
      .eq("branch_id", targetBranchId);

    // استخدام min_stock_level إذا لم يتم تمرير threshold
    if (threshold !== undefined) {
      query = query.lte("quantity", threshold);
    } else {
      query = query.filter("quantity", "lte", "min_stock_level");
    }

    const { data, error } = await query.order("quantity", { ascending: true });

    if (error) {
      console.error("Error fetching low stock products:", error);
      throw error;
    }

    return (data || []).map(item => ({
      ...item,
      product: Array.isArray(item.products) ? item.products[0] : item.products
    }));
  } catch (error) {
    console.error("Error in getLowStockProducts:", error);
    return [];
  }
}

// إضافة منتج جديد للمخزون في فرع معين
export async function addProductToInventory(
  productId: string,
  quantity: number,
  branchId?: string,
  minStockLevel: number = 5
): Promise<InventoryItem | null> {
  try {
    const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
    
    if (!targetBranchId) {
      throw new Error("No branch selected");
    }

    const { data, error } = await supabase
      .from("inventory")
      .upsert({
        product_id: productId,
        branch_id: targetBranchId,
        quantity,
        min_stock_level: minStockLevel
      }, {
        onConflict: 'product_id,branch_id'
      })
      .select(`
        id,
        product_id,
        branch_id,
        quantity,
        min_stock_level,
        max_stock_level,
        created_at,
        updated_at
      `)
      .single();

    if (error) {
      console.error("Error adding product to inventory:", error);
      throw error;
    }

    return data as InventoryItem;
  } catch (error) {
    console.error("Error in addProductToInventory:", error);
    return null;
  }
}

// إزالة منتج من مخزون فرع معين
export async function removeProductFromInventory(
  productId: string,
  branchId?: string
): Promise<boolean> {
  try {
    const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
    
    if (!targetBranchId) {
      throw new Error("No branch selected");
    }

    const { error } = await supabase
      .from("inventory")
      .delete()
      .eq("product_id", productId)
      .eq("branch_id", targetBranchId);

    if (error) {
      console.error("Error removing product from inventory:", error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error("Error in removeProductFromInventory:", error);
    return false;
  }
}

// تحديث حدود المخزون (الحد الأدنى والأقصى)
export async function updateStockLevels(
  productId: string,
  minStockLevel?: number,
  maxStockLevel?: number,
  reorderPoint?: number,
  branchId?: string
): Promise<boolean> {
  try {
    const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
    
    if (!targetBranchId) {
      throw new Error("No branch selected");
    }

    const updateData: any = { updated_at: new Date().toISOString() };
    
    if (minStockLevel !== undefined) updateData.min_stock_level = minStockLevel;
    if (maxStockLevel !== undefined) updateData.max_stock_level = maxStockLevel;
    if (reorderPoint !== undefined) updateData.reorder_point = reorderPoint;

    const { error } = await supabase
      .from("inventory")
      .update(updateData)
      .eq("product_id", productId)
      .eq("branch_id", targetBranchId);

    if (error) {
      console.error("Error updating stock levels:", error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error("Error in updateStockLevels:", error);
    return false;
  }
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

// جلب المنتجات التي تحتاج تنبيه (أقل من الحد الأدنى) للفرع المحدد
export const fetchLowStockProducts = async (branchId?: string) => {
  const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
  
  if (!targetBranchId) {
    console.warn("No branch selected");
    return [];
  }

  const { data, error } = await supabase
    .from('inventory')
    .select(`
      *,
      products:product_id (
        name,
        price,
        purchase_price,
        barcode
      )
    `)
    .eq('branch_id', targetBranchId)
    .filter('quantity', 'lte', 'min_stock_level')
    .order('quantity', { ascending: true });

  if (error) throw error;
  
  return (data || []).map(item => ({
    ...item,
    product: Array.isArray(item.products) ? item.products[0] : item.products
  }));
};

// جلب جميع معلومات المخزون مع التنبيهات للفرع المحدد
export const fetchInventoryWithAlerts = async (branchId?: string) => {
  const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
  
  if (!targetBranchId) {
    console.warn("No branch selected");
    return {
      all: [],
      lowStock: [],
      normalStock: [],
      totalProducts: 0,
      lowStockCount: 0,
    };
  }

  const { data, error } = await supabase
    .from('inventory')
    .select(`
      *,
      products:product_id (
        name,
        price,
        purchase_price,
        barcode
      )
    `)
    .eq('branch_id', targetBranchId)
    .order('quantity', { ascending: true });

  if (error) throw error;
  
  const all = (data || []).map(item => ({
    ...item,
    product: Array.isArray(item.products) ? item.products[0] : item.products
  }));
  
  // تصنيف المنتجات حسب حالة المخزون
  const lowStock = all.filter(item => 
    item.min_stock_level && item.quantity < item.min_stock_level
  );
  
  const normalStock = all.filter(item => 
    !item.min_stock_level || item.quantity >= item.min_stock_level
  );

  return {
    all,
    lowStock,
    normalStock,
    totalProducts: all.length,
    lowStockCount: lowStock.length,
  };
};

// حفظ إعدادات التنبيه للمنتج
export const saveInventoryAlert = async (productId: string, minStockLevel: number | null, alertEnabled: boolean) => {
  return await updateStockLevels(productId, minStockLevel || undefined);
};

// جلب إعدادات التنبيه للمنتج  
export const getInventoryAlert = async (productId: string) => {
  const targetBranchId = useBranchStore.getState().currentBranchId;
  if (!targetBranchId) return null;
  
  const { data } = await supabase
    .from('inventory')
    .select('min_stock_level')
    .eq('product_id', productId)
    .eq('branch_id', targetBranchId)
    .single();
    
  return { min_stock_level: data?.min_stock_level, alert_enabled: !!data?.min_stock_level };
};