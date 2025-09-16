import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, Bar, BarChart } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodType, getDateRangeFromPeriod } from "@/components/analytics/PeriodFilter";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ar } from "date-fns/locale";

interface NetProfitAnalyticsProps {
  selectedPeriod: PeriodType;
}

interface MonthlyNetProfit {
  month: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  growthRate: number;
}

async function fetchNetProfitAnalytics(dateRange: { from: Date; to: Date }) {
  try {
    // جلب الإيرادات (مبيعات + طلبات إلكترونية)
    const { data: salesData, error: salesError } = await supabase
      .from("sales")
      .select("total, date")
      .gte('date', dateRange.from.toISOString())
      .lte('date', dateRange.to.toISOString());

    if (salesError) throw salesError;

    const { data: ordersData, error: ordersError } = await supabase
      .from("online_orders")
      .select("total, created_at")
      .gte('created_at', dateRange.from.toISOString())
      .lte('created_at', dateRange.to.toISOString());

    if (ordersError) throw ordersError;

    // جلب المصروفات
    const { data: expensesData, error: expensesError } = await supabase
      .from("expenses")
      .select("amount, date")
      .gte('date', dateRange.from.toISOString())
      .lte('date', dateRange.to.toISOString());

    if (expensesError) throw expensesError;

    // جلب الرواتب
    const { data: salariesData, error: salariesError } = await supabase
      .from("salaries")
      .select("amount, payment_date")
      .gte('payment_date', dateRange.from.toISOString().split('T')[0])
      .lte('payment_date', dateRange.to.toISOString().split('T')[0]);

    if (salariesError) throw salariesError;

    // جلب الأضرار
    const { data: damagesData, error: damagesError } = await supabase
      .from("damaged_products")
      .select("damage_cost, damage_date")
      .gte('damage_date', dateRange.from.toISOString().split('T')[0])
      .lte('damage_date', dateRange.to.toISOString().split('T')[0]);

    if (damagesError) throw damagesError;

    // تجميع البيانات حسب الشهر
    const monthlyData = new Map<string, { revenue: number; expenses: number }>();

    // إضافة الشهور للفترة المحددة
    let currentDate = startOfMonth(dateRange.from);
    const endDate = endOfMonth(dateRange.to);

    while (currentDate <= endDate) {
      const monthKey = format(currentDate, 'yyyy-MM');
      monthlyData.set(monthKey, { revenue: 0, expenses: 0 });
      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    }

    // معالجة المبيعات
    salesData?.forEach(sale => {
      const monthKey = format(new Date(sale.date), 'yyyy-MM');
      const data = monthlyData.get(monthKey);
      if (data) {
        data.revenue += Number(sale.total || 0);
      }
    });

    // معالجة الطلبات الإلكترونية
    ordersData?.forEach(order => {
      const monthKey = format(new Date(order.created_at), 'yyyy-MM');
      const data = monthlyData.get(monthKey);
      if (data) {
        data.revenue += Number(order.total || 0);
      }
    });

    // معالجة المصروفات
    expensesData?.forEach(expense => {
      const monthKey = format(new Date(expense.date), 'yyyy-MM');
      const data = monthlyData.get(monthKey);
      if (data) {
        data.expenses += Number(expense.amount || 0);
      }
    });

    // معالجة الرواتب
    salariesData?.forEach(salary => {
      if (salary.payment_date) {
        const monthKey = format(new Date(salary.payment_date), 'yyyy-MM');
        const data = monthlyData.get(monthKey);
        if (data) {
          data.expenses += Number(salary.amount || 0);
        }
      }
    });

    // معالجة الأضرار
    damagesData?.forEach(damage => {
      const monthKey = format(new Date(damage.damage_date), 'yyyy-MM');
      const data = monthlyData.get(monthKey);
      if (data) {
        data.expenses += Number(damage.damage_cost || 0);
      }
    });

    // تحويل البيانات إلى مصفوفة وحساب الأرباح الصافية ومعدل النمو
    const result: MonthlyNetProfit[] = [];
    let previousNetProfit = 0;

    Array.from(monthlyData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([monthKey, data]) => {
        const netProfit = data.revenue - data.expenses;
        const growthRate = previousNetProfit !== 0 
          ? ((netProfit - previousNetProfit) / Math.abs(previousNetProfit)) * 100 
          : 0;

        result.push({
          month: format(new Date(monthKey + '-01'), 'MMM yyyy', { locale: ar }),
          revenue: data.revenue,
          expenses: data.expenses,
          netProfit: netProfit,
          growthRate: result.length > 0 ? growthRate : 0
        });

        previousNetProfit = netProfit;
      });

    return result;
  } catch (error) {
    console.error("Error fetching net profit analytics:", error);
    throw error;
  }
}

