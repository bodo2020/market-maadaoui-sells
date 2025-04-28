import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Banknote, ArrowUpRight, ArrowDownLeft, DollarSign, TrendingUp, Receipt, Calendar as CalendarIcon, CreditCard, LineChart, ShoppingCart, Store, Users, Percent, BarChart4, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ar } from "date-fns/locale";
import { toast } from "sonner";
import { fetchFinancialSummary, fetchMonthlyRevenue, fetchExpensesByCategory, fetchRecentTransactions, fetchAllTransactions, fetchCashierPerformance, exportReportToExcel } from "@/services/supabase/financeService";
function formatCurrency(amount: number): string {
  return `${siteConfig.currency} ${amount.toLocaleString('ar-EG', {
    maximumFractionDigits: 2
  })}`;
}

// Utility function to calculate profit margin
function calculateProfitMargin(sellingPrice: number, costPrice: number): number {
  if (sellingPrice <= 0) return 0;
  return (sellingPrice - costPrice) / sellingPrice * 100;
}
export default function Finance() {
  const [period, setPeriod] = useState<"day" | "week" | "month" | "quarter" | "year" | "custom">("month");
  const [reportType, setReportType] = useState<"sales" | "products" | "cashiers" | "profitability" | "trends">("sales");
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(new Date()));
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Fetch financial summary data
  const {
    data: summaryData,
    isLoading: isLoadingSummary
  } = useQuery({
    queryKey: ['financialSummary', period, startDate, endDate],
    queryFn: () => fetchFinancialSummary(period, startDate, endDate)
  });

  // Fetch revenue data
  const {
    data: revenueData,
    isLoading: isLoadingRevenue
  } = useQuery({
    queryKey: ['monthlyRevenue', period, startDate, endDate],
    queryFn: () => fetchMonthlyRevenue(period, startDate, endDate)
  });

  // Fetch expense data
  const {
    data: expenseData,
    isLoading: isLoadingExpenses
  } = useQuery({
    queryKey: ['expensesByCategory', period, startDate, endDate],
    queryFn: () => fetchExpensesByCategory(period, startDate, endDate)
  });

  // Fetch recent transactions
  const {
    data: recentTransactions,
    isLoading: isLoadingTransactions
  } = useQuery({
    queryKey: ['recentTransactions', period, startDate, endDate],
    queryFn: () => fetchRecentTransactions(6, period, startDate, endDate)
  });

  // Fetch all transactions for the transactions tab
  const {
    data: allTransactions,
    isLoading: isLoadingAllTransactions
  } = useQuery({
    queryKey: ['allTransactions'],
    queryFn: fetchAllTransactions
  });

  // Fetch cashier performance data
  const {
    data: cashierPerformance,
    isLoading: cashierLoading
  } = useQuery({
    queryKey: ['cashierPerformance', period, startDate, endDate],
    queryFn: () => fetchCashierPerformance(period, startDate, endDate)
  });
  const handleDateRangeChange = (value: "day" | "week" | "month" | "quarter" | "year" | "custom") => {
    setPeriod(value);
    if (value !== "custom") {
      setStartDate(undefined);
      setEndDate(undefined);
    }
  };
  const getDateRangeText = () => {
    if (period === "custom" && startDate && endDate) {
      return `${format(startDate, "dd/MM/yyyy")} - ${format(endDate, "dd/MM/yyyy")}`;
    }
    return {
      "day": "اليوم",
      "week": "هذا الأسبوع",
      "month": "هذا الشهر",
      "quarter": "هذا الربع",
      "year": "هذا العام",
      "custom": "مخصص"
    }[period] || "اختر الفترة";
  };
  const handleExportReport = async () => {
    try {
      toast.loading("جاري تصدير التقرير...");
      await exportReportToExcel(period, reportType, startDate, endDate);
      toast.success("تم تصدير التقرير بنجاح");
    } catch (error) {
      console.error("Error exporting report:", error);
      toast.error("حدث خطأ أثناء تصدير التقرير");
    }
  };
  return <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">الإدارة المالية</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportReport}>
            <Download className="ml-2 h-4 w-4" />
            تصدير التقرير
          </Button>
          
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-auto flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                <span>{getDateRangeText()}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-4 border-b">
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <Button variant={period === "day" ? "default" : "outline"} size="sm" onClick={() => handleDateRangeChange("day")}>
                    اليوم
                  </Button>
                  <Button variant={period === "week" ? "default" : "outline"} size="sm" onClick={() => handleDateRangeChange("week")}>
                    هذا الأسبوع
                  </Button>
                  <Button variant={period === "month" ? "default" : "outline"} size="sm" onClick={() => handleDateRangeChange("month")}>
                    هذا الشهر
                  </Button>
                  <Button variant={period === "year" ? "default" : "outline"} size="sm" onClick={() => handleDateRangeChange("year")}>
                    هذا العام
                  </Button>
                  <Button variant={period === "custom" ? "default" : "outline"} size="sm" onClick={() => handleDateRangeChange("custom")} className="col-span-2">
                    مخصص
                  </Button>
                </div>
                {period === "custom" && <div className="text-center text-sm mb-2">
                    {startDate && !endDate ? "اختر تاريخ الانتهاء" : !startDate ? "اختر تاريخ البدء" : `${format(startDate, "dd/MM/yyyy")} - ${format(endDate!, "dd/MM/yyyy")}`}
                  </div>}
              </div>
              {period === "custom" && <Calendar mode="range" selected={{
              from: startDate!,
              to: endDate!
            }} onSelect={range => {
              if (range) {
                setStartDate(range.from);
                setEndDate(range.to);
              }
            }} locale={ar} initialFocus className="p-3 pointer-events-auto" />}
            </PopoverContent>
          </Popover>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الإيرادات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <div className="text-2xl font-bold animate-pulse">تحميل...</div> : <>
                <div className="text-2xl font-bold">{formatCurrency(summaryData?.totalRevenue || 0)}</div>
                <div className="flex items-center text-xs text-green-500 mt-1">
                  <ArrowUpRight className="h-3 w-3 ml-1" />
                  <span>من المبيعات</span>
                </div>
              </>}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المصروفات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <div className="text-2xl font-bold animate-pulse">تحميل...</div> : <>
                <div className="text-2xl font-bold">{formatCurrency(summaryData?.totalExpenses || 0)}</div>
                <div className="flex items-center text-xs text-red-500 mt-1">
                  <ArrowDownLeft className="h-3 w-3 ml-1" />
                  <span>من المصروفات</span>
                </div>
              </>}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">صافي الربح</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <div className="text-2xl font-bold animate-pulse">تحميل...</div> : <>
                <div className="text-2xl font-bold">{formatCurrency(summaryData?.netProfit || 0)}</div>
                <div className="flex items-center text-xs text-green-500 mt-1">
                  <TrendingUp className="h-3 w-3 ml-1" />
                  <span>بنسبة {(summaryData?.profitMargin || 0).toFixed(1)}%</span>
                </div>
              </>}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">رصيد الصندوق</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <div className="text-2xl font-bold animate-pulse">تحميل...</div> : <>
                <div className="text-2xl font-bold">{formatCurrency(summaryData?.cashBalance || 0)}</div>
                <div className="flex items-center text-xs text-muted-foreground mt-1">
                  <CreditCard className="h-3 w-3 ml-1" />
                  <span>محدث {format(new Date(), "yyyy/MM/dd")}</span>
                </div>
              </>}
          </CardContent>
        </Card>
      </div>
      
      <Tabs value={reportType} onValueChange={value => setReportType(value as any)} className="space-y-4">
        <TabsList className="grid grid-cols-5 w-fit mb-4">
          <TabsTrigger value="sales" className="flex gap-2">
            <ShoppingCart className="h-4 w-4" />
            <span>المبيعات</span>
          </TabsTrigger>
          <TabsTrigger value="products" className="flex gap-2">
            <Store className="h-4 w-4" />
            <span>المنتجات</span>
          </TabsTrigger>
          <TabsTrigger value="cashiers" className="flex gap-2">
            <Users className="h-4 w-4" />
            <span>الكاشير</span>
          </TabsTrigger>
          <TabsTrigger value="profitability" className="flex gap-2">
            <DollarSign className="h-4 w-4" />
            <span>الربحية</span>
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex gap-2">
            <BarChart4 className="h-4 w-4" />
            <span>الاتجاهات</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="sales" dir="rtl">
          <Card>
            <CardHeader>
              <CardTitle>تقرير المبيعات</CardTitle>
              <CardDescription>
                {getDateRangeText()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                {isLoadingRevenue ? <div className="h-64 flex items-center justify-center bg-gray-50 rounded-md">
                    <p className="text-muted-foreground">جاري تحميل البيانات...</p>
                  </div> : revenueData && revenueData.length > 0 ? <div className="h-64">
                    
                  </div> : <div className="h-64 flex items-center justify-center bg-gray-50 rounded-md">
                    <p className="text-muted-foreground">لا توجد بيانات للعرض</p>
                  </div>}
              </div>
              
              {isLoadingAllTransactions ? <p className="text-center py-4 text-muted-foreground">جاري تحميل البيانات...</p> : allTransactions && allTransactions.length > 0 ? <div className="space-y-2">
                  {allTransactions.filter(transaction => transaction.type === "income").slice(0, 6).map(transaction => <div key={transaction.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center ml-3 bg-green-100">
                            <Banknote className="h-5 w-5 text-green-600" />
                          </div>
                          <div>
                            <div className="font-medium">{transaction.description}</div>
                            <div className="text-xs text-muted-foreground flex items-center">
                              <Calendar className="h-3 w-3 ml-1" />
                              {format(new Date(transaction.date), "yyyy/MM/dd")}
                            </div>
                          </div>
                        </div>
                        <div className="font-bold text-green-600">
                          +{formatCurrency(transaction.amount)}
                        </div>
                      </div>)}
                </div> : <div className="py-8 text-center text-muted-foreground">
                  لا توجد معاملات لعرضها
                </div>}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="products" dir="rtl">
          <Card>
            <CardHeader>
              <CardTitle>تقرير المنتجات</CardTitle>
              <CardDescription>
                المنتجات الأكثر مبيعاً حسب الكمية والإيرادات
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingAllTransactions ? <p className="text-center py-4 text-muted-foreground">جاري تحميل البيانات...</p> : <div className="h-[400px]">
                  {isLoadingExpenses ? <div className="h-full w-full flex items-center justify-center">
                      <div className="text-lg text-muted-foreground">تحميل البيانات...</div>
                    </div> : expenseData && expenseData.length > 0 ? <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{
                  top: 10,
                  right: 30,
                  left: 30,
                  bottom: 0
                }}>
                        <Pie data={expenseData} cx="50%" cy="50%" labelLine={true} outerRadius={150} fill="#8884d8" dataKey="value" nameKey="name" label={({
                    name,
                    value
                  }) => `${name}: ${formatCurrency(value)}`}>
                          {expenseData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer> : <div className="h-full w-full flex items-center justify-center">
                      <div className="text-lg text-muted-foreground">لا توجد منتجات لعرضها</div>
                    </div>}
                </div>}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="cashiers" dir="rtl">
          <Card>
            <CardHeader>
              <CardTitle>تقرير أداء الكاشير</CardTitle>
              <CardDescription>
                مقارنة أداء الكاشير حسب المبيعات والأرباح
              </CardDescription>
            </CardHeader>
            <CardContent>
              {cashierLoading ? <p className="text-center py-4 text-muted-foreground">جاري تحميل البيانات...</p> : !cashierPerformance || cashierPerformance.length === 0 ? <p className="text-center py-4 text-muted-foreground">لا توجد بيانات للعرض</p> : <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">أفضل كاشير مبيعاً</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xl font-bold">
                          {cashierPerformance[0].name}
                        </div>
                        <div className="text-muted-foreground text-sm mt-1">
                          {formatCurrency(cashierPerformance[0].totalSales)} ({cashierPerformance[0].salesCount} فاتورة)
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">أعلى متوسط فاتورة</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xl font-bold">
                          {[...cashierPerformance].filter(c => c.salesCount > 0).sort((a, b) => b.averageSale - a.averageSale)[0]?.name || '-'}
                        </div>
                        <div className="text-muted-foreground text-sm mt-1">
                          {formatCurrency([...cashierPerformance].filter(c => c.salesCount > 0).sort((a, b) => b.averageSale - a.averageSale)[0]?.averageSale || 0)} / فاتورة
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">أعلى ربحية</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xl font-bold">
                          {[...cashierPerformance].sort((a, b) => b.totalProfit - a.totalProfit)[0]?.name || '-'}
                        </div>
                        <div className="text-muted-foreground text-sm mt-1">
                          {formatCurrency([...cashierPerformance].sort((a, b) => b.totalProfit - a.totalProfit)[0]?.totalProfit || 0)}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="mb-6">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={cashierPerformance} margin={{
                      top: 5,
                      right: 30,
                      left: 20,
                      bottom: 5
                    }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          <Bar dataKey="totalSales" name="المبيعات" fill="#4338ca" />
                          <Bar dataKey="totalProfit" name="الأرباح" fill="#10b981" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="profitability" dir="rtl">
          <Card>
            <CardHeader>
              <CardTitle>تحليل الربحية</CardTitle>
              <CardDescription>
                تحليل لهوامش الربح وأداء المنتجات
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingAllTransactions ? <p className="text-center py-4 text-muted-foreground">جاري تحميل البيانات...</p> : <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">متوسط هامش الربح</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold flex items-center">
                          <Percent className="h-6 w-6 ml-1 text-primary" />
                          {summaryData ? Math.round(summaryData.profitMargin) : 0}%
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </>}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="trends" dir="rtl">
          <Card>
            <CardHeader>
              <CardTitle>اتجاهات المبيعات</CardTitle>
              <CardDescription>
                تحليل اتجاهات المبيعات على مدار الوقت
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-8">
                <div>
                  <h3 className="text-lg font-medium mb-4">المبيعات الشهرية</h3>
                  {isLoadingRevenue ? <div className="h-64 flex items-center justify-center bg-gray-50 rounded-md">
                      <p className="text-muted-foreground">جاري تحميل البيانات...</p>
                    </div> : revenueData && revenueData.length > 0 ? <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenueData} margin={{
                      top: 5,
                      right: 30,
                      left: 20,
                      bottom: 5
                    }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} labelFormatter={label => `شهر ${label}`} />
                          <Bar dataKey="amount" name="المبيعات" fill="#8b5cf6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div> : <div className="h-64 flex items-center justify-center bg-gray-50 rounded-md">
                      <p className="text-muted-foreground">لا توجد بيانات للعرض</p>
                    </div>}
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-4">توزيع المصروفات</h3>
                  {isLoadingExpenses ? <div className="h-64 flex items-center justify-center bg-gray-50 rounded-md">
                      <p className="text-muted-foreground">جاري تحميل البيانات...</p>
                    </div> : expenseData && expenseData.length > 0 ? <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={expenseData} cx="50%" cy="50%" labelLine={false} outerRadius={80} fill="#8884d8" dataKey="value" nameKey="name" label={({
                        name,
                        percent
                      }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                            {expenseData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                          </Pie>
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div> : <div className="h-64 flex items-center justify-center bg-gray-50 rounded-md">
                      <p className="text-muted-foreground">لا توجد مصروفات لعرضها</p>
                    </div>}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </MainLayout>;
}