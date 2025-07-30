
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from "date-fns";
import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";

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
  returns: number; // Total returns value
  returnsProfitImpact: number; // Field tracking actual profit impact of returns
  netProfits: number; // Net profits after considering profit impact of returns
};

export interface CashierPerformance {
  id: string;
  name: string;
  date: string;
  salesCount: number;
  totalSales: number;
  averageSale: number;
  totalProfit: number;
}

// Define interfaces for the return items and online orders items
interface ReturnItem {
  product_id: string;
  quantity: number;
  price: number;
}

interface OrderItem {
  product_id: string;
  quantity: number;
  price?: number;
}

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

    // Get total returns - fetch the actual return items to calculate total value
    const { data: returnsData, error: returnsError } = await supabase
      .from("returns")
      .select(`
        id,
        return_items (
          quantity,
          price,
          total
        )
      `)
      .eq("status", "approved")
      .gte("created_at", dateRange.start.toISOString())
      .lte("created_at", dateRange.end.toISOString());
    
    if (returnsError) throw returnsError;
    
    // Calculate total revenue, expenses and net profit
    const salesRevenue = salesData?.reduce((sum, sale) => sum + (sale.total || 0), 0) || 0;
    const onlineRevenue = onlineOrdersData?.reduce((sum, order) => sum + (order.total || 0), 0) || 0;
    const totalExpenses = expensesData?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;
    
    // Calculate total returns value from actual return items
    let totalReturns = 0;
    if (returnsData && returnsData.length > 0) {
      for (const ret of returnsData) {
        if (ret.return_items && ret.return_items.length > 0) {
          for (const item of ret.return_items) {
            totalReturns += item.total || (item.price * item.quantity) || 0;
          }
        }
      }
    }
    
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

    // Get returns and their items to calculate profit impact
    const { data: returnsData, error: returnsError } = await supabase
      .from("returns")
      .select(`
        id, 
        total_amount,
        return_items (
          product_id,
          quantity,
          price
        )
      `)
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
          // Calculate based on actual items data
          // First cast to unknown, then to our type to avoid TypeScript errors
          for (const itemRaw of order.items) {
            // Safely access properties with type checking
            const item = itemRaw as unknown as OrderItem;
            if (typeof item.product_id === 'string' && typeof item.quantity === 'number') {
              // Fetch product details to get purchase price
              const { data: productData } = await supabase
                .from("products")
                .select("purchase_price, price")
                .eq("id", item.product_id)
                .single();
              
              if (productData) {
                // Calculate profit for this item: (selling price - purchase price) * quantity
                const itemProfit = (productData.price - productData.purchase_price) * item.quantity;
                onlineProfits += itemProfit;
              }
            }
          }
        } else {
          // Fallback if no items data available
          onlineProfits += order.total * 0.15; // Use a conservative profit margin estimate
        }
      }
    }

    // Calculate total returns amount
    const returns = returnsData?.reduce((sum, ret) => sum + (ret.total_amount || 0), 0) || 0;
    
    // Calculate the actual profit impact of returns
    // THIS IS THE KEY CORRECTION: We're calculating the actual profit (selling price - purchase price) 
    // that should be deducted from the net profit for returns
    let returnsProfitImpact = 0;
    
    if (returnsData && returnsData.length > 0) {
      // Process each return
      for (const ret of returnsData) {
        // Process return items if available
        if (ret.return_items && ret.return_items.length > 0) {
          // Safely cast to our ReturnItem type
          for (const itemRaw of ret.return_items) {
            // Type guard to ensure we have the required properties
            const item = itemRaw as ReturnItem;
            if (typeof item.product_id === 'string' && typeof item.quantity === 'number' && typeof item.price === 'number') {
              // Get product details to determine actual profit impact
              const { data: productData } = await supabase
                .from("products")
                .select("purchase_price")
                .eq("id", item.product_id)
                .single();
              
              if (productData) {
                // Calculate actual profit impact: (selling price - purchase price) * quantity
                // This is the EXACT profit margin that needs to be subtracted
                const itemProfitImpact = (item.price - productData.purchase_price) * item.quantity;
                returnsProfitImpact += itemProfitImpact;
              } else {
                // If product not found, use a conservative estimate
                returnsProfitImpact += item.price * 0.15 * item.quantity;
              }
            }
          }
        } else {
          // For returns without detailed items, use a conservative estimate
          returnsProfitImpact += ret.total_amount * 0.15;
        }
      }
    }
    
    // Calculate net profits after returns (only deduct the profit impact, not full return value)
    const netProfits = storeProfits + onlineProfits - returnsProfitImpact;
    
    console.log("Profits summary results:", {
      storeProfits,
      onlineProfits,
      returns,
      returnsProfitImpact,
      netProfits
    });
    
    return {
      storeProfits,
      onlineProfits,
      returns,
      returnsProfitImpact,
      netProfits
    };
  } catch (error) {
    console.error("Error fetching profits summary:", error);
    throw error;
  }
};

