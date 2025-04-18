import { supabase } from "@/integrations/supabase/client";
import { Sale, Expense, User } from "@/types";
import * as ExcelJS from 'exceljs';
import * as FileSaver from 'file-saver';
import { format, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { ar } from 'date-fns/locale';

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

export interface CashierPerformance {
  id: string;
  name: string;
  salesCount: number;
  totalSales: number;
  totalProfit: number;
  averageSale: number;
}

// Utility function to calculate profit margin
function calculateProfitMargin(sellingPrice: number, costPrice: number): number {
  if (sellingPrice <= 0) return 0;
  return ((sellingPrice - costPrice) / sellingPrice) * 100;
}

export async function fetchDateRangeData(dateRange: string, startDate?: Date, endDate?: Date) {
  const now = new Date();
  let start: Date;
  let end: Date;
  
  if (startDate && endDate) {
    start = startOfDay(startDate);
    end = endOfDay(endDate);
  } else {
    switch (dateRange) {
      case "day":
        start = startOfDay(now);
        end = endOfDay(now);
        break;
      case "week":
        start = startOfWeek(now, { weekStartsOn: 6 }); // Saturday as week start for Arabic locale
        end = endOfWeek(now, { weekStartsOn: 6 });
        break;
      case "month":
        start = startOfMonth(now);
        end = endOfMonth(now);
        break;
      case "quarter":
        // Get the current quarter start
        const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), quarterMonth, 1);
        end = new Date(now.getFullYear(), quarterMonth + 3, 0);
        break;
      case "year":
        start = startOfYear(now);
        end = endOfYear(now);
        break;
      default:
        // Default to last 30 days
        start = subDays(now, 30);
        end = now;
    }
  }
  
  return { start, end };
}

export async function fetchFinancialSummary(dateRange: string = "month", startDate?: Date, endDate?: Date): Promise<FinancialSummary> {
  const { start, end } = await fetchDateRangeData(dateRange, startDate, endDate);
  
  // Fetch regular sales
  const { data: salesData, error: salesError } = await supabase
    .from("sales")
    .select("total, profit")
    .gte("date", start.toISOString())
    .lte("date", end.toISOString());
    
  if (salesError) {
    console.error("Error fetching sales for financial summary:", salesError);
    throw salesError;
  }

  // Fetch online orders that are delivered (completed sales)
  const { data: onlineOrdersData, error: onlineOrdersError } = await supabase
    .from("online_orders")
    .select("total, items")
    .eq("status", "delivered")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());
    
  if (onlineOrdersError) {
    console.error("Error fetching online orders for financial summary:", onlineOrdersError);
    throw onlineOrdersError;
  }
  
  // Calculate profit from online orders
  const onlineOrdersProfit = onlineOrdersData?.reduce((sum, order) => {
    const items = order.items as any[];
    const orderProfit = items.reduce((itemSum, item) => {
      const profit = (item.price - item.purchase_price) * item.quantity;
      return itemSum + profit;
    }, 0);
    return sum + orderProfit;
  }, 0) || 0;
  
  const { data: expensesData, error: expensesError } = await supabase
    .from("expenses")
    .select("amount")
    .gte("date", start.toISOString())
    .lte("date", end.toISOString());
    
  if (expensesError) {
    console.error("Error fetching expenses for financial summary:", expensesError);
    throw expensesError;
  }
  
  const totalRevenue = (salesData?.reduce((sum, sale) => sum + Number(sale.total), 0) || 0) +
                      (onlineOrdersData?.reduce((sum, order) => sum + Number(order.total), 0) || 0);
                      
  const totalProfit = (salesData?.reduce((sum, sale) => sum + Number(sale.profit), 0) || 0) +
                     onlineOrdersProfit;
                     
  const totalExpenses = expensesData?.reduce((sum, expense) => sum + Number(expense.amount), 0) || 0;
  
  const netProfit = totalProfit - totalExpenses;
  
  // Calculate profit margin using the formula (selling price - cost price) / selling price * 100
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  
  const cashBalance = netProfit; // You might want to adjust this based on your business logic
  
  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin,
    cashBalance
  };
}

