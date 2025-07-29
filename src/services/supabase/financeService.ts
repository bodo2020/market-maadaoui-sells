import { supabase } from "@/integrations/supabase/client";

export interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
}

export interface ProfitsSummary {
  storeProfits: number;
  onlineProfits: number;
  netProfits: number;
  returns: number;
  returnsProfitImpact: number;
}

export async function fetchFinancialSummary(
  period: "day" | "week" | "month" | "quarter" | "year" | "custom",
  startDate?: Date,
  endDate?: Date,
  branchId?: string
): Promise<FinancialSummary> {
  try {
    const dateRange = getDateRange(period, startDate, endDate);
    
    // Fetch revenue from sales
    let salesQuery = supabase
      .from("sales")
      .select("total")
      .gte("date", dateRange.start)
      .lte("date", dateRange.end);
    
    if (branchId) {
      salesQuery = salesQuery.eq("branch_id", branchId);
    }
    
    const { data: salesData, error: salesError } = await salesQuery;
    
    if (salesError) throw salesError;
    
    const totalRevenue = salesData?.reduce((sum, sale) => sum + (sale.total || 0), 0) || 0;
    
    // Fetch expenses
    let expensesQuery = supabase
      .from("expenses")
      .select("amount")
      .gte("date", dateRange.start)
      .lte("date", dateRange.end);
    
    if (branchId) {
      expensesQuery = expensesQuery.eq("branch_id", branchId);
    }
    
    const { data: expensesData, error: expensesError } = await expensesQuery;
    
    if (expensesError) throw expensesError;
    
    const totalExpenses = expensesData?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;
    
    return {
      totalRevenue,
      totalExpenses
    };
  } catch (error) {
    console.error("Error fetching financial summary:", error);
    throw error;
  }
}

export async function fetchProfitsSummary(
  period: "day" | "week" | "month" | "quarter" | "year" | "custom",
  startDate?: Date,
  endDate?: Date,
  branchId?: string
): Promise<ProfitsSummary> {
  try {
    const dateRange = getDateRange(period, startDate, endDate);
    
    // Fetch store profits from sales
    let salesQuery = supabase
      .from("sales")
      .select("profit")
      .gte("date", dateRange.start)
      .lte("date", dateRange.end);
    
    if (branchId) {
      salesQuery = salesQuery.eq("branch_id", branchId);
    }
    
    const { data: salesData, error: salesError } = await salesQuery;
    
    if (salesError) throw salesError;
    
    const storeProfits = salesData?.reduce((sum, sale) => sum + (sale.profit || 0), 0) || 0;
    
    // Fetch online profits from online orders
    let ordersQuery = supabase
      .from("online_orders")
      .select("total, items")
      .gte("created_at", dateRange.start)
      .lte("created_at", dateRange.end)
      .in("status", ["shipped", "done"]);
    
    if (branchId) {
      ordersQuery = ordersQuery.eq("branch_id", branchId);
    }
    
    const { data: ordersData, error: ordersError } = await ordersQuery;
    
    if (ordersError) throw ordersError;
    
    // Calculate online profits (assuming 20% margin for now)
    const onlineProfits = ordersData?.reduce((sum, order) => {
      const orderTotal = order.total || 0;
      return sum + (orderTotal * 0.2); // 20% profit margin
    }, 0) || 0;
    
    // Fetch returns
    let returnsQuery = supabase
      .from("returns")
      .select("total_amount")
      .gte("created_at", dateRange.start)
      .lte("created_at", dateRange.end);
    
    // Note: returns table doesn't have branch_id, so we can't filter by branch
    // This might need to be added to the returns table schema
    
    const { data: returnsData, error: returnsError } = await returnsQuery;
    
    if (returnsError) throw returnsError;
    
    const returns = returnsData?.reduce((sum, returnItem) => sum + (returnItem.total_amount || 0), 0) || 0;
    
    // Calculate returns profit impact (assuming 20% margin loss)
    const returnsProfitImpact = returns * 0.2;
    
    const netProfits = storeProfits + onlineProfits - returnsProfitImpact;
    
    return {
      storeProfits,
      onlineProfits,
      netProfits,
      returns,
      returnsProfitImpact
    };
  } catch (error) {
    console.error("Error fetching profits summary:", error);
    throw error;
  }
}

function getDateRange(
  period: "day" | "week" | "month" | "quarter" | "year" | "custom",
  startDate?: Date,
  endDate?: Date
) {
  const now = new Date();
  
  if (period === "custom" && startDate && endDate) {
    return {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    };
  }
  
  switch (period) {
    case "day":
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return {
        start: today.toISOString(),
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
      };
      
    case "week":
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
      return {
        start: weekStart.toISOString(),
        end: weekEnd.toISOString()
      };
      
    case "month":
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return {
        start: monthStart.toISOString(),
        end: monthEnd.toISOString()
      };
      
    case "quarter":
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const quarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0, 23, 59, 59, 999);
      return {
        start: quarterStart.toISOString(),
        end: quarterEnd.toISOString()
      };
      
    case "year":
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return {
        start: yearStart.toISOString(),
        end: yearEnd.toISOString()
      };
      
    default:
      return getDateRange("month");
  }
}