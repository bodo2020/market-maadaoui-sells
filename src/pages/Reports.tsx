import { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { useQuery } from "@tanstack/react-query";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart4, 
  Download, 
  TrendingUp, 
  Store, 
  ShoppingCart, 
  Users, 
  Calendar as CalendarLucideIcon,
  DollarSign,
  Percent,
  CalendarIcon
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import { fetchSales } from "@/services/supabase/saleService";
import { fetchProducts } from "@/services/supabase/productService";
import { CartItem, Product, Sale } from "@/types";
import { 
  fetchMonthlyRevenue, 
  fetchExpensesByCategory, 
  fetchFinancialSummary,
  exportReportToExcel,
  fetchCashierPerformance,
  CashierPerformance
} from "@/services/supabase/financeService";
import { 
  ChartContainer, 
  ChartTooltip, 
  ChartTooltipContent 
} from "@/components/ui/chart";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";

function formatCurrency(amount: number): string {
  return `${siteConfig.currency} ${amount.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}`;
}

function calculateProfitMargin(sellingPrice: number, costPrice: number): number {
  if (sellingPrice <= 0) return 0;
  return ((sellingPrice - costPrice) / sellingPrice) * 100;
}

export default function Reports() {
  const [dateRange, setDateRange] = useState("month");
  const [reportType, setReportType] = useState("sales");
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(new Date()));
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const queryParams = {
    dateRange,
    startDate,
    endDate
  };
  
  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ['sales', startDate, endDate],
    queryFn: () => fetchSales(startDate, endDate)
  });

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts
  });
  
  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ['monthlyRevenue', dateRange, startDate, endDate],
    queryFn: () => fetchMonthlyRevenue(dateRange, startDate, endDate)
  });
  
  const { data: expenseData, isLoading: expensesLoading } = useQuery({
    queryKey: ['expensesByCategory', dateRange, startDate, endDate],
    queryFn: () => fetchExpensesByCategory(dateRange, startDate, endDate)
  });
  
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['financialSummary', dateRange, startDate, endDate],
    queryFn: () => fetchFinancialSummary(dateRange, startDate, endDate)
  });

  const { data: cashierPerformance, isLoading: cashierLoading } = useQuery({
    queryKey: ['cashierPerformance', dateRange, startDate, endDate],
    queryFn: () => fetchCashierPerformance(dateRange, startDate, endDate)
  });
  
  const filteredSales = sales || [];
  const totalSales = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
  const totalProfit = filteredSales.reduce((sum, sale) => sum + sale.profit, 0);
  const totalItems = filteredSales.reduce((sum, sale) => 
    sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
  
  const profitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
  
  const productsSoldMap = new Map<string, { product: Product; quantitySold: number; revenue: number }>();
  
  filteredSales.forEach(sale => {
    sale.items.forEach((item: CartItem) => {
      const productId = item.product.id;
      if (productsSoldMap.has(productId)) {
        const existing = productsSoldMap.get(productId)!;
        existing.quantitySold += item.quantity;
        existing.revenue += item.total;
      } else {
        productsSoldMap.set(productId, {
          product: item.product,
          quantitySold: item.quantity,
          revenue: item.total
        });
      }
    });
  });
  
  const topSellingProducts = Array.from(productsSoldMap.values())
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, 5);

  const handleDateRangeChange = (value: string) => {
    setDateRange(value);
    if (value !== "custom") {
      setStartDate(undefined);
      setEndDate(undefined);
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!startDate || (startDate && endDate)) {
      setStartDate(date);
      setEndDate(undefined);
    } else {
      if (date && date < startDate) {
        setEndDate(startDate);
        setStartDate(date);
      } else {
        setEndDate(date);
      }
    }
  };
  
  const getDateRangeText = () => {
    if (dateRange === "custom" && startDate && endDate) {
      return `${format(startDate, "dd/MM/yyyy")} - ${format(endDate, "dd/MM/yyyy")}`;
    }
    
    return {
      "day": "اليوم",
      "week": "هذا الأسبوع",
      "month": "هذا الشهر",
      "quarter": "هذا الربع",
      "year": "هذا العام",
      "custom": "مخصص"
    }[dateRange] || "اختر الفترة";
  };

  const handleExportReport = async () => {
    try {
      toast.loading("جاري تصدير التقرير...");
      await exportReportToExcel(dateRange, reportType, startDate, endDate);
      toast.success("تم تصدير التقرير بنجاح");
    } catch (error) {
      console.error("Error exporting report:", error);
      toast.error("حدث خطأ أثناء تصدير التقرير");
    }
  };
  
  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">التقارير والإحصائيات</h1>
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
                  <Button 
                    variant={dateRange === "day" ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => handleDateRangeChange("day")}
                  >
                    اليوم
                  </Button>
                  <Button 
                    variant={dateRange === "week" ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => handleDateRangeChange("week")}
                  >
                    هذا الأسبوع
                  </Button>
                  <Button 
                    variant={dateRange === "month" ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => handleDateRangeChange("month")}
                  >
                    هذا الشهر
                  </Button>
                  <Button 
                    variant={dateRange === "year" ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => handleDateRangeChange("year")}
                  >
                    هذا العام
                  </Button>
                  <Button 
                    variant={dateRange === "custom" ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => handleDateRangeChange("custom")}
                    className="col-span-2"
                  >
                    مخصص
                  </Button>
                </div>
                {dateRange === "custom" && (
                  <div className="text-center text-sm mb-2">
                    {startDate && !endDate 
                      ? "اختر تاريخ الانتهاء"
                      : !startDate 
                        ? "اختر تاريخ البدء" 
                        : `${format(startDate, "dd/MM/yyyy")} - ${format(endDate!, "dd/MM/yyyy")}`}
                  </div>
                )}
              </div>
              {dateRange === "custom" && (
                <Calendar
                  mode="range"
                  selected={{
                    from: startDate,
                    to: endDate
                  }}
                  onSelect={(range) => {
                    setStartDate(range?.from);
                    setEndDate(range?.to);
                  }}
                  locale={ar}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">المبيعات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading ? "..." : formatCurrency(summaryData?.totalRevenue || totalSales)}
            </div>
            <div className="flex items-center mt-1">
              <TrendingUp className="h-4 w-4 text-green-500 ml-1" />
              <span className="text-xs text-green-500">%12+</span>
              <span className="text-xs text-muted-foreground mr-1">من الفترة السابقة</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">الأرباح</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading ? "..." : formatCurrency(summaryData?.netProfit || totalProfit)}
            </div>
            <div className="flex items-center mt-1">
              <TrendingUp className="h-4 w-4 text-green-500 ml-1" />
              <span className="text-xs text-green-500">%8+</span>
              <span className="text-xs text-muted-foreground mr-1">من الفترة السابقة</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">المنتجات المباعة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{salesLoading ? "..." : `${totalItems} وحدة`}</div>
            <div className="flex items-center mt-1">
              <TrendingUp className="h-4 w-4 text-green-500 ml-1" />
              <span className="text-xs text-green-500">%15+</span>
              <span className="text-xs text-muted-foreground mr-1">من الفترة السابقة</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">معدل الربح</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading ? "..." : 
                `${Math.round(summaryData?.profitMargin || profitMargin)}%`}
            </div>
            <div className="flex items-center mt-1">
              <TrendingUp className="h-4 w-4 text-green-500 ml-1" />
              <span className="text-xs text-green-500">%2+</span>
              <span className="text-xs text-muted-foreground mr-1">من الفترة السابقة</span>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Tabs defaultValue="sales" className="mb-6" onValueChange={setReportType}>
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
                {revenueLoading ? (
                  <div className="h-64 flex items-center justify-center bg-gray-50 rounded-md">
                    <p className="text-muted-foreground">جاري تحميل البيانات...</p>
                  </div>
                ) : revenueData && revenueData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <RechartsTooltip 
                          formatter={(value: number) => formatCurrency(value)} 
                          labelFormatter={(label) => `شهر ${label}`}
                        />
                        <Bar dataKey="amount" name="المبيعات" fill="#4338ca" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center bg-gray-50 rounded-md">
                    <p className="text-muted-foreground">لا توجد بيانات للعرض</p>
                  </div>
                )}
              </div>
              
              {salesLoading ? (
                <p className="text-center py-4 text-muted-foreground">جاري تحميل البيانات...</p>
              ) : filteredSales.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">لا توجد بيانات مبيعات للعرض</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>رقم الفاتورة</TableHead>
                        <TableHead>التاريخ</TableHead>
                        <TableHead>العناصر</TableHead>
                        <TableHead>المجموع</TableHead>
                        <TableHead>الربح</TableHead>
                        <TableHead>طريقة الدفع</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSales.map(sale => (
                        <TableRow key={sale.id}>
                          <TableCell className="font-medium">{sale.invoice_number}</TableCell>
                          <TableCell>{new Date(sale.date).toLocaleDateString('ar-EG')}</TableCell>
                          <TableCell>
                            {sale.items.reduce((sum, item) => sum + item.quantity, 0)} عنصر
                          </TableCell>
                          <TableCell>{formatCurrency(sale.total)}</TableCell>
                          <TableCell className="text-green-600">
                            {formatCurrency(sale.profit)}
                          </TableCell>
                          <TableCell>
                            {sale.payment_method === 'cash' && 'نقداً'}
                            {sale.payment_method === 'card' && 'بطاقة'}
                            {sale.payment_method === 'mixed' && 'مختلط'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="products" dir="rtl">
          <Card>
            <CardHeader>
              <CardTitle>تقرير المنتجات الأكثر مبيعاً</CardTitle>
              <CardDescription>
                المنتجات الأكثر مبيعاً حسب الكمية والإيرادات
              </CardDescription>
            </CardHeader>
            <CardContent>
              {salesLoading || productsLoading ? (
                <p className="text-center py-4 text-muted-foreground">جاري تحميل البيانات...</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">حسب الكمية</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {topSellingProducts.length === 0 ? (
                        <p className="text-center py-4 text-muted-foreground">لا توجد بيانات للعرض</p>
                      ) : (
                        <div className="space-y-4">
                          {topSellingProducts.map((item, index) => (
                            <div key={item.product.id} className="flex items-center">
                              <div className="w-8 text-muted-foreground">{index + 1}.</div>
                              <div className="flex-1">
                                <div className="font-medium">{item.product.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {formatCurrency(item.product.price)} / وحدة
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold">{item.quantitySold} وحدة</div>
                                <div className="text-sm text-muted-foreground">
                                  {formatCurrency(item.revenue)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">حسب الإيرادات</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {topSellingProducts.length === 0 ? (
                        <p className="text-center py-4 text-muted-foreground">لا توجد بيانات للعرض</p>
                      ) : (
                        <div className="space-y-4">
                          {[...topSellingProducts]
                            .sort((a, b) => b.revenue - a.revenue)
                            .map((item, index) => (
                              <div key={item.product.id} className="flex items-center">
                                <div className="w-8 text-muted-foreground">{index + 1}.</div>
                                <div className="flex-1">
                                  <div className="font-medium">{item.product.name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {item.quantitySold} وحدة
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-bold">{formatCurrency(item.revenue)}</div>
                                  <div className="text-sm text-green-600">
                                    ربح: {formatCurrency(item.revenue - (item.product.purchase_price * item.quantitySold))}
                                  </div>
                                </div>
                              </div>
                            ))
                          }
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
              
              {salesLoading || productsLoading ? (
                <p className="text-center py-4 text-muted-foreground">جاري تحميل البيانات...</p>
              ) : productsSoldMap.size === 0 ? (
                <p className="text-center py-4 text-muted-foreground">لا توجد بيانات للعرض</p>
              ) : (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">جميع المنتجات المباعة</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>المنتج</TableHead>
                            <TableHead>الكمية المباعة</TableHead>
                            <TableHead>سعر الوحدة</TableHead>
                            <TableHead>إجمالي المبيعات</TableHead>
                            <TableHead>نسبة المبيعات</TableHead>
                            <TableHead>الربح</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.from(productsSoldMap.values()).map(item => (
                            <TableRow key={item.product.id}>
                              <TableCell className="font-medium">{item.product.name}</TableCell>
                              <TableCell>{item.quantitySold} وحدة</TableCell>
                              <TableCell>
                                {formatCurrency(item.product.is_offer && item.product.offer_price
                                  ? item.product.offer_price
                                  : item.product.price
                                )}
                              </TableCell>
                              <TableCell>{formatCurrency(item.revenue)}</TableCell>
                              <TableCell>
                                {totalSales > 0 ? ((item.revenue / totalSales) * 100).toFixed(1) : 0}%
                              </TableCell>
                              <TableCell className="text-green-600">
                                {formatCurrency(item.revenue - (item.product.purchase_price * item.quantitySold))}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="cashiers" dir="rtl">
          <Card>
            <CardHeader>
              <CardTitle>تقرير أداء الكاشير</CardTitle>
              <CardDescription>
                أداء الكاشير اليومي حسب المبيعات والأرباح
              </CardDescription>
            </CardHeader>
            <CardContent>
              {cashierLoading ? (
                <p className="text-center py-4 text-muted-foreground">جاري تحميل البيانات...</p>
              ) : !cashierPerformance || cashierPerformance.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">لا توجد بيانات للعرض</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">أفضل كاشير مبيعاً اليوم</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {cashierPerformance.filter(c => c.date === new Date().toLocaleDateString('ar-EG')).length > 0 ? (
                          <>
                            <div className="text-xl font-bold">
                              {cashierPerformance
                                .filter(c => c.date === new Date().toLocaleDateString('ar-EG'))
                                .sort((a, b) => b.totalSales - a.totalSales)[0]?.name}
                            </div>
                            <div className="text-muted-foreground text-sm mt-1">
                              {formatCurrency(cashierPerformance
                                .filter(c => c.date === new Date().toLocaleDateString('ar-EG'))
                                .sort((a, b) => b.totalSales - a.totalSales)[0]?.totalSales || 0)}
                            </div>
                          </>
                        ) : (
                          <div className="text-muted-foreground">لا توجد مبيعات اليوم</div>
                        )}
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">أعلى متوسط فاتورة اليوم</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {cashierPerformance.filter(c => c.date === new Date().toLocaleDateString('ar-EG')).length > 0 ? (
                          <>
                            <div className="text-xl font-bold">
                              {cashierPerformance
                                .filter(c => c.date === new Date().toLocaleDateString('ar-EG'))
                                .sort((a, b) => b.averageSale - a.averageSale)[0]?.name}
                            </div>
                            <div className="text-muted-foreground text-sm mt-1">
                              {formatCurrency(cashierPerformance
                                .filter(c => c.date === new Date().toLocaleDateString('ar-EG'))
                                .sort((a, b) => b.averageSale - a.averageSale)[0]?.averageSale || 0)} / فاتورة
                            </div>
                          </>
                        ) : (
                          <div className="text-muted-foreground">لا توجد مبيعات اليوم</div>
                        )}
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">أعلى ربحية اليوم</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {cashierPerformance.filter(c => c.date === new Date().toLocaleDateString('ar-EG')).length > 0 ? (
                          <>
                            <div className="text-xl font-bold">
                              {cashierPerformance
                                .filter(c => c.date === new Date().toLocaleDateString('ar-EG'))
                                .sort((a, b) => b.totalProfit - a.totalProfit)[0]?.name}
                            </div>
                            <div className="text-muted-foreground text-sm mt-1">
                              {formatCurrency(cashierPerformance
                                .filter(c => c.date === new Date().toLocaleDateString('ar-EG'))
                                .sort((a, b) => b.totalProfit - a.totalProfit)[0]?.totalProfit || 0)}
                            </div>
                          </>
                        ) : (
                          <div className="text-muted-foreground">لا توجد مبيعات اليوم</div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>التاريخ</TableHead>
                          <TableHead>اسم الكاشير</TableHead>
                          <TableHead>عدد المبيعات</TableHead>
                          <TableHead>إجمالي المبيعات</TableHead>
                          <TableHead>متوسط قيمة الفاتورة</TableHead>
                          <TableHead>إجمالي الربح</TableHead>
                          <TableHead>نسبة من المبيعات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cashierPerformance.map((cashier, index) => {
                          const dailyTotal = cashierPerformance
                            .filter(c => c.date === cashier.date)
                            .reduce((sum, c) => sum + c.totalSales, 0);
                          
                          const salesPercentage = dailyTotal > 0 
                            ? (cashier.totalSales / dailyTotal) * 100 
                            : 0;
                            
                          return (
                            <TableRow key={`${cashier.id}-${cashier.date}-${index}`}>
                              <TableCell>{cashier.date}</TableCell>
                              <TableCell className="font-medium">{cashier.name}</TableCell>
                              <TableCell>{cashier.salesCount} فاتورة</TableCell>
                              <TableCell>{formatCurrency(cashier.totalSales)}</TableCell>
                              <TableCell>
                                {cashier.salesCount > 0 
                                  ? formatCurrency(cashier.averageSale) 
                                  : formatCurrency(0)}
                              </TableCell>
                              <TableCell className="text-green-600">
                                {formatCurrency(cashier.totalProfit)}
                              </TableCell>
                              <TableCell>
                                {salesPercentage.toFixed(1)}%
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
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
              {salesLoading || productsLoading ? (
                <p className="text-center py-4 text-muted-foreground">جاري تحميل البيانات...</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">متوسط هامش الربح</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold flex items-center">
                          <Percent className="h-6 w-6 ml-1 text-primary" />
                          {Math.round(profitMargin)}%
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">أعلى هامش ربح</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {Array.from(productsSoldMap.values()).length === 0 ? (
                          <div className="text-3xl font-bold text-green-600">0%</div>
                        ) : (
                          <>
                            <div className="text-3xl font-bold text-green-600">
                              {Math.max(...Array.from(productsSoldMap.values())
                                .filter(item => item.revenue > 0)
                                .map(item => {
                                  const sellingPrice = item.revenue / item.quantitySold;
                                  const costPrice = item.product.purchase_price;
                                  return Math.round(calculateProfitMargin(sellingPrice, costPrice));
                                }), 0)}%
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              لمنتج {Array.from(productsSoldMap.values())
                                .filter(item => item.revenue > 0)
                                .sort((a, b) => {
                                  const sellingPriceA = a.revenue / a.quantitySold;
                                  const sellingPriceB = b.revenue / b.quantitySold;
                                  const costPriceA = a.product.purchase_price;
                                  const costPriceB = b.product.purchase_price;
                                  return calculateProfitMargin(sellingPriceB, costPriceB) - 
                                         calculateProfitMargin(sellingPriceA, costPriceA);
                                })[0]?.product.name || ''}
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">أقل هامش ربح</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {Array.from(productsSoldMap.values())
                          .filter(item => item.revenue > 0).length === 0 ? (
                          <div className="text-3xl font-bold text-yellow-600">0%</div>
                        ) : (
                          <>
                            <div className="text-3xl font-bold text-yellow-600">
                              {Math.min(...Array.from(productsSoldMap.values())
                                .filter(item => item.revenue > 0)
                                .map(item => {
                                  const sellingPrice = item.revenue / item.quantitySold;
                                  const costPrice = item.product.purchase_price;
                                  return Math.round(calculateProfitMargin(sellingPrice, costPrice));
                                }), 0)}%
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              لمنتج {Array.from(productsSoldMap.values())
                                .filter(item => item.revenue > 0)
                                .sort((a, b) => {
                                  const sellingPriceA = a.revenue / a.quantitySold;
                                  const sellingPriceB = b.revenue / b.quantitySold;
                                  const costPriceA = a.product.purchase_price;
                                  const costPriceB = b.product.purchase_price;
                                  return calculateProfitMargin(sellingPriceA, costPriceA) - 
                                         calculateProfitMargin(sellingPriceB, costPriceB);
                                })[0]?.product.name || ''}
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                  
                  {productsSoldMap.size === 0 ? (
                    <p className="text-center py-4 text-muted-foreground">لا توجد بيانات للعرض</p>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>المنتج</TableHead>
                            <TableHead>سعر البيع</TableHead>
                            <TableHead>سعر الشراء</TableHead>
                            <TableHead>هامش الربح</TableHead>
                            <TableHead>الكمية المباعة</TableHead>
                            <TableHead>إجمالي الربح</TableHead>
                            <TableHead>نسبة من إجم��لي الربح</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.from(productsSoldMap.values())
                            .sort((a, b) => {
                              const profitA = a.revenue - (a.product.purchase_price * a.quantitySold);
                              const profitB = b.revenue - (b.product.purchase_price * b.quantitySold);
                              return profitB - profitA;
                            })
                            .map(item => {
                              const sellingPrice = item.revenue / item.quantitySold;
                              const costPrice = item.product.purchase_price;
                              const profit = item.revenue - (costPrice * item.quantitySold);
                              const margin = calculateProfitMargin(sellingPrice, costPrice);
                              
                              return (
                                <TableRow key={item.product.id}>
                                  <TableCell className="font-medium">{item.product.name}</TableCell>
                                  <TableCell>
                                    {formatCurrency(item.product.is_offer && item.product.offer_price
                                      ? item.product.offer_price
                                      : item.product.price
                                    )}
                                  </TableCell>
                                  <TableCell>{formatCurrency(item.product.purchase_price)}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center">
                                      <div 
                                        className={`h-2 rounded-full ml-2 ${
                                          margin >= 30 ? 'bg-green-500' : 
                                          margin >= 20 ? 'bg-yellow-500' : 
                                          'bg-red-500'
                                        }`}
                                        style={{ width: `${Math.min(margin, 50)}%` }}
                                      ></div>
                                      <span>{margin.toFixed(1)}%</span>
                                    </div>
                                  </TableCell>
                                  <TableCell>{item.quantitySold} وحدة</TableCell>
                                  <TableCell className="text-green-600">{formatCurrency(profit)}</TableCell>
                                  <TableCell>
                                    {totalProfit > 0 ? ((profit / totalProfit) * 100).toFixed(1) + '%' : '0%'}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}
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
                  {revenueLoading ? (
                    <div className="h-64 flex items-center justify-center bg-gray-50 rounded-md">
                      <p className="text-muted-foreground">جاري تحميل البيانات...</p>
                    </div>
                  ) : revenueData && revenueData.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenueData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <RechartsTooltip 
                            formatter={(value: number) => formatCurrency(value)} 
                            labelFormatter={(label) => `شهر ${label}`}
                          />
                          <Bar dataKey="amount" name="المبيعات" fill="#8b5cf6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center bg-gray-50 rounded-md">
                      <p className="text-muted-foreground">لا توجد بيانات للعرض</p>
                    </div>
                  )}
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-4">توزيع المصروفات</h3>
                  {expensesLoading ? (
                    <div className="h-64 flex items-center justify-center bg-gray-50 rounded-md">
                      <p className="text-muted-foreground">جاري تحميل البيانات...</p>
                    </div>
                  ) : expenseData && expenseData.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={expenseData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                            nameKey="name"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            {expenseData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <RechartsTooltip 
                            formatter={(value: number) => formatCurrency(value)} 
                          />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center bg-gray-50 rounded-md">
                      <p className="text-muted-foreground">لا توجد مصروفات لعرضها</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
