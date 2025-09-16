import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { DollarSign, TrendingUp, TrendingDown, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sale } from "@/types";

interface RevenueData {
  month: string;
  revenue: number;
  profit: number;
  sales_count: number;
}

interface PaymentMethodData {
  method: string;
  amount: number;
  count: number;
  color: string;
}

interface RevenueAnalyticsProps {
  selectedPeriod: PeriodType;
}

export function RevenueAnalytics({ selectedPeriod }: RevenueAnalyticsProps) {
  const dateRange = getDateRangeFromPeriod(selectedPeriod);
  const [monthlyData, setMonthlyData] = useState<RevenueData[]>([]);
  const [paymentMethodsData, setPaymentMethodsData] = useState<PaymentMethodData[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [avgOrderValue, setAvgOrderValue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRevenueData();
  }, []);

  const fetchRevenueData = async () => {
    try {
      setLoading(true);
      
      // Fetch sales data from the last 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      const { data: sales, error } = await supabase
        .from("sales")
        .select("*")
        .gte("date", sixMonthsAgo.toISOString())
        .order("date", { ascending: false });

      if (error) {
        console.error("Error fetching sales data:", error);
        return;
      }

      if (!sales) {
        setLoading(false);
        return;
      }

      // Calculate totals using actual profit from sales table
      const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
      const profit = sales.reduce((sum, sale) => sum + (sale.profit || 0), 0); // Use actual profit
      const salesCount = sales.length;
      const avgOrder = salesCount > 0 ? revenue / salesCount : 0;

      setTotalRevenue(revenue);
      setTotalProfit(profit);
      setTotalSales(salesCount);
      setAvgOrderValue(avgOrder);

      // Group by month
      const monthlyRevenue: { [key: string]: RevenueData } = {};
      
      sales.forEach(sale => {
        const date = new Date(sale.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthName = getMonthName(date.getMonth() + 1);
        
        if (!monthlyRevenue[monthKey]) {
          monthlyRevenue[monthKey] = {
            month: monthName,
            revenue: 0,
            profit: 0,
            sales_count: 0
          };
        }
        
        monthlyRevenue[monthKey].revenue += sale.total;
        monthlyRevenue[monthKey].profit += (sale.profit || 0); // Use actual profit from sales table
        monthlyRevenue[monthKey].sales_count += 1;
      });

      const monthlyArray = Object.values(monthlyRevenue).reverse();
      setMonthlyData(monthlyArray);

      // Group by payment method
      const paymentMethods: { [key: string]: { amount: number; count: number } } = {};
      
      sales.forEach(sale => {
        const method = getPaymentMethodLabel(sale.payment_method);
        if (!paymentMethods[method]) {
          paymentMethods[method] = { amount: 0, count: 0 };
        }
        paymentMethods[method].amount += sale.total;
        paymentMethods[method].count += 1;
      });

      const paymentColors = {
        'نقدي': '#10b981',
        'كارت': '#3b82f6',
        'مختلط': '#f59e0b'
      };

      const paymentArray = Object.entries(paymentMethods).map(([method, data]) => ({
        method,
        amount: data.amount,
        count: data.count,
        color: paymentColors[method as keyof typeof paymentColors] || '#6b7280'
      }));

      setPaymentMethodsData(paymentArray);
      setLoading(false);
    } catch (error) {
      console.error("Error in fetchRevenueData:", error);
      setLoading(false);
    }
  };

  const getMonthName = (month: number) => {
    const months = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    return months[month - 1];
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels = {
      'cash': 'نقدي',
      'card': 'كارت',
      'mixed': 'مختلط'
    };
    return labels[method as keyof typeof labels] || method;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الإيرادات</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">
              آخر 6 أشهر
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الأرباح</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(totalProfit)}
            </div>
            <p className="text-xs text-muted-foreground">
              هامش ربح {profitMargin.toFixed(1)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">عدد المبيعات</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalSales.toLocaleString('ar-EG')}
            </div>
            <p className="text-xs text-muted-foreground">
              معاملة
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">متوسط قيمة الطلب</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {formatCurrency(avgOrderValue)}
            </div>
            <p className="text-xs text-muted-foreground">
              لكل معاملة
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="monthly-trend" className="space-y-4">
        <TabsList>
          <TabsTrigger value="monthly-trend">الاتجاه الشهري</TabsTrigger>
          <TabsTrigger value="payment-methods">طرق الدفع</TabsTrigger>
          <TabsTrigger value="profit-analysis">تحليل الأرباح</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly-trend">
          <Card>
            <CardHeader>
              <CardTitle>الإيرادات والأرباح الشهرية</CardTitle>
              <CardDescription>تتبع الإيرادات والأرباح عبر الأشهر</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === 'revenue' ? 'الإيرادات' : 'الأرباح'
                    ]}
                  />
                  <Bar dataKey="revenue" fill="#10b981" name="الإيرادات" />
                  <Bar dataKey="profit" fill="#3b82f6" name="الأرباح" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payment-methods">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>توزيع طرق الدفع</CardTitle>
                <CardDescription>نسبة الإيرادات حسب طريقة الدفع</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={paymentMethodsData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="amount"
                      label={({ method, percent }) => `${method} (${(percent * 100).toFixed(1)}%)`}
                    >
                      {paymentMethodsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>تفاصيل طرق الدفع</CardTitle>
                <CardDescription>المبالغ وعدد المعاملات</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {paymentMethodsData.map((methodData, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: methodData.color }}
                        ></div>
                        <div>
                          <p className="font-medium">{methodData.method}</p>
                          <p className="text-sm text-muted-foreground">
                            {methodData.count} معاملة
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{formatCurrency(methodData.amount)}</p>
                        <p className="text-sm text-muted-foreground">
                          {((methodData.amount / totalRevenue) * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="profit-analysis">
          <Card>
            <CardHeader>
              <CardTitle>تحليل الأرباح الشهرية</CardTitle>
              <CardDescription>اتجاه الأرباح ومقارنة بالإيرادات</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === 'revenue' ? 'الإيرادات' : 'الأرباح'
                    ]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#10b981" 
                    strokeWidth={3}
                    name="الإيرادات"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="profit" 
                    stroke="#3b82f6" 
                    strokeWidth={3}
                    name="الأرباح"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}