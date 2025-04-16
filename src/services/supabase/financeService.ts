
import { supabase } from "@/integrations/supabase/client";
import { Sale, Expense } from "@/types";

export interface RevenueData {
  name: string;
  amount: number;
}

export interface ExpenseData {
  name: string;
  value: number;
  color: string;
}

export interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  cashBalance: number;
}

export async function fetchFinancialSummary(): Promise<FinancialSummary> {
  // Get sales data for total revenue calculation
  const { data: salesData, error: salesError } = await supabase
    .from("sales")
    .select("total, profit");
    
  if (salesError) {
    console.error("Error fetching sales for financial summary:", salesError);
    throw salesError;
  }
  
  // Get expenses data for total expenses calculation
  const { data: expensesData, error: expensesError } = await supabase
    .from("expenses")
    .select("amount");
    
  if (expensesError) {
    console.error("Error fetching expenses for financial summary:", expensesError);
    throw expensesError;
  }
  
  // Calculate financial summary
  const totalRevenue = salesData.reduce((sum, sale) => sum + Number(sale.total), 0);
  const totalExpenses = expensesData.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  
  // For cash balance, we use a simplified approach
  // In a real system, you would need to track all cash movements
  const cashBalance = netProfit; // Simplified calculation
  
  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin,
    cashBalance
  };
}

export async function fetchMonthlyRevenue(): Promise<RevenueData[]> {
  // Get current date
  const now = new Date();
  const currentYear = now.getFullYear();
  
  // Define month names in Arabic
  const monthNames = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", 
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
  ];
  
  // Initialize result array with all months
  const monthlyRevenue: RevenueData[] = [];
  
  // Get 6 months of data (or specify a different range)
  const months = 6;
  
  // Fetch sales grouped by month
  for (let i = 0; i < months; i++) {
    const monthIndex = (now.getMonth() - i + 12) % 12; // Handle wrapping around to previous year
    const monthName = monthNames[monthIndex];
    
    // Calculate start and end date for the month
    const year = currentYear - (now.getMonth() < monthIndex ? 1 : 0);
    const startDate = new Date(year, monthIndex, 1).toISOString();
    const endDate = new Date(year, monthIndex + 1, 0).toISOString();
    
    // Query sales for this month
    const { data, error } = await supabase
      .from("sales")
      .select("total")
      .gte("date", startDate)
      .lt("date", endDate);
      
    if (error) {
      console.error(`Error fetching sales for ${monthName}:`, error);
      continue;
    }
    
    // Calculate total for the month
    const amount = data.reduce((sum, sale) => sum + Number(sale.total), 0);
    
    // Add to result (in reverse chronological order)
    monthlyRevenue.unshift({
      name: monthName,
      amount
    });
  }
  
  return monthlyRevenue;
}

export async function fetchExpensesByCategory(): Promise<ExpenseData[]> {
  // Fetch all expenses
  const { data, error } = await supabase
    .from("expenses")
    .select("type, amount");
    
  if (error) {
    console.error("Error fetching expenses by category:", error);
    throw error;
  }
  
  // Group expenses by type
  const categories: Record<string, number> = {};
  data.forEach(expense => {
    const type = expense.type || "أخرى";
    if (!categories[type]) {
      categories[type] = 0;
    }
    categories[type] += Number(expense.amount);
  });
  
  // Predefined colors for expense categories
  const colors = [
    "#4338ca", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", 
    "#ec4899", "#f43f5e", "#ef4444", "#f59e0b", "#84cc16"
  ];
  
  // Convert to the expected format
  const result: ExpenseData[] = Object.entries(categories).map(([name, value], index) => ({
    name,
    value,
    color: colors[index % colors.length]
  }));
  
  return result;
}

export async function fetchRecentTransactions(limit = 6): Promise<any[]> {
  // Fetch recent sales (income)
  const { data: sales, error: salesError } = await supabase
    .from("sales")
    .select("id, total, date, invoice_number")
    .order("date", { ascending: false })
    .limit(limit);
    
  if (salesError) {
    console.error("Error fetching recent sales:", salesError);
    throw salesError;
  }
  
  // Fetch recent expenses (expense)
  const { data: expenses, error: expensesError } = await supabase
    .from("expenses")
    .select("id, amount, date, description, type")
    .order("date", { ascending: false })
    .limit(limit);
    
  if (expensesError) {
    console.error("Error fetching recent expenses:", expensesError);
    throw expensesError;
  }
  
  // Format sales as transactions
  const incomeTransactions = sales.map(sale => ({
    id: sale.id,
    type: "income",
    description: `مبيعات الفاتورة ${sale.invoice_number}`,
    amount: Number(sale.total),
    date: sale.date
  }));
  
  // Format expenses as transactions
  const expenseTransactions = expenses.map(expense => ({
    id: expense.id,
    type: "expense",
    description: expense.description || `مصروفات ${expense.type}`,
    amount: Number(expense.amount),
    date: expense.date
  }));
  
  // Combine and sort by date (most recent first)
  const transactions = [...incomeTransactions, ...expenseTransactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
  
  return transactions;
}

export async function fetchAllTransactions(): Promise<any[]> {
  // Similar to fetchRecentTransactions but without the limit
  const { data: sales, error: salesError } = await supabase
    .from("sales")
    .select("id, total, date, invoice_number")
    .order("date", { ascending: false });
    
  if (salesError) {
    console.error("Error fetching all sales:", salesError);
    throw salesError;
  }
  
  const { data: expenses, error: expensesError } = await supabase
    .from("expenses")
    .select("id, amount, date, description, type")
    .order("date", { ascending: false });
    
  if (expensesError) {
    console.error("Error fetching all expenses:", expensesError);
    throw expensesError;
  }
  
  // Format sales as transactions
  const incomeTransactions = sales.map(sale => ({
    id: sale.id,
    type: "income",
    description: `مبيعات الفاتورة ${sale.invoice_number}`,
    amount: Number(sale.total),
    date: sale.date
  }));
  
  // Format expenses as transactions
  const expenseTransactions = expenses.map(expense => ({
    id: expense.id,
    type: "expense",
    description: expense.description || `مصروفات ${expense.type}`,
    amount: Number(expense.amount),
    date: expense.date
  }));
  
  // Combine and sort by date (most recent first)
  return [...incomeTransactions, ...expenseTransactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