/**
 * Fetch monthly revenue data for charts
 */
export const fetchMonthlyRevenue = async (
  period: string = "year",
  startDate?: Date,
  endDate?: Date
) => {
  try {
    const dateRange = getDateRange(period as PeriodType, startDate, endDate);
    
    // Get monthly sales data
    const { data: salesData, error: salesError } = await supabase
      .from("sales")
      .select("date, total")
      .gte("date", dateRange.start.toISOString())
      .lte("date", dateRange.end.toISOString());
    
    if (salesError) throw salesError;
    
    // Get monthly online sales data
    const { data: onlineData, error: onlineError } = await supabase
      .from("online_orders")
      .select("created_at, total")
      .eq("status", "done")
      .eq("payment_status", "paid")
      .gte("created_at", dateRange.start.toISOString())
      .lte("created_at", dateRange.end.toISOString());
    
    if (onlineError) throw onlineError;
    
    // Process data by month
    const revenueByMonth = new Map();
    
    // Process store sales
    if (salesData) {
      salesData.forEach((sale) => {
        const date = new Date(sale.date);
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        const monthName = date.toLocaleString('ar-EG', { month: 'long' });
        
        if (!revenueByMonth.has(monthKey)) {
          revenueByMonth.set(monthKey, { name: monthName, amount: 0 });
        }
        
        revenueByMonth.get(monthKey).amount += sale.total || 0;
      });
    }
    
    // Process online sales
    if (onlineData) {
      onlineData.forEach((order) => {
        const date = new Date(order.created_at);
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        const monthName = date.toLocaleString('ar-EG', { month: 'long' });
        
        if (!revenueByMonth.has(monthKey)) {
          revenueByMonth.set(monthKey, { name: monthName, amount: 0 });
        }
        
        revenueByMonth.get(monthKey).amount += order.total || 0;
      });
    }
    
    // Convert map to array and sort by month
    const result = Array.from(revenueByMonth.entries())
      .map(([key, value]) => ({ monthKey: key, ...value }))
      .sort((a, b) => {
        const [aYear, aMonth] = a.monthKey.split('-').map(Number);
        const [bYear, bMonth] = b.monthKey.split('-').map(Number);
        
        if (aYear !== bYear) return aYear - bYear;
        return aMonth - bMonth;
      });
      
    return result;
  } catch (error) {
    console.error("Error fetching monthly revenue data:", error);
    throw error;
  }
};

/**
 * Fetch expenses by category for charts
 */
export const fetchExpensesByCategory = async (
  period: string = "month",
  startDate?: Date,
  endDate?: Date
) => {
  try {
    const dateRange = getDateRange(period as PeriodType, startDate, endDate);
    
    // Get expenses data with type (using type instead of category)
    const { data: expensesData, error: expensesError } = await supabase
      .from("expenses")
      .select("amount, type")
      .gte("date", dateRange.start.toISOString())
      .lte("date", dateRange.end.toISOString());
    
    if (expensesError) throw expensesError;
    
    // Process data by type instead of category
    const expensesByCategory = new Map();
    const colors = ['#8884d8', '#83a6ed', '#8dd1e1', '#82ca9d', '#a4de6c', '#d0ed57', '#ffc658'];
    
    if (expensesData) {
      expensesData.forEach((expense) => {
        const category = expense.type || 'أخرى';
        
        if (!expensesByCategory.has(category)) {
          expensesByCategory.set(category, 0);
        }
        
        expensesByCategory.set(
          category, 
          expensesByCategory.get(category) + (expense.amount || 0)
        );
      });
    }
    
    // Convert map to array for chart display
    let colorIndex = 0;
    const result = Array.from(expensesByCategory.entries()).map(([name, value]) => {
      const color = colors[colorIndex % colors.length];
      colorIndex++;
      return { name, value, color };
    });
    
    return result;
  } catch (error) {
    console.error("Error fetching expenses by category:", error);
    throw error;
  }
};

