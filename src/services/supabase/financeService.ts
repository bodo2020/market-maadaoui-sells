import { supabase } from "@/integrations/supabase/client";
import { Sale, Expense } from "@/types";
import * as ExcelJS from 'exceljs';
import * as FileSaver from 'file-saver';

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
  const { data: salesData, error: salesError } = await supabase
    .from("sales")
    .select("total, profit");
    
  if (salesError) {
    console.error("Error fetching sales for financial summary:", salesError);
    throw salesError;
  }
  
  const { data: expensesData, error: expensesError } = await supabase
    .from("expenses")
    .select("amount");
    
  if (expensesError) {
    console.error("Error fetching expenses for financial summary:", expensesError);
    throw expensesError;
  }
  
  const totalRevenue = salesData.reduce((sum, sale) => sum + Number(sale.total), 0);
  const totalProfit = salesData.reduce((sum, sale) => sum + Number(sale.profit), 0);
  const totalExpenses = expensesData.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const netProfit = totalProfit - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  
  const cashBalance = netProfit;
  
  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin,
    cashBalance
  };
}

export async function fetchMonthlyRevenue(): Promise<RevenueData[]> {
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

export async function fetchExpensesByCategory(): Promise<ExpenseData[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("type, amount");
    
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

export async function fetchRecentTransactions(limit = 6): Promise<any[]> {
  const { data: sales, error: salesError } = await supabase
    .from("sales")
    .select("id, total, date, invoice_number")
    .order("date", { ascending: false })
    .limit(limit);
    
  if (salesError) {
    console.error("Error fetching recent sales:", salesError);
    throw salesError;
  }
  
  const { data: expenses, error: expensesError } = await supabase
    .from("expenses")
    .select("id, amount, date, description, type")
    .order("date", { ascending: false })
    .limit(limit);
    
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

/**
 * Export report to Excel file
 * @param period The time period for the report
 * @param reportType The type of report to export
 */
export async function exportReportToExcel(period: string, reportType: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('تقرير');
  
  worksheet.views = [{ rightToLeft: true }];
  
  let headerRow: string[] = [];
  switch(reportType) {
    case 'sales':
      headerRow = ['رقم الفاتورة', 'التاريخ', 'عدد العناصر', 'المجموع', 'الربح', 'طريقة الدفع'];
      break;
    case 'products':
      headerRow = ['المنتج', 'الكمية المباعة', 'سعر الوحدة', 'إجمالي المبيعات', 'نسبة المبيعات', 'الربح'];
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
          .select("*");
          
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
        
      case 'trends':
        const revenueData = await fetchMonthlyRevenue();
        
        revenueData.forEach(item => {
          worksheet.addRow([item.name, item.amount]);
        });
        break;
        
      default:
        const summary = await fetchFinancialSummary();
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
