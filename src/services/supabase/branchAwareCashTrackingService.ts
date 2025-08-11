import { supabase } from "@/integrations/supabase/client";
import { useBranchStore } from "@/stores/branchStore";

export interface CashTrackingRecord {
  id: string;
  date: string;
  opening_balance: number;
  closing_balance: number;
  difference: number;
  register_type: string;
  branch_id?: string;
  notes?: string;
  created_by?: string;
  verified_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CashTransaction {
  id: string;
  transaction_date: string;
  amount: number;
  transaction_type: string;
  register_type: string;
  balance_after: number;
  branch_id?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
}

// جلب سجلات تتبع النقدية للفرع المحدد
export async function getCashTrackingRecords(
  startDate?: string,
  endDate?: string,
  registerType?: string,
  branchId?: string
): Promise<CashTrackingRecord[]> {
  try {
    const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
    
    let query = supabase
      .from('cash_tracking')
      .select('*')
      .order('date', { ascending: false });
      
    if (targetBranchId) {
      query = query.eq('branch_id', targetBranchId);
    }
    
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    if (registerType) query = query.eq('register_type', registerType);

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching cash tracking records:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getCashTrackingRecords:', error);
    return [];
  }
}

// جلب المعاملات النقدية للفرع المحدد
export async function getCashTransactions(
  startDate?: string,
  endDate?: string,
  registerType?: string,
  branchId?: string
): Promise<CashTransaction[]> {
  try {
    const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
    
    let query = supabase
      .from('cash_transactions')
      .select('*')
      .order('transaction_date', { ascending: false });
      
    if (targetBranchId) {
      query = query.eq('branch_id', targetBranchId);
    }
    
    if (startDate) query = query.gte('transaction_date', startDate);
    if (endDate) query = query.lte('transaction_date', endDate);
    if (registerType) query = query.eq('register_type', registerType);

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching cash transactions:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getCashTransactions:', error);
    return [];
  }
}

// إضافة معاملة نقدية جديدة للفرع
export async function addCashTransaction(
  amount: number,
  transactionType: 'deposit' | 'withdrawal',
  registerType: string,
  notes?: string,
  branchId?: string
): Promise<CashTransaction | null> {
  try {
    const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
    
    // استدعاء دالة إضافة المعاملة النقدية
    const { data, error } = await supabase.rpc('add_cash_transaction', {
      p_amount: amount,
      p_transaction_type: transactionType,
      p_register_type: registerType,
      p_notes: notes || ''
    });

    if (error) {
      console.error('Error adding cash transaction:', error);
      throw error;
    }

    // إضافة branch_id للمعاملة إذا لم تكن الدالة تدعمه
    if (targetBranchId) {
      await supabase
        .from('cash_transactions')
        .update({ branch_id: targetBranchId })
        .eq('register_type', registerType)
        .order('created_at', { ascending: false })
        .limit(1);
    }

    return data;
  } catch (error) {
    console.error('Error in addCashTransaction:', error);
    return null;
  }
}

// الحصول على الرصيد الحالي للفرع
export async function getCurrentBalance(
  registerType: string,
  branchId?: string
): Promise<number> {
  try {
    const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
    
    let query = supabase
      .from('cash_tracking')
      .select('closing_balance')
      .eq('register_type', registerType)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);
      
    if (targetBranchId) {
      query = query.eq('branch_id', targetBranchId);
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching current balance:', error);
      throw error;
    }

    return data?.[0]?.closing_balance || 0;
  } catch (error) {
    console.error('Error in getCurrentBalance:', error);
    return 0;
  }
}

// إضافة سجل تتبع نقدي جديد
export async function addCashTrackingRecord(
  record: Omit<CashTrackingRecord, 'id' | 'created_at' | 'updated_at'>,
  branchId?: string
): Promise<CashTrackingRecord | null> {
  try {
    const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
    
    const { data, error } = await supabase
      .from('cash_tracking')
      .insert({
        ...record,
        branch_id: targetBranchId
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error adding cash tracking record:', error);
      throw error;
    }

    return data as CashTrackingRecord;
  } catch (error) {
    console.error('Error in addCashTrackingRecord:', error);
    return null;
  }
}

// تحديث سجل تتبع نقدي
export async function updateCashTrackingRecord(
  recordId: string,
  updates: Partial<CashTrackingRecord>
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('cash_tracking')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', recordId);
    
    if (error) {
      console.error('Error updating cash tracking record:', error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Error in updateCashTrackingRecord:', error);
    return false;
  }
}

// حذف سجل تتبع نقدي
export async function deleteCashTrackingRecord(recordId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('cash_tracking')
      .delete()
      .eq('id', recordId);
    
    if (error) {
      console.error('Error deleting cash tracking record:', error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteCashTrackingRecord:', error);
    return false;
  }
}

// جلب ملخص الخزينة للفرع
export async function getCashSummary(branchId?: string) {
  try {
    const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
    
    // جلب الأرصدة لجميع أنواع الصناديق
    const registerTypes = ['store', 'delivery', 'online'];
    const balances: { [key: string]: number } = {};
    
    for (const registerType of registerTypes) {
      balances[registerType] = await getCurrentBalance(registerType, targetBranchId);
    }
    
    const totalBalance = Object.values(balances).reduce((sum, balance) => sum + balance, 0);
    
    // جلب آخر المعاملات
    const recentTransactions = await getCashTransactions(
      undefined, // startDate
      undefined, // endDate  
      undefined, // registerType
      targetBranchId
    );
    
    // جلب اسم الفرع
    let branchName = 'جميع الفروع';
    if (targetBranchId) {
      const { data: branchData } = await supabase
        .from('branches')
        .select('name')
        .eq('id', targetBranchId)
        .single();
      
      branchName = branchData?.name || 'فرع غير محدد';
    }

    return {
      totalBalance,
      balances,
      recentTransactions: recentTransactions.slice(0, 10), // آخر 10 معاملات
      branchId: targetBranchId,
      branchName
    };
  } catch (error) {
    console.error('Error in getCashSummary:', error);
    return {
      totalBalance: 0,
      balances: {},
      recentTransactions: [],
      branchId: null,
      branchName: 'خطأ'
    };
  }
}