/**
 * Fetch cashier performance data
 */
export const fetchCashierPerformance = async (
  period: string = "month",
  startDate?: Date,
  endDate?: Date
): Promise<CashierPerformance[]> => {
  try {
    const dateRange = getDateRange(period as PeriodType, startDate, endDate);
    
    // Get sales data (without using created_by and user columns)
    const { data: salesData, error: salesError } = await supabase
      .from("sales")
      .select("id, date, total, profit, cashier_id")
      .gte("date", dateRange.start.toISOString())
      .lte("date", dateRange.end.toISOString());
    
    if (salesError) throw salesError;
    
    if (!salesData || salesData.length === 0) {
      return [];
    }
    
    // Get cashier information separately if needed
    const { data: usersData, error: usersError } = await supabase
      .from("users")
      .select("id, name");

    if (usersError) throw usersError;
    
    // Create a map of user IDs to names
    const userMap = new Map();
    if (usersData) {
      usersData.forEach(user => {
        userMap.set(user.id, user.name);
      });
    }
    
    // Process data by cashier and date
    const performanceMap = new Map();
    
    salesData.forEach((sale) => {
      const date = new Date(sale.date).toLocaleDateString('ar-EG');
      const cashierId = sale.cashier_id || 'unknown';
      const cashierName = userMap.get(cashierId) || 'غير معروف';
      const mapKey = `${cashierId}-${date}`;
      
      if (!performanceMap.has(mapKey)) {
        performanceMap.set(mapKey, {
          id: cashierId,
          name: cashierName,
          date,
          salesCount: 0,
          totalSales: 0,
          totalProfit: 0
        });
      }
      
      const record = performanceMap.get(mapKey);
      record.salesCount += 1;
      record.totalSales += sale.total || 0;
      record.totalProfit += sale.profit || 0;
    });
    
    // Calculate average sale amount and format as array
    const result = Array.from(performanceMap.values()).map(record => {
      const averageSale = record.salesCount > 0 
        ? record.totalSales / record.salesCount
        : 0;
        
      return {
        ...record,
        averageSale
      };
    });
    
    // Sort by date (newest first) and by salesCount within same date
    result.sort((a, b) => {
      if (a.date !== b.date) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      return b.salesCount - a.salesCount;
    });
    
    return result;
  } catch (error) {
    console.error("Error fetching cashier performance:", error);
    throw error;
  }
};

/**
 * Export report data to Excel file
 */
