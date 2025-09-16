import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { 
  fetchProductSalesAnalytics, 
  fetchCategorySalesAnalytics,
  fetchOnlineOrdersHeatmapData,
  fetchPOSSalesHeatmapData
} from './supabase/analyticsService';
import { supabase } from "@/integrations/supabase/client";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";

// دالة لجلب تحليلات الإيرادات مع فلتر التاريخ
async function fetchRevenueAnalytics(dateRange?: DateRange) {
  let query = supabase
    .from('sales')
    .select('date, total, profit');
  
  // تطبيق فلتر التاريخ إذا كان متوفرًا
  if (dateRange?.from) {
    query = query.gte('date', dateRange.from.toISOString());
  }
  if (dateRange?.to) {
    query = query.lte('date', dateRange.to.toISOString());
  }
  
  const { data: salesData, error } = await query;
  
  if (error) throw error;
  
  const monthlyData = salesData?.reduce((acc: any[], sale) => {
    // استخدام التقويم الميلادي بدلاً من الهجري
    const month = format(new Date(sale.date), 'MMMM yyyy');
    const existing = acc.find(item => item.month === month);
    
    if (existing) {
      existing.revenue += sale.total || 0;
      existing.profit += sale.profit || 0;
      existing.salesCount += 1;
    } else {
      acc.push({
        month,
        revenue: sale.total || 0,
        profit: sale.profit || 0,
        salesCount: 1
      });
    }
    return acc;
  }, []) || [];
  
  return { monthlyData };
}

// دالة لجلب تحليلات المصروفات مع فلتر التاريخ
async function fetchExpenseAnalytics(dateRange?: DateRange) {
  let query = supabase
    .from('expenses')
    .select('type, amount, date');
  
  // تطبيق فلتر التاريخ إذا كان متوفرًا
  if (dateRange?.from) {
    query = query.gte('date', dateRange.from.toISOString());
  }
  if (dateRange?.to) {
    query = query.lte('date', dateRange.to.toISOString());
  }
  
  const { data: expenseData, error } = await query;
  
  if (error) throw error;
  
  const byType = expenseData?.reduce((acc: any[], expense) => {
    const existing = acc.find(item => item.type === expense.type);
    
    if (existing) {
      existing.total += expense.amount || 0;
      existing.count += 1;
    } else {
      acc.push({
        type: expense.type,
        total: expense.amount || 0,
        count: 1
      });
    }
    return acc;
  }, []) || [];
  
  return { byType };
}

