import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PeriodType, getDateRangeFromPeriod } from "@/components/analytics/PeriodFilter";
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

// Data interfaces
interface RevenueData {
  month: string;
  revenue: number;
  profit: number;
  salesCount: number;
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

  const fetchRevenueData = async () => {
    setLoading(true);
    try {
      // Fetch sales data
      let salesQuery = supabase
        .from("sales")
        .select("total, profit, payment_method, date");
        
      if (dateRange?.from && dateRange?.to) {
        salesQuery = salesQuery
          .gte('date', dateRange.from.toISOString().split('T')[0])
          .lte('date', dateRange.to.toISOString().split('T')[0]);
      }
      
      const { data: salesData, error: salesError } = await salesQuery;
      if (salesError) throw salesError;

      // Fetch online orders data
      let ordersQuery = supabase
        .from("online_orders")
        .select("total, created_at");
        
      if (dateRange?.from && dateRange?.to) {
        ordersQuery = ordersQuery
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString());
      }
      
      const { data: ordersData, error: ordersError } = await ordersQuery;
      if (ordersError) throw ordersError;

      // Process monthly data
      const monthlyMap = new Map<string, { revenue: number; profit: number; salesCount: number }>();
      const paymentMethodMap = new Map<string, { amount: number; count: number }>();

      // Process sales
      salesData?.forEach(sale => {
        const monthKey = getMonthName(new Date(sale.date));
        const existing = monthlyMap.get(monthKey) || { revenue: 0, profit: 0, salesCount: 0 };
        monthlyMap.set(monthKey, {
          revenue: existing.revenue + (sale.total || 0),
          profit: existing.profit + (sale.profit || 0),
          salesCount: existing.salesCount + 1
        });

        // Process payment methods
        const paymentMethod = getPaymentMethodLabel(sale.payment_method);
        const paymentExisting = paymentMethodMap.get(paymentMethod) || { amount: 0, count: 0 };
        paymentMethodMap.set(paymentMethod, {
          amount: paymentExisting.amount + (sale.total || 0),
          count: paymentExisting.count + 1
        });
      });

      // Process online orders
      ordersData?.forEach(order => {
        const monthKey = getMonthName(new Date(order.created_at));
        const existing = monthlyMap.get(monthKey) || { revenue: 0, profit: 0, salesCount: 0 };
        monthlyMap.set(monthKey, {
          revenue: existing.revenue + (order.total || 0),
          profit: existing.profit, // Online orders profit calculation would need product data
          salesCount: existing.salesCount + 1
        });

        // Add to online payment methods
        const paymentMethod = "الدفع الإلكتروني";
        const paymentExisting = paymentMethodMap.get(paymentMethod) || { amount: 0, count: 0 };
        paymentMethodMap.set(paymentMethod, {
          amount: paymentExisting.amount + (order.total || 0),
          count: paymentExisting.count + 1
        });
      });

      // Convert to arrays
      const monthlyArray = Array.from(monthlyMap.entries()).map(([month, data]) => ({
        month,
        revenue: data.revenue,
        profit: data.profit,
        salesCount: data.salesCount
      }));

      const paymentColors = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', '#8884d8', '#82ca9d'];
      const paymentArray = Array.from(paymentMethodMap.entries()).map(([method, data], index) => ({
        method,
        amount: data.amount,
        count: data.count,
        color: paymentColors[index % paymentColors.length]
      }));

      // Calculate totals
      const totalRev = monthlyArray.reduce((sum, item) => sum + item.revenue, 0);
      const totalProf = monthlyArray.reduce((sum, item) => sum + item.profit, 0);
      const totalSalesCount = monthlyArray.reduce((sum, item) => sum + item.salesCount, 0);
      const avgOrder = totalSalesCount > 0 ? totalRev / totalSalesCount : 0;

      setMonthlyData(monthlyArray);
      setPaymentMethodsData(paymentArray);
      setTotalRevenue(totalRev);
      setTotalProfit(totalProf);
      setTotalSales(totalSalesCount);
      setAvgOrderValue(avgOrder);
    } catch (error) {
      console.error('Error fetching revenue data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRevenueData();
  }, [selectedPeriod, dateRange]);

  const getMonthName = (date: Date): string => {
    return date.toLocaleDateString('ar-EG', { 
      month: 'short', 
      year: 'numeric' 
    });
  };

  const getPaymentMethodLabel = (method: string): string => {
    const labels: { [key: string]: string } = {
      'cash': 'نقدي',
      'card': 'بطاقة',
      'mixed': 'مختلط',
      'online': 'إلكتروني'
    };
    return labels[method] || method || 'غير محدد';
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg">جاري تحميل بيانات الإيرادات...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الإيرادات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(totalRevenue)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الأرباح</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalProfit)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المبيعات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{totalSales}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">متوسط قيمة الطلب</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{formatCurrency(avgOrderValue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="monthly" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="monthly">الاتجاه الشهري</TabsTrigger>
          <TabsTrigger value="payment-methods">طرق الدفع</TabsTrigger>
          <TabsTrigger value="profit-analysis">تحليل الأرباح</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>الاتجاه الشهري للإيرادات</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" name="الإيرادات" />
                  <Bar dataKey="profit" fill="hsl(var(--secondary))" name="الأرباح" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payment-methods" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>توزيع الإيرادات حسب طريقة الدفع</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={paymentMethodsData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ method, amount }) => `${method}: ${formatCurrency(amount)}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="amount"
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
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {paymentMethodsData.map((method, index) => (
                    <div key={method.method} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded" 
                          style={{ backgroundColor: method.color }}
                        />
                        <span>{method.method}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{formatCurrency(method.amount)}</div>
                        <div className="text-sm text-muted-foreground">{method.count} معاملة</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="profit-analysis" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>مقارنة الإيرادات والأرباح</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    name="الإيرادات"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="profit" 
                    stroke="hsl(var(--secondary))" 
                    strokeWidth={2}
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