
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from "date-fns";

export type PeriodType = "day" | "week" | "month" | "quarter" | "year" | "custom";

export type FinancialSummaryData = {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  cashBalance: number;
};

export type ProfitData = {
  storeProfits: number;
  onlineProfits: number;
  returns: number; // New field to track returns
  netProfits: number; // New field for net profits after returns
};

/**
 * Get date range based on period type
 */
const getDateRange = (period: PeriodType, startDate?: Date, endDate?: Date) => {
  const now = new Date();
  
  if (period === "custom" && startDate && endDate) {
    return {
      start: startOfDay(startDate),
      end: endOfDay(endDate)
    };
  }
  
  switch(period) {
    case "day":
      return {
        start: startOfDay(now),
        end: endOfDay(now)
      };
    case "week":
      return {
        start: startOfWeek(now, { weekStartsOn: 6 }), // Week starts on Saturday
        end: endOfWeek(now, { weekStartsOn: 6 })
      };
    case "month":
      return {
        start: startOfMonth(now),
        end: endOfMonth(now)
      };
    case "quarter":
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const quarterEnd = new Date(quarterStart);
      quarterEnd.setMonth(quarterStart.getMonth() + 3);
      quarterEnd.setDate(0);
      return {
        start: startOfDay(quarterStart),
        end: endOfDay(quarterEnd)
      };
    case "year":
      return {
        start: startOfYear(now),
        end: endOfYear(now)
      };
    default:
      return {
        start: startOfMonth(now),
        end: endOfMonth(now)
      };
  }
};

/**
 * Fetch financial summary data
 */
export const fetchFinancialSummary = async (
  period: PeriodType = "month",
  startDate?: Date,
  endDate?: Date
): Promise<FinancialSummaryData> => {
  try {
    console.log(`Fetching financial summary for period: ${period}`);
    
    const dateRange = getDateRange(period, startDate, endDate);
    console.log("Date range:", dateRange);
    
    // Get total sales revenue
    const { data: salesData, error: salesError } = await supabase
      .from("sales")
      .select("total")
      .gte("date", dateRange.start.toISOString())
      .lte("date", dateRange.end.toISOString());
    
    if (salesError) throw salesError;
    
    // Get total online sales revenue
    const { data: onlineOrdersData, error: onlineOrdersError } = await supabase
      .from("online_orders")
      .select("total")
      .eq("status", "done")
      .eq("payment_status", "paid")
      .gte("created_at", dateRange.start.toISOString())
      .lte("created_at", dateRange.end.toISOString());
    
    if (onlineOrdersError) throw onlineOrdersError;
    
    // Get total expenses
    const { data: expensesData, error: expensesError } = await supabase
      .from("expenses")
      .select("amount")
      .gte("date", dateRange.start.toISOString())
      .lte("date", dateRange.end.toISOString());
    
    if (expensesError) throw expensesError;

    // Get total returns
    const { data: returnsData, error: returnsError } = await supabase
      .from("returns")
      .select("total_amount")
      .eq("status", "approved")
      .gte("created_at", dateRange.start.toISOString())
      .lte("created_at", dateRange.end.toISOString());
    
    if (returnsError) throw returnsError;
    
    // Calculate total revenue, expenses and net profit
    const salesRevenue = salesData?.reduce((sum, sale) => sum + (sale.total || 0), 0) || 0;
    const onlineRevenue = onlineOrdersData?.reduce((sum, order) => sum + (order.total || 0), 0) || 0;
    const totalExpenses = expensesData?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;
    const totalReturns = returnsData?.reduce((sum, ret) => sum + (ret.total_amount || 0), 0) || 0;
    
    const totalRevenue = salesRevenue + onlineRevenue - totalReturns;
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    
    // Get current cash balance
    const { data: cashData, error: cashError } = await supabase
      .from("cash_tracking")
      .select("closing_balance")
      .order("date", { ascending: false })
      .limit(1);
    
    if (cashError) throw cashError;
    
    const cashBalance = cashData && cashData.length > 0 ? cashData[0].closing_balance : 0;
    
    console.log("Financial summary results:", {
      totalRevenue,
      totalExpenses,
      netProfit,
      profitMargin,
      cashBalance,
      salesRevenue,
      onlineRevenue,
      totalReturns
    });
    
    return {
      totalRevenue,
      totalExpenses,
      netProfit,
      profitMargin,
      cashBalance
    };
  } catch (error) {
    console.error("Error fetching financial summary:", error);
    throw error;
  }
};

/**
 * Fetch profits summary data
 */
export const fetchProfitsSummary = async (
  period: PeriodType = "month",
  startDate?: Date,
  endDate?: Date
): Promise<ProfitData> => {
  try {
    console.log(`Fetching profits summary for period: ${period}`);
    
    const dateRange = getDateRange(period, startDate, endDate);
    console.log("Date range:", dateRange);
    
    // Get store sales profits
    const { data: storeData, error: storeError } = await supabase
      .from("sales")
      .select("profit")
      .gte("date", dateRange.start.toISOString())
      .lte("date", dateRange.end.toISOString());
    
    if (storeError) throw storeError;
    
    // Get online orders
    const { data: onlineOrdersData, error: onlineOrdersError } = await supabase
      .from("online_orders")
      .select("id, total, items")
      .eq("status", "done")
      .eq("payment_status", "paid")
      .gte("created_at", dateRange.start.toISOString())
      .lte("created_at", dateRange.end.toISOString());
    
    if (onlineOrdersError) throw onlineOrdersError;

    // Get returns
    const { data: returnsData, error: returnsError } = await supabase
      .from("returns")
      .select("total_amount")
      .eq("status", "approved")
      .gte("created_at", dateRange.start.toISOString())
      .lte("created_at", dateRange.end.toISOString());

    if (returnsError) throw returnsError;
    
    // Calculate total store profits
    const storeProfits = storeData?.reduce((sum, sale) => sum + (sale.profit || 0), 0) || 0;
    
    // Calculate online profits (estimated based on item prices)
    let onlineProfits = 0;
    
    if (onlineOrdersData) {
      for (const order of onlineOrdersData) {
        if (order.items && Array.isArray(order.items)) {
          // Estimate 30% profit margin for online orders if exact profit not available
          onlineProfits += order.total * 0.3;
        }
      }
    }

    // Calculate total returns amount
    const returns = returnsData?.reduce((sum, ret) => sum + (ret.total_amount || 0), 0) || 0;
    
    // Calculate net profits after returns
    const netProfits = storeProfits + onlineProfits - returns;
    
    console.log("Profits summary results:", {
      storeProfits,
      onlineProfits,
      returns,
      netProfits
    });
    
    return {
      storeProfits,
      onlineProfits,
      returns,
      netProfits
    };
  } catch (error) {
    console.error("Error fetching profits summary:", error);
    throw error;
  }
};
