import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodType, getDateRangeFromPeriod } from "@/components/analytics/PeriodFilter";

interface CustomerAnalyticsProps {
  selectedPeriod: PeriodType;
}

interface CustomerData {
  id: string;
  name: string;
  totalOrders: number;
  totalSpent: number;
  avgOrderValue: number;
}

async function fetchCustomerAnalytics(dateRange: { from: Date; to: Date }) {
  try {
    // جلب المبيعات مع بيانات العملاء
    const { data: salesData, error: salesError } = await supabase
      .from("sales")
      .select(`
        customer_name,
        customer_phone,
        total,
        date
      `)
      .gte('date', dateRange.from.toISOString().split('T')[0])
      .lte('date', dateRange.to.toISOString().split('T')[0]);

    if (salesError) throw salesError;

    // جلب الطلبات الإلكترونية
    const { data: ordersData, error: ordersError } = await supabase
      .from("online_orders")
      .select(`
        customer_id,
        total,
        created_at,
        customers (
          id,
          name,
          email
        )
      `)
      .gte('created_at', dateRange.from.toISOString())
      .lte('created_at', dateRange.to.toISOString());

    if (ordersError) throw ordersError;

    // تجميع بيانات العملاء
    const customerMap = new Map<string, CustomerData>();

    // معالجة مبيعات المتجر
    salesData?.forEach(sale => {
      if (sale.customer_name || sale.customer_phone) {
        const customerId = sale.customer_phone || sale.customer_name || 'عميل غير محدد';
        const customerName = sale.customer_name || sale.customer_phone || 'عميل غير محدد';
        
        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            id: customerId,
            name: customerName,
            totalOrders: 0,
            totalSpent: 0,
            avgOrderValue: 0
          });
        }

        const customerData = customerMap.get(customerId)!;
        customerData.totalOrders++;
        customerData.totalSpent += Number(sale.total || 0);
      }
    });

    // معالجة الطلبات الإلكترونية
    ordersData?.forEach(order => {
      if (order.customer_id && order.customers) {
        const customerId = order.customer_id;
        const customer = order.customers;
        
        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            id: customerId,
            name: customer.name || customer.email || 'عميل غير محدد',
            totalOrders: 0,
            totalSpent: 0,
            avgOrderValue: 0
          });
        }

        const customerData = customerMap.get(customerId)!;
        customerData.totalOrders++;
        customerData.totalSpent += Number(order.total || 0);
      }
    });

    // حساب متوسط قيمة الطلب لكل عميل
    customerMap.forEach(customer => {
      customer.avgOrderValue = customer.totalOrders > 0 
        ? customer.totalSpent / customer.totalOrders 
        : 0;
    });

    return Array.from(customerMap.values())
      .sort((a, b) => b.totalSpent - a.totalSpent);
  } catch (error) {
    console.error("Error fetching customer analytics:", error);
    throw error;
  }
}

export function CustomerAnalytics({ selectedPeriod }: CustomerAnalyticsProps) {
  const dateRange = getDateRangeFromPeriod(selectedPeriod);
  
  const { data: customerData, isLoading, error } = useQuery({
    queryKey: ["customer-analytics", selectedPeriod],
    queryFn: () => fetchCustomerAnalytics({ 
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
          <p className="text-destructive">خطأ في تحميل تحليلات العملاء</p>
        </CardContent>
      </Card>
    );
  }

  if (!customerData || customerData.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">لا توجد بيانات عملاء في هذه الفترة</p>
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

  // أفضل 10 عملاء
  const topCustomers = customerData.slice(0, 10);
  
  // إحصائيات إجمالية
  const totalCustomers = customerData.length;
  const totalRevenue = customerData.reduce((sum, customer) => sum + customer.totalSpent, 0);
  const totalOrders = customerData.reduce((sum, customer) => sum + customer.totalOrders, 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // تصنيف العملاء حسب الإنفاق
  const customerSegments = [
    { name: 'عملاء كبار (أكثر من 10000)', value: customerData.filter(c => c.totalSpent > 10000).length, color: 'hsl(var(--primary))' },
    { name: 'عملاء متوسطون (5000-10000)', value: customerData.filter(c => c.totalSpent >= 5000 && c.totalSpent <= 10000).length, color: 'hsl(var(--secondary))' },
    { name: 'عملاء جدد (أقل من 5000)', value: customerData.filter(c => c.totalSpent < 5000).length, color: 'hsl(var(--accent))' },
  ];

  return (
    <div className="space-y-6">
      {/* البطاقات الإحصائية */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي العملاء</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{totalCustomers}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الإيرادات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalRevenue)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الطلبات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{totalOrders}</div>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* أفضل العملاء */}
        <Card>
          <CardHeader>
            <CardTitle>أفضل 10 عملاء</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={topCustomers} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <XAxis 
                  dataKey="name" 
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  interval={0}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(label) => `العميل: ${label}`}
                  formatter={(value: number, name: string) => [
                    name === 'totalOrders' ? value.toString() : formatCurrency(value),
                    name === 'totalOrders' ? 'عدد الطلبات' : name === 'totalSpent' ? 'إجمالي الإنفاق' : 'متوسط قيمة الطلب'
                  ]}
                />
                <Legend 
                  formatter={(value) => 
                    value === 'totalOrders' ? 'عدد الطلبات' : 
                    value === 'totalSpent' ? 'إجمالي الإنفاق' : 'متوسط قيمة الطلب'
                  }
                />
                <Bar dataKey="totalSpent" fill="hsl(var(--primary))" name="totalSpent" />
                <Bar dataKey="totalOrders" fill="hsl(var(--secondary))" name="totalOrders" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* تصنيف العملاء */}
        <Card>
          <CardHeader>
            <CardTitle>تصنيف العملاء حسب الإنفاق</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={customerSegments}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {customerSegments.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* جدول العملاء */}
      <Card>
        <CardHeader>
          <CardTitle>تفاصيل أداء العملاء</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-right p-2">العميل</th>
                  <th className="text-right p-2">عدد الطلبات</th>
                  <th className="text-right p-2">إجمالي الإنفاق</th>
                  <th className="text-right p-2">متوسط قيمة الطلب</th>
                </tr>
              </thead>
              <tbody>
                {customerData.map((customer) => (
                  <tr key={customer.id} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">{customer.name}</td>
                    <td className="p-2">{customer.totalOrders}</td>
                    <td className="p-2 text-green-600">{formatCurrency(customer.totalSpent)}</td>
                    <td className="p-2">{formatCurrency(customer.avgOrderValue)}</td>
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