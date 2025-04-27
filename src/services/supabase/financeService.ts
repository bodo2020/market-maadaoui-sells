import { supabase } from "@/integrations/supabase/client";
import { Sale, Expense } from "@/types";
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export interface CashierPerformance {
  id: string;
  name: string;
  totalSales: number;
  totalProfit: number;
  salesCount: number;
  averageSale: number;
}

export interface ProfitData {
  storeProfits: number;
  onlineProfits: number;
  storeSales: number;
  onlineSales: number;
}

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

export const fetchFinancialSummary = async (period: string, startDate?: Date, endDate?: Date) => {
  try {
    let queryStartDate;
    const now = new Date();
    
    if (period === "custom" && startDate && endDate) {
      queryStartDate = startDate;
    } else {
      switch (period) {
        case "day":
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "week":
          const day = now.getDay();
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
          break;
        case "month":
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "quarter":
          const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
          queryStartDate = new Date(now.getFullYear(), quarterMonth, 1);
          break;
        case "year":
          queryStartDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }
    }
    
    // Get sales
    let salesQuery = supabase
      .from('sales')
      .select('*')
      .gte('date', queryStartDate.toISOString());
    
    if (period === "custom" && endDate) {
      salesQuery = salesQuery.lte('date', endDate.toISOString());
    }
    
    const { data: sales, error: salesError } = await salesQuery;
    
    if (salesError) throw salesError;
    
    // Get expenses
    let expensesQuery = supabase
      .from('expenses')
      .select('*')
      .gte('date', queryStartDate.toISOString());
    
    if (period === "custom" && endDate) {
      expensesQuery = expensesQuery.lte('date', endDate.toISOString());
    }
    
    const { data: expenses, error: expensesError } = await expensesQuery;
    
    if (expensesError) throw expensesError;
    
    // Get cash balance
    const { data: cashTracking, error: cashError } = await supabase
      .from('cash_tracking')
      .select('*')
      .order('date', { ascending: false })
      .limit(1);
      
    if (cashError) throw cashError;
    
    // Calculate totals
    const totalRevenue = sales?.reduce((acc, curr) => acc + curr.total, 0) || 0;
    const totalProfit = sales?.reduce((acc, curr) => acc + curr.profit, 0) || 0;
    const totalExpenses = expenses?.reduce((acc, curr) => acc + curr.amount, 0) || 0;
    const netProfit = totalProfit - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const cashBalance = cashTracking && cashTracking.length > 0 ? cashTracking[0].closing_balance : 0;
    
    return {
      totalRevenue,
      totalProfit,
      totalExpenses,
      netProfit,
      profitMargin,
      cashBalance
    };
  } catch (error) {
    console.error('Error fetching financial summary:', error);
    return {
      totalRevenue: 0,
      totalProfit: 0,
      totalExpenses: 0,
      netProfit: 0,
      profitMargin: 0,
      cashBalance: 0
    };
  }
};

export const fetchMonthlyRevenue = async (period: string, startDate?: Date, endDate?: Date) => {
  try {
    const year = new Date().getFullYear();
    let queryStartDate = new Date(year, 0, 1);
    
    if (period === "custom" && startDate) {
      queryStartDate = new Date(startDate.getFullYear(), 0, 1);
    }
    
    const { data: sales, error } = await supabase
      .from('sales')
      .select('date, total')
      .gte('date', queryStartDate.toISOString());
      
    if (error) throw error;
    
    const monthlyData = Array(12).fill(0).map((_, i) => ({
      name: (i + 1).toString(),
      amount: 0
    }));
    
    sales?.forEach(sale => {
      const saleDate = new Date(sale.date);
      const saleYear = saleDate.getFullYear();
      const saleMonth = saleDate.getMonth();
      
      // Only include sales from the current year or custom date range if specified
      if (
        (period !== "custom" && saleYear === year) || 
        (period === "custom" && startDate && (!endDate || (saleDate >= startDate && saleDate <= endDate)))
      ) {
        monthlyData[saleMonth].amount += sale.total;
      }
    });
    
    return monthlyData;
  } catch (error) {
    console.error('Error fetching monthly revenue:', error);
    return [];
  }
};