export const exportReportToExcel = async (
  period: string,
  reportType: string,
  startDate?: Date,
  endDate?: Date
) => {
  try {
    const dateRange = getDateRange(period as PeriodType, startDate, endDate);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('التقرير');

    // Add report header with period information
    const periodText = period === 'custom' && startDate && endDate
      ? `${startDate.toLocaleDateString('ar-EG')} إلى ${endDate.toLocaleDateString('ar-EG')}`
      : {
          'day': 'اليوم',
          'week': 'هذا الأسبوع',
          'month': 'هذا الشهر',
          'quarter': 'هذا الربع',
          'year': 'هذا العام'
        }[period] || 'غير محدد';

    worksheet.columns = [
      { header: 'تقرير النظام', key: 'header', width: 30 }
    ];
    worksheet.addRow([`تقرير ${reportType === 'sales' ? 'المبيعات' : 
                          reportType === 'products' ? 'المنتجات' :
                          reportType === 'cashiers' ? 'الكاشير' :
                          reportType === 'profitability' ? 'الربحية' : 'الاتجاهات'}`]);
    worksheet.addRow([`الفترة: ${periodText}`]);
    worksheet.addRow([`تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')}`]);
    worksheet.addRow([]);

    let data;
    // Add report data based on type
    switch (reportType) {
      case 'sales':
        // Get sales data
        const { data: salesData } = await supabase
          .from("sales")
          .select("*")
          .gte("date", dateRange.start.toISOString())
          .lte("date", dateRange.end.toISOString());
          
        data = salesData || [];
        
        // Configure columns for sales report
        worksheet.columns = [
          { header: 'رقم الفاتورة', key: 'invoice_number', width: 15 },
          { header: 'التاريخ', key: 'date', width: 15 },
          { header: 'المبلغ الإجمالي', key: 'total', width: 15 },
          { header: 'الربح', key: 'profit', width: 15 },
          { header: 'طريقة الدفع', key: 'payment_method', width: 15 }
        ];
        
        // Add data rows
        data.forEach(sale => {
          worksheet.addRow({
            invoice_number: sale.invoice_number,
            date: new Date(sale.date).toLocaleDateString('ar-EG'),
            total: sale.total,
            profit: sale.profit,
            payment_method: sale.payment_method === 'cash' ? 'نقداً' : 
                           sale.payment_method === 'card' ? 'بطاقة' : 'مختلط'
          });
        });
        
        // Add summary row
        const totalSales = data.reduce((sum, sale) => sum + (sale.total || 0), 0);
        const totalProfit = data.reduce((sum, sale) => sum + (sale.profit || 0), 0);
        
        worksheet.addRow([]);
        worksheet.addRow(['الإجمالي', '', totalSales, totalProfit, '']);
        break;
        
      case 'products':
        // Get products data with sales information
        // This would require joining or multiple queries in a real app
        // For this example, we'll use mock data
        const { data: products } = await supabase
          .from("products")
          .select("*");
          
        data = products || [];
        
        worksheet.columns = [
          { header: 'اسم المنتج', key: 'name', width: 30 },
          { header: 'السعر', key: 'price', width: 15 },
          { header: 'سعر الشراء', key: 'purchase_price', width: 15 },
          { header: 'الكمية المباعة', key: 'quantity_sold', width: 15 }, // Would need to be calculated from sales
          { header: 'هامش الربح', key: 'profit_margin', width: 15 }
        ];
        
        // Add product rows with sample sales data
        data.forEach(product => {
          const profitMargin = ((product.price - product.purchase_price) / product.price * 100).toFixed(1);
          worksheet.addRow({
            name: product.name,
            price: product.price,
            purchase_price: product.purchase_price,
            quantity_sold: product.quantity || 0, // In a real app, calculate from sales
            profit_margin: `${profitMargin}%`
          });
        });
        break;
        
      case 'cashiers':
        // Get cashier performance data
        const cashierData = await fetchCashierPerformance(period, startDate, endDate);
        data = cashierData || [];
        
        worksheet.columns = [
          { header: 'التاريخ', key: 'date', width: 15 },
          { header: 'اسم الكاشير', key: 'name', width: 20 },
          { header: 'عدد المبيعات', key: 'salesCount', width: 15 },
          { header: 'إجمالي المبيعات', key: 'totalSales', width: 15 },
          { header: 'متوسط قيمة الفاتورة', key: 'averageSale', width: 20 },
          { header: 'إجمالي الربح', key: 'totalProfit', width: 15 }
        ];
        
        data.forEach(cashier => {
          worksheet.addRow({
            date: cashier.date,
            name: cashier.name,
            salesCount: cashier.salesCount,
            totalSales: cashier.totalSales,
            averageSale: cashier.averageSale,
            totalProfit: cashier.totalProfit
          });
        });
        break;
        
      default:
        // Get summary financial data
        const summary = await fetchFinancialSummary(period as PeriodType, startDate, endDate);
        data = [summary];
        
        worksheet.columns = [
          { header: 'المؤشر', key: 'metric', width: 30 },
          { header: 'القيمة', key: 'value', width: 20 }
        ];
        
        worksheet.addRow({ metric: 'إجمالي الإيرادات', value: data[0].totalRevenue });
        worksheet.addRow({ metric: 'إجمالي المصروفات', value: data[0].totalExpenses });
        worksheet.addRow({ metric: 'صافي الربح', value: data[0].netProfit });
        worksheet.addRow({ metric: 'هامش الربح', value: `${data[0].profitMargin.toFixed(1)}%` });
        worksheet.addRow({ metric: 'الرصيد النقدي', value: data[0].cashBalance });
    }

    // Set RTL direction for the worksheet - using a different approach that's compatible with ExcelJS
    worksheet.views = [{ rightToLeft: true }];
    
    // Generate Excel file
    const buffer = await workbook.xlsx.writeBuffer();
    const fileDate = new Date().toISOString().split('T')[0];
    const fileName = `تقرير_${reportType}_${fileDate}.xlsx`;
    
    // Save file using FileSaver.js
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, fileName);
    
    return fileName;
  } catch (error) {
    console.error("Error exporting report to Excel:", error);
    throw error;
  }
};