export async function fetchMonthlyRevenue(dateRange: string = "month", startDate?: Date, endDate?: Date): Promise<RevenueData[]> {
  const now = new Date();
  const currentYear = now.getFullYear();
  
  const monthNames = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", 
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
  ];
  
  const monthlyRevenue: RevenueData[] = [];
  
  const months = 6;
  
  for (let i = 0; i < months; i++) {
    const monthIndex = (now.getMonth() - i + 12) % 12;
    const monthName = monthNames[monthIndex];
    
    const year = currentYear - (now.getMonth() < monthIndex ? 1 : 0);
    const startDate = new Date(year, monthIndex, 1).toISOString();
    const endDate = new Date(year, monthIndex + 1, 0).toISOString();
    
    const { data, error } = await supabase
      .from("sales")
      .select("total")
      .gte("date", startDate)
      .lt("date", endDate);
      
    if (error) {
      console.error(`Error fetching sales for ${monthName}:`, error);
      continue;
    }
    
    const amount = data.reduce((sum, sale) => sum + Number(sale.total), 0);
    
    monthlyRevenue.unshift({
      name: monthName,
      amount
    });
  }
  
  return monthlyRevenue;
}

export async function fetchExpensesByCategory(dateRange: string = "month", startDate?: Date, endDate?: Date): Promise<ExpenseData[]> {
  const { start, end } = await fetchDateRangeData(dateRange, startDate, endDate);
  
  const { data, error } = await supabase
    .from("expenses")
    .select("type, amount")
    .gte("date", start.toISOString())
    .lte("date", end.toISOString());
    
  if (error) {
    console.error("Error fetching expenses by category:", error);
    throw error;
  }
  
  const categories: Record<string, number> = {};
  data.forEach(expense => {
    const type = expense.type || "أخرى";
    if (!categories[type]) {
      categories[type] = 0;
    }
    categories[type] += Number(expense.amount);
  });
  
  const colors = [
    "#4338ca", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", 
    "#ec4899", "#f43f5e", "#ef4444", "#f59e0b", "#84cc16"
  ];
  
  const result: ExpenseData[] = Object.entries(categories).map(([name, value], index) => ({
    name,
    value,
    color: colors[index % colors.length]
  }));
  
  return result;
}

