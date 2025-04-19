
import { supabase } from "@/integrations/supabase/client";
import { Sale, Expense } from "@/types";

export const getSalesData = async (period: string) => {
  try {
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        const day = now.getDay();
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'yearly':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('*')
      .gte('date', startDate.toISOString());
      
    if (salesError) throw salesError;
    
    return sales;
  } catch (error) {
    console.error('Error fetching sales data:', error);
    return [];
  }
};

export const getExpensesData = async (period: string) => {
  try {
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        const day = now.getDay();
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'yearly':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    
    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select('*')
      .gte('date', startDate.toISOString());
      
    if (expensesError) throw expensesError;
    
    return expenses;
  } catch (error) {
    console.error('Error fetching expenses data:', error);
    return [];
  }
};

export const getDashboardSummary = async () => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    
    // Get sales for current month
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('total, profit, date')
      .gte('date', startOfMonth);
      
    if (salesError) throw salesError;
    
    // Get expenses for current month
    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select('amount, date')
      .gte('date', startOfMonth);
      
    if (expensesError) throw expensesError;
    
    // Get completed orders count
    const { count: completedOrders, error: ordersError } = await supabase
      .from('online_orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'done'); // Updated from 'delivered' to 'done'
      
    if (ordersError) throw ordersError;
    
    // Get products with low inventory
    const { data: lowInventory, error: inventoryError } = await supabase
      .from('products')
      .select('name, quantity')
      .lt('quantity', 10)
      .limit(5);
      
    if (inventoryError) throw inventoryError;
    
    // Calculate totals
    const totalSales = sales?.reduce((acc, curr) => acc + curr.total, 0) || 0;
    const totalProfit = sales?.reduce((acc, curr) => acc + curr.profit, 0) || 0;
    const totalExpenses = expenses?.reduce((acc, curr) => acc + curr.amount, 0) || 0;
    const netProfit = totalProfit - totalExpenses;
    
    return {
      totalSales,
      totalProfit,
      totalExpenses,
      netProfit,
      completedOrders: completedOrders || 0,
      lowInventory: lowInventory || []
    };
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    return {
      totalSales: 0,
      totalProfit: 0,
      totalExpenses: 0,
      netProfit: 0,
      completedOrders: 0,
      lowInventory: []
    };
  }
};