export function NetProfitAnalytics({ selectedPeriod }: NetProfitAnalyticsProps) {
  const dateRange = getDateRangeFromPeriod(selectedPeriod);
  
  const { data: netProfitData, isLoading, error } = useQuery({
    queryKey: ["net-profit-analytics", selectedPeriod],
    queryFn: () => fetchNetProfitAnalytics({ 
      from: dateRange.from || new Date(), 
      to: dateRange.to || new Date() 
    }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-destructive">خطأ في تحميل تحليلات الأرباح الصافية</p>
        </CardContent>
      </Card>
    );
  }

  if (!netProfitData || netProfitData.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">لا توجد بيانات أرباح صافية في هذه الفترة</p>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  // حساب الإحصائيات الإجمالية
  const totalRevenue = netProfitData.reduce((sum, data) => sum + data.revenue, 0);
  const totalExpenses = netProfitData.reduce((sum, data) => sum + data.expenses, 0);
  const totalNetProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0;
  
  // متوسط معدل النمو
  const validGrowthRates = netProfitData.filter(data => !isNaN(data.growthRate) && isFinite(data.growthRate));
  const avgGrowthRate = validGrowthRates.length > 0 
    ? validGrowthRates.reduce((sum, data) => sum + data.growthRate, 0) / validGrowthRates.length 
    : 0;

  return (
    <div className="space-y-6">
      {/* البطاقات الإحصائية */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الإيرادات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(totalRevenue)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المصروفات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalExpenses)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">صافي الربح</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalNetProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(totalNetProfit)}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">هامش الربح</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {profitMargin.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* الاتجاه الشهري للأرباح الصافية */}
        <Card>
          <CardHeader>
            <CardTitle>اتجاه الأرباح الصافية الشهرية</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={netProfitData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip 
                  labelFormatter={(label) => `الشهر: ${label}`}
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name === 'revenue' ? 'الإيرادات' : name === 'expenses' ? 'المصروفات' : 'صافي الربح'
                  ]}
                />
                <Legend 
                  formatter={(value) => 
                    value === 'revenue' ? 'الإيرادات' : 
                    value === 'expenses' ? 'المصروفات' : 'صافي الربح'
                  }
                />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  name="revenue"
                />
                <Line 
                  type="monotone" 
                  dataKey="expenses" 
                  stroke="hsl(var(--destructive))" 
                  strokeWidth={2}
                  name="expenses"
                />
                <Line 
                  type="monotone" 
                  dataKey="netProfit" 
                  stroke="hsl(var(--accent))" 
                  strokeWidth={3}
                  name="netProfit"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* معدل النمو الشهري */}
        <Card>
          <CardHeader>
            <CardTitle>معدل نمو الأرباح الصافية</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={netProfitData.slice(1)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip 
                  labelFormatter={(label) => `الشهر: ${label}`}
                  formatter={(value: number) => [`${value.toFixed(1)}%`, 'معدل النمو']}
                />
                <Bar 
                  dataKey="growthRate" 
                  fill="hsl(var(--secondary))"
                  name="growthRate"
                />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">
                متوسط معدل النمو: <span className={`font-bold ${avgGrowthRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {avgGrowthRate.toFixed(1)}%
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* جدول تفصيلي */}
      <Card>
        <CardHeader>
          <CardTitle>البيانات التفصيلية الشهرية</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-right p-2">الشهر</th>
                  <th className="text-right p-2">الإيرادات</th>
                  <th className="text-right p-2">المصروفات</th>
                  <th className="text-right p-2">صافي الربح</th>
                  <th className="text-right p-2">هامش الربح</th>
                  <th className="text-right p-2">معدل النمو</th>
                </tr>
              </thead>
              <tbody>
                {netProfitData.map((data, index) => (
                  <tr key={data.month} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">{data.month}</td>
                    <td className="p-2 text-blue-600">{formatCurrency(data.revenue)}</td>
                    <td className="p-2 text-red-600">{formatCurrency(data.expenses)}</td>
                    <td className={`p-2 font-bold ${data.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(data.netProfit)}
                    </td>
                    <td className="p-2">
                      {data.revenue > 0 ? `${((data.netProfit / data.revenue) * 100).toFixed(1)}%` : '0%'}
                    </td>
                    <td className={`p-2 font-bold ${index === 0 ? 'text-muted-foreground' : data.growthRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {index === 0 ? '-' : `${data.growthRate.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}