export async function fetchRecentTransactions(limit = 6, dateRange?: string, startDate?: Date, endDate?: Date): Promise<any[]> {
  let query = supabase
    .from("sales")
    .select("id, total, date, invoice_number")
    .order("date", { ascending: false });
    
  if (dateRange || (startDate && endDate)) {
    const { start, end } = await fetchDateRangeData(dateRange || "month", startDate, endDate);
    query = query.gte("date", start.toISOString()).lte("date", end.toISOString());
  }
  
  const { data: sales, error: salesError } = await query.limit(limit);
    
  if (salesError) {
    console.error("Error fetching recent sales:", salesError);
    throw salesError;
  }
  
  let expensesQuery = supabase
    .from("expenses")
    .select("id, amount, date, description, type")
    .order("date", { ascending: false });
    
  if (dateRange || (startDate && endDate)) {
    const { start, end } = await fetchDateRangeData(dateRange || "month", startDate, endDate);
    expensesQuery = expensesQuery.gte("date", start.toISOString()).lte("date", end.toISOString());
  }
  
  const { data: expenses, error: expensesError } = await expensesQuery.limit(limit);
    
  if (expensesError) {
    console.error("Error fetching recent expenses:", expensesError);
    throw expensesError;
  }
  
  const incomeTransactions = sales.map(sale => ({
    id: sale.id,
    type: "income",
    description: `مبيعات الفاتورة ${sale.invoice_number}`,
    amount: Number(sale.total),
    date: sale.date
  }));
  
  const expenseTransactions = expenses.map(expense => ({
    id: expense.id,
    type: "expense",
    description: expense.description || `مصروفات ${expense.type}`,
    amount: Number(expense.amount),
    date: expense.date
  }));
  
  const transactions = [...incomeTransactions, ...expenseTransactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
  
  return transactions;
}

export async function fetchAllTransactions(): Promise<any[]> {
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
  
  const incomeTransactions = sales.map(sale => ({
    id: sale.id,
    type: "income",
    description: `مبيعات الفاتورة ${sale.invoice_number}`,
    amount: Number(sale.total),
    date: sale.date
  }));
  
  const expenseTransactions = expenses.map(expense => ({
    id: expense.id,
    type: "expense",
    description: expense.description || `مصروفات ${expense.type}`,
    amount: Number(expense.amount),
    date: expense.date
  }));
  
  return [...incomeTransactions, ...expenseTransactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function fetchCashierPerformance(dateRange: string = "month", startDate?: Date, endDate?: Date): Promise<CashierPerformance[]> {
  const { start, end } = await fetchDateRangeData(dateRange, startDate, endDate);
  
  // Fetch all sales within the date range that have a cashier_id
  const { data: sales, error: salesError } = await supabase
    .from("sales")
    .select("*, cashier_id")
    .gte("date", start.toISOString())
    .lte("date", end.toISOString())
    .not("cashier_id", "is", null);
    
  if (salesError) {
    console.error("Error fetching sales for cashier performance:", salesError);
    throw salesError;
  }
  
  // Fetch all users with CASHIER role
  const { data: cashiers, error: cashiersError } = await supabase
    .from("users")
    .select("id, name, username")
    .eq("role", "cashier");
    
  if (cashiersError) {
    console.error("Error fetching cashiers:", cashiersError);
    throw cashiersError;
  }
  
  // Calculate performance metrics for each cashier
  const cashierMap = new Map<string, CashierPerformance>();
  
  // Initialize map with all cashiers
  cashiers.forEach(cashier => {
    cashierMap.set(cashier.id, {
      id: cashier.id,
      name: cashier.name,
      salesCount: 0,
      totalSales: 0,
      totalProfit: 0,
      averageSale: 0
    });
  });
  
  // Process sales data
  sales.forEach(sale => {
    if (sale.cashier_id && cashierMap.has(sale.cashier_id)) {
      const cashierData = cashierMap.get(sale.cashier_id)!;
      cashierData.salesCount += 1;
      cashierData.totalSales += Number(sale.total);
      cashierData.totalProfit += Number(sale.profit);
    }
  });
  
  // Calculate average sale for each cashier
  cashierMap.forEach(cashier => {
    if (cashier.salesCount > 0) {
      cashier.averageSale = cashier.totalSales / cashier.salesCount;
    }
  });
  
  return Array.from(cashierMap.values())
    .sort((a, b) => b.totalSales - a.totalSales);
}

/**
 * Export report to Excel file
 * @param period The time period for the report
 * @param reportType The type of report to export
 * @param startDate Optional start date for custom range
 * @param endDate Optional end date for custom range
 */
export async function exportReportToExcel(
  period: string, 
  reportType: string, 
  startDate?: Date, 
  endDate?: Date
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('تقرير');
  
  worksheet.views = [{ rightToLeft: true }];
  
  let headerRow: string[] = [];
  const { start, end } = await fetchDateRangeData(period, startDate, endDate);
  
  switch(reportType) {
    case 'sales':
      headerRow = ['رقم الفاتورة', 'التاريخ', 'عدد العناصر', 'المجموع', 'الربح', 'طريقة الدفع'];
      break;
    case 'products':
      headerRow = ['المنتج', 'الكمية المباعة', 'سعر الوحدة', 'إجمالي المبيعات', 'نسبة المبيعات', 'الربح'];
      break;
    case 'cashiers':
      headerRow = ['اسم الكاشير', 'عدد المبيعات', 'إجمالي المبيعات', 'متوسط قيمة الفاتورة', 'إجمالي الربح', 'نسبة من المبيعات'];
      break;
    case 'profitability':
      headerRow = ['المنتج', 'سعر البيع', 'سعر الشراء', 'هامش الربح', 'الكمية المباعة', 'إجمالي الربح', 'نسبة من إجمالي الربح'];
      break;
    case 'trends':
      headerRow = ['الشهر', 'الإيرادات'];
      break;
    default:
      headerRow = ['البند', 'القيمة'];
  }
  
  worksheet.addRow(headerRow);
  
  worksheet.getRow(1).font = { bold: true, size: 14 };
  worksheet.getRow(1).alignment = { horizontal: 'center' };
  
  try {
    switch(reportType) {
      case 'sales':
        const { data: salesData } = await supabase
          .from("sales")
          .select("*")
          .gte("date", start.toISOString())
          .lte("date", end.toISOString())
          .order("date", { ascending: false });
        
        if (salesData) {
          salesData.forEach(sale => {
            const items = sale.items as any[];
            const itemsCount = items.reduce((sum: number, item: any) => sum + item.quantity, 0);
            
            worksheet.addRow([
              sale.invoice_number,
              new Date(sale.date).toLocaleDateString('ar-EG'),
              `${itemsCount} عنصر`,
              sale.total,
              sale.profit,
              sale.payment_method === 'cash' ? 'نقداً' : 
              sale.payment_method === 'card' ? 'بطاقة' : 'مختلط'
            ]);
          });
        }
        break;
        
      case 'products':
        const { data: salesForProducts } = await supabase
          .from("sales")
          .select("*")
          .gte("date", start.toISOString())
          .lte("date", end.toISOString());
          
        if (salesForProducts) {
          const productsMap = new Map();
          
          salesForProducts.forEach((sale: any) => {
            const items = sale.items as any[];
            
            items.forEach((item: any) => {
              const productId = item.product.id;
              if (productsMap.has(productId)) {
                const existing = productsMap.get(productId);
                existing.quantitySold += item.quantity;
                existing.revenue += item.total;
              } else {
                productsMap.set(productId, {
                  product: item.product,
                  quantitySold: item.quantity,
                  revenue: item.total
                });
              }
            });
          });
          
          const totalRevenue = salesForProducts.reduce((sum: number, sale: any) => sum + sale.total, 0);
          
          Array.from(productsMap.values()).forEach(item => {
            const profit = item.revenue - (item.product.purchase_price * item.quantitySold);
            worksheet.addRow([
              item.product.name,
              item.quantitySold,
              item.product.price,
              item.revenue,
              totalRevenue > 0 ? ((item.revenue / totalRevenue) * 100).toFixed(1) + '%' : '0%',
              profit
            ]);
          });
        }
        break;
        
      case 'cashiers':
        const cashiersData = await fetchCashierPerformance(period, startDate, endDate);
        
        if (cashiersData) {
          const totalSales = cashiersData.reduce((sum, cashier) => sum + cashier.totalSales, 0);
          
          cashiersData.forEach(cashier => {
            worksheet.addRow([
              cashier.name,
              cashier.salesCount,
              cashier.totalSales,
              cashier.averageSale.toFixed(2),
              cashier.totalProfit,
              totalSales > 0 ? ((cashier.totalSales / totalSales) * 100).toFixed(1) + '%' : '0%'
            ]);
          });
        }
        break;
        
      case 'trends':
        const revenueData = await fetchMonthlyRevenue(period, startDate, endDate);
        
        revenueData.forEach(item => {
          worksheet.addRow([item.name, item.amount]);
        });
        break;
        
      default:
        const summary = await fetchFinancialSummary(period, startDate, endDate);
        worksheet.addRow(['إجمالي الإيرادات', summary.totalRevenue]);
        worksheet.addRow(['إجمالي المصروفات', summary.totalExpenses]);
        worksheet.addRow(['صافي الربح', summary.netProfit]);
        worksheet.addRow(['هامش الربح', summary.profitMargin.toFixed(1) + '%']);
        worksheet.addRow(['رصيد الصندوق', summary.cashBalance]);
    }
    
    worksheet.columns.forEach(column => {
      if (column.number > 2) {
        column.numFmt = '#,##0.00';
      }
    });
    
    const buffer = await workbook.xlsx.writeBuffer();
    
    const date = new Date().toISOString().split('T')[0];
    const fileName = `تقرير_${reportType}_${date}.xlsx`;
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    FileSaver.saveAs(blob, fileName);
    
  } catch (error) {
    console.error("Error exporting report to Excel:", error);
    throw error;
  }
}