export async function exportComprehensiveAnalyticsReport(dateRange?: DateRange) {
  try {
    const workbook = new ExcelJS.Workbook();
    
    // إعداد معلومات الملف
    workbook.creator = 'نظام إدارة المتاجر';
    workbook.lastModifiedBy = 'نظام إدارة المتاجر';
    workbook.created = new Date();
    workbook.modified = new Date();

    // جلب جميع البيانات
    const [
      productSales,
      categorySales,
      onlineOrdersHeatmap,
      posSalesHeatmap,
      revenueData,
      expenseData
    ] = await Promise.all([
      fetchProductSalesAnalytics(),
      fetchCategorySalesAnalytics(),
      fetchOnlineOrdersHeatmapData(),
      fetchPOSSalesHeatmapData(),
      fetchRevenueAnalytics(dateRange),
      fetchExpenseAnalytics(dateRange)
    ]);

    // 1. شيت تحليلات المنتجات
    const productSheet = workbook.addWorksheet('تحليلات المنتجات');
    
    // إضافة العناوين
    productSheet.addRow(['اسم المنتج', 'الكمية المباعة', 'إجمالي الإيرادات', 'إجمالي الأرباح']);
    
    // تنسيق العناوين
    const productHeaderRow = productSheet.getRow(1);
    productHeaderRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    productHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };
    
    // إضافة البيانات
    productSales.forEach(product => {
      productSheet.addRow([
        product.name,
        product.totalQuantity,
        product.totalRevenue,
        product.totalProfit
      ]);
    });
    
    // تحديد عرض الأعمدة
    productSheet.columns = [
      { width: 30 },
      { width: 15 },
      { width: 20 },
      { width: 20 }
    ];

    // 2. شيت تحليلات الفئات
    const categorySheet = workbook.addWorksheet('تحليلات الفئات');
    
    
    categorySheet.addRow(['اسم الفئة', 'الكمية المباعة', 'إجمالي الإيرادات']);
    
    const categoryHeaderRow = categorySheet.getRow(1);
    categoryHeaderRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    categoryHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '70AD47' } };
    
    categorySales.forEach(category => {
      categorySheet.addRow([
        category.name,
        category.totalQuantity,
        category.totalRevenue
      ]);
    });
    
    categorySheet.columns = [
      { width: 30 },
      { width: 15 },
      { width: 20 }
    ];

    // 3. شيت ساعات العمل - طلبات أونلاين
    const onlineHeatmapSheet = workbook.addWorksheet('ساعات العمل - أونلاين');
    
    
    onlineHeatmapSheet.addRow(['اليوم', 'الساعة', 'عدد الطلبات']);
    
    const onlineHeaderRow = onlineHeatmapSheet.getRow(1);
    onlineHeaderRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    onlineHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '44A047' } };
    
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    
    onlineOrdersHeatmap.forEach(item => {
      onlineHeatmapSheet.addRow([
        days[item.dayOfWeek],
        `${item.hour}:00`,
        item.orderCount
      ]);
    });
    
    onlineHeatmapSheet.columns = [
      { width: 15 },
      { width: 15 },
      { width: 15 }
    ];

    // 4. شيت ساعات العمل - مبيعات كاشير
    const posHeatmapSheet = workbook.addWorksheet('ساعات العمل - كاشير');
    
    
    posHeatmapSheet.addRow(['اليوم', 'الساعة', 'عدد المبيعات']);
    
    const posHeaderRow = posHeatmapSheet.getRow(1);
    posHeaderRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    posHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E67E22' } };
    
    posSalesHeatmap.forEach(item => {
      posHeatmapSheet.addRow([
        days[item.dayOfWeek],
        `${item.hour}:00`,
        item.orderCount
      ]);
    });
    
    posHeatmapSheet.columns = [
      { width: 15 },
      { width: 15 },
      { width: 15 }
    ];

    // 5. شيت تحليلات الإيرادات
    const revenueSheet = workbook.addWorksheet('تحليلات الإيرادات');
    
    
    revenueSheet.addRow(['الشهر', 'إجمالي الإيرادات', 'إجمالي الأرباح', 'عدد المبيعات']);
    
    const revenueHeaderRow = revenueSheet.getRow(1);
    revenueHeaderRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    revenueHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E8B57' } };
    
    revenueData.monthlyData?.forEach(month => {
      revenueSheet.addRow([
        month.month,
        month.revenue,
        month.profit,
        month.salesCount
      ]);
    });
    
    revenueSheet.columns = [
      { width: 15 },
      { width: 20 },
      { width: 20 },
      { width: 15 }
    ];

    // 6. شيت تحليلات المصروفات
    const expenseSheet = workbook.addWorksheet('تحليلات المصروفات');
    
    
    expenseSheet.addRow(['النوع', 'إجمالي المبلغ', 'عدد المعاملات']);
    
    const expenseHeaderRow = expenseSheet.getRow(1);
    expenseHeaderRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    expenseHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DC3545' } };
    
    expenseData.byType?.forEach(expense => {
      expenseSheet.addRow([
        expense.type,
        expense.total,
        expense.count
      ]);
    });
    
    expenseSheet.columns = [
      { width: 25 },
      { width: 20 },
      { width: 15 }
    ];

    // 7. شيت ملخص عام
    const summarySheet = workbook.addWorksheet('الملخص العام');
    
    
    summarySheet.addRow(['التقرير الشامل للتحليلات']);
    summarySheet.addRow(['تاريخ التقرير:', new Date().toLocaleDateString('ar-SA')]);
    summarySheet.addRow([]);
    
    // تنسيق العنوان الرئيسي
    const titleRow = summarySheet.getRow(1);
    titleRow.font = { bold: true, size: 16, color: { argb: '4472C4' } };
    
    // إضافة الملخص
    summarySheet.addRow(['إحصائيات سريعة:']);
    summarySheet.addRow(['إجمالي المنتجات المحللة:', productSales.length]);
    summarySheet.addRow(['إجمالي الفئات المحللة:', categorySales.length]);
    summarySheet.addRow(['إجمالي نقاط البيانات للطلبات الأونلاين:', onlineOrdersHeatmap.length]);
    summarySheet.addRow(['إجمالي نقاط البيانات لمبيعات الكاشير:', posSalesHeatmap.length]);
    
    const totalRevenue = revenueData.monthlyData?.reduce((sum, month) => sum + month.revenue, 0) || 0;
    const totalProfit = revenueData.monthlyData?.reduce((sum, month) => sum + month.profit, 0) || 0;
    const totalExpenses = expenseData.byType?.reduce((sum, expense) => sum + expense.total, 0) || 0;
    
    summarySheet.addRow(['إجمالي الإيرادات:', totalRevenue]);
    summarySheet.addRow(['إجمالي الأرباح:', totalProfit]);
    summarySheet.addRow(['إجمالي المصروفات:', totalExpenses]);
    
    summarySheet.columns = [
      { width: 30 },
      { width: 20 }
    ];

    // إنشاء وحفظ الملف
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    // اسم الملف مع الفترة الزمنية
    let fileName = `تقرير_شامل_${format(new Date(), 'yyyy-MM-dd')}`;
    if (dateRange?.from && dateRange?.to) {
      fileName += `_${format(dateRange.from, 'yyyy-MM-dd')}_الى_${format(dateRange.to, 'yyyy-MM-dd')}`;
    }
    fileName += '.xlsx';
    
    saveAs(blob, fileName);
    
    return true;
  } catch (error) {
    console.error('Error exporting comprehensive analytics report:', error);
    throw error;
  }
}