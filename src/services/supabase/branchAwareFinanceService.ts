import { supabase } from "@/integrations/supabase/client";
import { useBranchStore } from "@/stores/branchStore";

export interface FinanceData {
  totalRevenue: number;
  totalExpenses: number;
  totalProfit: number;
  totalSales: number;
  totalCosts: number;
  netProfit: number;
  period: string;
  branchId?: string;
  branchName?: string;
}

export interface ExpenseItem {
  id: string;
  amount: number;
  type: string;
  description: string;
  date: string;
  branch_id?: string;
  receipt_url?: string;
  created_at: string;
}

// جلب البيانات المالية للفرع المحدد
export async function getFinanceData(
  startDate?: string, 
  endDate?: string,
  branchId?: string
): Promise<FinanceData> {
  try {
    const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
    
    // جلب المبيعات للفرع
    let salesQuery = supabase
      .from('sales')
      .select('total, profit, date, subtotal');
      
    if (targetBranchId) {
      salesQuery = salesQuery.eq('branch_id', targetBranchId);
    }
    
    if (startDate) salesQuery = salesQuery.gte('date', startDate);
    if (endDate) salesQuery = salesQuery.lte('date', endDate);

    const { data: salesData, error: salesError } = await salesQuery;
    
    if (salesError) {
      console.error('Error fetching sales data:', salesError);
      throw salesError;
    }

    // جلب المصروفات للفرع  
    let expensesQuery = supabase
      .from('expenses')
      .select('amount, date');
      
    if (targetBranchId) {
      expensesQuery = expensesQuery.eq('branch_id', targetBranchId);
    }
    
    if (startDate) expensesQuery = expensesQuery.gte('date', startDate);
    if (endDate) expensesQuery = expensesQuery.lte('date', endDate);

    const { data: expensesData, error: expensesError } = await expensesQuery;

    if (expensesError) {
      console.error('Error fetching expenses data:', expensesError);
      throw expensesError;
    }

    // حساب الإجماليات
    const totalRevenue = salesData?.reduce((sum, sale) => sum + (sale.total || 0), 0) || 0;
    const totalProfit = salesData?.reduce((sum, sale) => sum + (sale.profit || 0), 0) || 0;
    const totalExpenses = expensesData?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;
    const totalSales = salesData?.length || 0;
    const totalCosts = totalRevenue - totalProfit; // تكلفة البضائع المباعة
    const netProfit = totalProfit - totalExpenses; // صافي الربح بعد المصروفات

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
      totalRevenue,
      totalExpenses,
      totalProfit,
      totalSales,
      totalCosts,
      netProfit,
      period: `${startDate || 'البداية'} - ${endDate || 'اليوم'}`,
      branchId: targetBranchId,
      branchName
    };
  } catch (error) {
    console.error('Error in getFinanceData:', error);
    throw error;
  }
}

// جلب المصروفات للفرع المحدد
export async function getExpenses(
  startDate?: string,
  endDate?: string,
  branchId?: string
): Promise<ExpenseItem[]> {
  try {
    const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
    
    let query = supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false });
      
    if (targetBranchId) {
      query = query.eq('branch_id', targetBranchId);
    }
    
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching expenses:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getExpenses:', error);
    return [];
  }
}

// إضافة مصروف جديد للفرع
export async function addExpense(
  amount: number,
  type: string,
  description: string,
  receiptUrl?: string,
  branchId?: string
): Promise<ExpenseItem | null> {
  try {
    const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
    
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        amount,
        type,
        description,
        receipt_url: receiptUrl,
        branch_id: targetBranchId,
        date: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error adding expense:', error);
      throw error;
    }

    return data as ExpenseItem;
  } catch (error) {
    console.error('Error in addExpense:', error);
    return null;
  }
}

// تحديث مصروف
export async function updateExpense(
  expenseId: string,
  updates: Partial<ExpenseItem>
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('expenses')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', expenseId);
    
    if (error) {
      console.error('Error updating expense:', error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Error in updateExpense:', error);
    return false;
  }
}

// حذف مصروف
export async function deleteExpense(expenseId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId);
    
    if (error) {
      console.error('Error deleting expense:', error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteExpense:', error);
    return false;
  }
}

// جلب إحصائيات المبيعات للفرع
export async function getSalesStats(
  startDate?: string,
  endDate?: string,
  branchId?: string
) {
  try {
    const targetBranchId = branchId || useBranchStore.getState().currentBranchId;
    
    let query = supabase
      .from('sales')
      .select('total, profit, date, items');
      
    if (targetBranchId) {
      query = query.eq('branch_id', targetBranchId);
    }
    
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching sales stats:', error);
      throw error;
    }

    // حساب الإحصائيات
    const totalSales = data?.length || 0;
    const totalRevenue = data?.reduce((sum, sale) => sum + (sale.total || 0), 0) || 0;
    const totalProfit = data?.reduce((sum, sale) => sum + (sale.profit || 0), 0) || 0;
    const averageSale = totalSales > 0 ? totalRevenue / totalSales : 0;

    // حساب عدد العناصر المباعة
    const totalItems = data?.reduce((sum, sale) => {
      const items = Array.isArray(sale.items) ? sale.items : JSON.parse(sale.items || '[]');
      return sum + items.reduce((itemSum: number, item: any) => 
        itemSum + (item.quantity || item.weight || 0), 0
      );
    }, 0) || 0;

    return {
      totalSales,
      totalRevenue,
      totalProfit,
      totalItems,
      averageSale,
      branchId: targetBranchId
    };
  } catch (error) {
    console.error('Error in getSalesStats:', error);
    return {
      totalSales: 0,
      totalRevenue: 0,
      totalProfit: 0,
      totalItems: 0,
      averageSale: 0,
      branchId: null
    };
  }
}