export const fetchExpensesByCategory = async (period: string, startDate?: Date, endDate?: Date) => {
  try {
    let queryStartDate;
    const now = new Date();
    
    if (period === "custom" && startDate && endDate) {
      queryStartDate = startDate;
    } else {
      switch (period) {
        case "day":
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "week":
          const day = now.getDay();
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
          break;
        case "month":
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "quarter":
          const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
          queryStartDate = new Date(now.getFullYear(), quarterMonth, 1);
          break;
        case "year":
          queryStartDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }
    }
    
    // Get expenses
    let query = supabase
      .from('expenses')
      .select('type, amount')
      .gte('date', queryStartDate.toISOString());
    
    if (period === "custom" && endDate) {
      query = query.lte('date', endDate.toISOString());
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    // Group expenses by type
    const expensesByCategory: Record<string, number> = {};
    data?.forEach(expense => {
      if (!expensesByCategory[expense.type]) {
        expensesByCategory[expense.type] = 0;
      }
      expensesByCategory[expense.type] += expense.amount;
    });
    
    // Generate color for each category
    const colors = [
      '#8884d8', '#83a6ed', '#8dd1e1', '#82ca9d', '#a4de6c',
      '#d0ed57', '#ffc658', '#ff8042', '#ff5c51', '#e36bae'
    ];
    
    // Create data for pie chart
    const result = Object.entries(expensesByCategory).map(([name, value], index) => ({
      name,
      value,
      color: colors[index % colors.length]
    }));
    
    return result;
  } catch (error) {
    console.error('Error fetching expenses by category:', error);
    return [];
  }
};

export const fetchRecentTransactions = async (limit: number, period: string, startDate?: Date, endDate?: Date) => {
  try {
    let queryStartDate;
    const now = new Date();
    
    if (period === "custom" && startDate && endDate) {
      queryStartDate = startDate;
    } else {
      switch (period) {
        case "day":
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "week":
          const day = now.getDay();
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
          break;
        case "month":
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "quarter":
          const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
          queryStartDate = new Date(now.getFullYear(), quarterMonth, 1);
          break;
        case "year":
          queryStartDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }
    }
    
    // Get recent sales
    let salesQuery = supabase
      .from('sales')
      .select('id, date, total, invoice_number')
      .gte('date', queryStartDate.toISOString())
      .order('date', { ascending: false })
      .limit(limit);
    
    if (period === "custom" && endDate) {
      salesQuery = salesQuery.lte('date', endDate.toISOString());
    }
    
    const { data: sales, error: salesError } = await salesQuery;
    
    if (salesError) throw salesError;
    
    // Get recent expenses
    let expensesQuery = supabase
      .from('expenses')
      .select('id, date, amount, description, type')
      .gte('date', queryStartDate.toISOString())
      .order('date', { ascending: false })
      .limit(limit);
    
    if (period === "custom" && endDate) {
      expensesQuery = expensesQuery.lte('date', endDate.toISOString());
    }
    
    const { data: expenses, error: expensesError } = await expensesQuery;
    
    if (expensesError) throw expensesError;
    
    // Combine and format
    const transactions = [
      ...(sales?.map(sale => ({
        id: sale.id,
        date: new Date(sale.date),
        amount: sale.total,
        description: `فاتورة رقم ${sale.invoice_number}`,
        type: 'income'
      })) || []),
      ...(expenses?.map(expense => ({
        id: expense.id,
        date: new Date(expense.date),
        amount: expense.amount,
        description: expense.description,
        type: 'expense'
      })) || [])
    ].sort((a, b) => b.date.getTime() - a.date.getTime())
     .slice(0, limit);
    
    return transactions;
  } catch (error) {
    console.error('Error fetching recent transactions:', error);
    return [];
  }
};

export const fetchAllTransactions = async () => {
  try {
    // Get all sales
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('id, date, total, invoice_number')
      .order('date', { ascending: false });
    
    if (salesError) throw salesError;
    
    // Get all expenses
    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select('id, date, amount, description, type')
      .order('date', { ascending: false });
    
    if (expensesError) throw expensesError;
    
    // Combine and format
    const transactions = [
      ...(sales?.map(sale => ({
        id: sale.id,
        date: new Date(sale.date),
        amount: sale.total,
        description: `فاتورة رقم ${sale.invoice_number}`,
        type: 'income'
      })) || []),
      ...(expenses?.map(expense => ({
        id: expense.id,
        date: new Date(expense.date),
        amount: expense.amount,
        description: expense.description,
        type: 'expense'
      })) || [])
    ].sort((a, b) => b.date.getTime() - a.date.getTime());
    
    return transactions;
  } catch (error) {
    console.error('Error fetching all transactions:', error);
    return [];
  }
};

export const fetchCashierPerformance = async (period: string, startDate?: Date, endDate?: Date) => {
  try {
    let queryStartDate;
    const now = new Date();
    
    if (period === "custom" && startDate && endDate) {
      queryStartDate = startDate;
    } else {
      switch (period) {
        case "day":
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "week":
          const day = now.getDay();
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
          break;
        case "month":
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "quarter":
          const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
          queryStartDate = new Date(now.getFullYear(), quarterMonth, 1);
          break;
        case "year":
          queryStartDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }
    }
    
    // Get sales with cashier data
    let query = supabase
      .from('sales')
      .select('cashier_id, total, profit')
      .not('cashier_id', 'is', null)
      .gte('date', queryStartDate.toISOString());
    
    if (period === "custom" && endDate) {
      query = query.lte('date', endDate.toISOString());
    }
    
    const { data: sales, error: salesError } = await query;
    
    if (salesError) throw salesError;
    
    // Get cashier user data
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name')
      .in('role', ['cashier', 'admin']);
    
    if (usersError) throw usersError;
    
    // Process sales data by cashier
    const cashierMap = new Map<string, {
      id: string;
      name: string;
      totalSales: number;
      totalProfit: number;
      salesCount: number;
    }>();
    
    // Initialize map with all cashiers
    users?.forEach(user => {
      cashierMap.set(user.id, {
        id: user.id,
        name: user.name,
        totalSales: 0,
        totalProfit: 0,
        salesCount: 0
      });
    });
    
    // Aggregate sales data
    sales?.forEach(sale => {
      if (sale.cashier_id && cashierMap.has(sale.cashier_id)) {
        const cashierData = cashierMap.get(sale.cashier_id)!;
        cashierData.totalSales += sale.total;
        cashierData.totalProfit += sale.profit;
        cashierData.salesCount += 1;
      }
    });
    
    // Convert to array and calculate average sale
    const result: CashierPerformance[] = Array.from(cashierMap.values())
      .map(cashier => ({
        ...cashier,
        averageSale: cashier.salesCount > 0 ? cashier.totalSales / cashier.salesCount : 0
      }))
      .sort((a, b) => b.totalSales - a.totalSales);
    
    return result;
  } catch (error) {
    console.error('Error fetching cashier performance:', error);
    return [];
  }
};

export const fetchProfitsSummary = async (period: string, startDate?: Date, endDate?: Date): Promise<ProfitData> => {
  try {
    let queryStartDate;
    const now = new Date();
    
    if (period === "custom" && startDate && endDate) {
      queryStartDate = startDate;
    } else {
      switch (period) {
        case "day":
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "week":
          const day = now.getDay();
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
          break;
        case "month":
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "quarter":
          const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
          queryStartDate = new Date(now.getFullYear(), quarterMonth, 1);
          break;
        case "year":
          queryStartDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }
    }
    
    // Get sales data for both store and online
    let salesQuery = supabase
      .from('sales')
      .select('total, profit, items')
      .gte('date', queryStartDate.toISOString());

    let onlineQuery = supabase
      .from('online_orders')
      .select('total, items, status')
      .eq('status', 'done')
      .gte('created_at', queryStartDate.toISOString());
    
    if (period === "custom" && endDate) {
      salesQuery = salesQuery.lte('date', endDate.toISOString());
      onlineQuery = onlineQuery.lte('created_at', endDate.toISOString());
    }
    
    const [salesData, onlineData] = await Promise.all([
      salesQuery,
      onlineQuery
    ]);

    if (salesData.error) throw salesData.error;
    if (onlineData.error) throw onlineData.error;

    // Process store sales data
    let storeSales = 0;
    let storeProfits = 0;

    salesData.data?.forEach(sale => {
      storeSales += sale.total;
      storeProfits += sale.profit;
    });

    // Process online orders data
    let onlineSales = 0;
    let onlineProfits = 0;

    onlineData.data?.forEach(order => {
      onlineSales += order.total;
      
      // Calculate profits for each item in the order
      if (Array.isArray(order.items)) {
        order.items.forEach((item: any) => {
          const sellingPrice = item.price;
          const purchasePrice = item.product?.purchase_price || 0;
          const quantity = item.quantity || 0;

          // Calculate profit based on bulk or regular pricing
          if (item.is_bulk && item.bulk_quantity) {
            // For bulk items, calculate unit price and profit
            const bulkUnitPrice = item.price / item.bulk_quantity;
            onlineProfits += (bulkUnitPrice - purchasePrice) * quantity * item.bulk_quantity;
          } else {
            // For regular items
            onlineProfits += (sellingPrice - purchasePrice) * quantity;
          }
        });
      }
    });

    return {
      storeProfits,
      onlineProfits,
      storeSales,
      onlineSales
    };

  } catch (error) {
    console.error('Error fetching profits summary:', error);
    return {
      storeProfits: 0,
      onlineProfits: 0,
      storeSales: 0,
      onlineSales: 0
    };
  }
};

export const exportReportToExcel = async (
  period: string, 
  reportType: string, 
  startDate?: Date, 
  endDate?: Date
) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');
    
    // Add report title
    worksheet.mergeCells('A1:F1');
    const titleRow = worksheet.getRow(1);
    titleRow.getCell(1).value = `${reportType.toUpperCase()} REPORT - ${period.toUpperCase()}`;
    titleRow.font = { bold: true, size: 16 };
    titleRow.alignment = { horizontal: 'center' };
    
    // Add date range
    worksheet.mergeCells('A2:F2');
    const dateRow = worksheet.getRow(2);
    let dateText = '';
    
    if (period === 'custom' && startDate && endDate) {
      dateText = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
    } else {
      const now = new Date();
      switch (period) {
        case 'day':
          dateText = `${now.toLocaleDateString()}`;
          break;
        case 'week':
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay());
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          dateText = `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;
          break;
        case 'month':
          dateText = `${now.toLocaleString('default', { month: 'long', year: 'numeric' })}`;
          break;
        case 'year':
          dateText = `${now.getFullYear()}`;
          break;
        default:
          dateText = `Generated on ${now.toLocaleDateString()}`;
      }
    }
    
    dateRow.getCell(1).value = dateText;
    dateRow.font = { italic: true };
    dateRow.alignment = { horizontal: 'center' };
    
    // Add spacer row
    worksheet.addRow([]);
    
    // Prepare data based on report type
    let data: any[] = [];
    let headers: string[] = [];
    
    switch (reportType) {
      case 'sales':
        // Fetch sales data
        const salesData = await getSalesData(period);
        headers = ['Invoice #', 'Date', 'Items', 'Total', 'Profit', 'Payment Method'];
        data = salesData.map((sale: any) => [
          sale.invoice_number,
          new Date(sale.date).toLocaleDateString(),
          sale.items.reduce((sum: number, item: any) => sum + item.quantity, 0),
          sale.total,
          sale.profit,
          sale.payment_method
        ]);
        break;
        
      case 'products':
        // Get product sales data
        const sales = await getSalesData(period);
        const productMap = new Map();
        
        sales.forEach((sale: any) => {
          sale.items.forEach((item: any) => {
            const key = item.product.id;
            if (!productMap.has(key)) {
              productMap.set(key, {
                product: item.product,
                quantitySold: 0,
                revenue: 0
              });
            }
            const productData = productMap.get(key);
            productData.quantitySold += item.quantity;
            productData.revenue += item.total;
          });
        });
        
        headers = ['Product', 'Quantity Sold', 'Unit Price', 'Total Revenue', 'Profit'];
        data = Array.from(productMap.values()).map((item: any) => [
          item.product.name,
          item.quantitySold,
          item.product.price,
          item.revenue,
          item.revenue - (item.product.purchase_price * item.quantitySold)
        ]);
        break;
        
      case 'cashiers':
        // Get cashier performance
        const cashierData = await fetchCashierPerformance(period, startDate, endDate);
        headers = ['Name', 'Sales Count', 'Total Sales', 'Average Sale', 'Total Profit'];
        data = cashierData.map(cashier => [
          cashier.name,
          cashier.salesCount,
          cashier.totalSales,
          cashier.averageSale,
          cashier.totalProfit
        ]);
        break;
        
      case 'profits':
        // Get profits summary
        const profitSummary = await fetchProfitsSummary(period, startDate, endDate);
        headers = ['Metric', 'Value'];
        data = [
          ['Store Profits', profitSummary.storeProfits],
          ['Online Profits', profitSummary.onlineProfits],
          ['Store Sales', profitSummary.storeSales],
          ['Online Sales', profitSummary.onlineSales]
        ];
        break;
        
      default:
        // Get summary data
        const summary = await fetchFinancialSummary(period, startDate, endDate);
        headers = ['Metric', 'Value'];
        data = [
          ['Total Revenue', summary.totalRevenue],
          ['Total Profit', summary.totalProfit],
          ['Total Expenses', summary.totalExpenses],
          ['Net Profit', summary.netProfit],
          ['Profit Margin', `${summary.profitMargin.toFixed(2)}%`],
          ['Cash Balance', summary.cashBalance]
        ];
    }
    
    // Add headers
    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    
    // Add data rows
    data.forEach((rowData) => {
      const row = worksheet.addRow(rowData);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });
    
    // Auto-fit columns
    worksheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = maxLength < 10 ? 10 : maxLength + 2;
    });
    
    // Write to blob and save
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `${reportType}-report-${period}-${new Date().toISOString().split('T')[0]}.xlsx`);
    
    return true;
  } catch (error) {
    console.error('Error exporting report to Excel:', error);
    throw error;
  }
};
