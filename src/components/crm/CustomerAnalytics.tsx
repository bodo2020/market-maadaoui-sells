import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchCustomers } from "@/services/supabase/customerService";
import { fetchCustomerAnalytics } from "@/services/supabase/crmService";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from "recharts";
import { 
  TrendingUp, 
  Users, 
  ShoppingCart, 
  DollarSign,
  Calendar,
  Star,
  Target,
  Award
} from "lucide-react";

export function CustomerAnalytics() {
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["customer-analytics"],
    queryFn: fetchCustomerAnalytics,
  });

  // التأكد من وجود البيانات
  const safeAnalytics = analytics || {
    totalCustomers: 0,
    newCustomersThisMonth: 0,
    verifiedCustomers: 0,
    totalSales: 0,
    totalRevenue: 0,
    averageOrderValue: 0,
    conversionRate: 0
  };

  // تحضير البيانات الحقيقية للرسوم البيانية
  const getMonthlyCustomers = () => {
    if (!customers.length) return [];
    
    const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const monthlyData = [];
    
    for (let i = 0; i < 6; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - i));
      const month = date.getMonth();
      const year = date.getFullYear();
      
      const monthCustomers = customers.filter(customer => {
        const customerDate = new Date(customer.created_at);
        return customerDate.getMonth() === month && customerDate.getFullYear() === year;
      });
      
      monthlyData.push({
        month: monthNames[month],
        customers: monthCustomers.length,
        sales: Math.floor(Math.random() * 20000) + 10000 // بيانات وهمية للمبيعات حتى نربطها بجدول المبيعات
      });
    }
    
    return monthlyData;
  };

  const getCustomerSegments = () => {
    if (!customers.length) return [
      { name: 'عملاء VIP', value: 0, color: '#8884d8' },
      { name: 'عملاء منتظمين', value: 0, color: '#82ca9d' },
      { name: 'عملاء جدد', value: 0, color: '#ffc658' },
    ];

    const verifiedCustomers = customers.filter(c => c.phone_verified).length;
    const totalCustomers = customers.length;
    const newCustomers = customers.filter(c => {
      const customerDate = new Date(c.created_at);
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      return customerDate > oneMonthAgo;
    }).length;

    return [
      { name: 'عملاء موثقين', value: verifiedCustomers, color: '#8884d8' },
      { name: 'عملاء عاديين', value: totalCustomers - verifiedCustomers - newCustomers, color: '#82ca9d' },
      { name: 'عملاء جدد', value: newCustomers, color: '#ffc658' },
    ];
  };

  const getTopCustomers = () => {
    if (!customers.length) return [];
    
    return customers.slice(0, 5).map((customer, index) => ({
      name: customer.name || 'عميل غير معروف',
      orders: Math.floor(Math.random() * 50) + 1, // بيانات وهمية حتى نربطها بجدول الطلبات
      total: Math.floor(Math.random() * 30000) + 5000,
      status: customer.phone_verified ? 'موثق' : 'عادي'
    }));
  };

  const monthlyCustomers = getMonthlyCustomers();
  const customerSegments = getCustomerSegments();
  const topCustomers = getTopCustomers();

  if (isLoading || analyticsLoading) {
    return <div>جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">تحليلات العملاء</h2>

      {/* المقاييس الرئيسية */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي العملاء</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{safeAnalytics.totalCustomers}</div>
            <p className="text-xs text-muted-foreground">
              عدد العملاء المسجلين
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">عملاء جدد هذا الشهر</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{safeAnalytics.newCustomersThisMonth}</div>
            <p className="text-xs text-muted-foreground">
              عملاء مسجلين حديثاً
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">عملاء موثقين</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{safeAnalytics.verifiedCustomers}</div>
            <p className="text-xs text-muted-foreground">
              عملاء موثقين بالهاتف
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">متوسط قيمة الطلب</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{safeAnalytics.averageOrderValue.toFixed(0)} ج.م</div>
            <p className="text-xs text-muted-foreground">
              متوسط قيمة الطلب الواحد
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* الرسم البياني الشهري */}
        <Card>
          <CardHeader>
            <CardTitle>نمو العملاء الشهري</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyCustomers}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="customers" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* تقسيم العملاء */}
        <Card>
          <CardHeader>
            <CardTitle>تقسيم العملاء</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={customerSegments}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
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

      {/* أفضل العملاء */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Award className="h-5 w-5 ml-2" />
            أفضل العملاء
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {topCustomers.map((customer, index) => (
              <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="bg-primary/10 text-primary rounded-full w-8 h-8 flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium">{customer.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {customer.orders} طلب
                    </p>
                  </div>
                </div>
                <div className="text-left">
                  <p className="font-bold">{customer.total.toLocaleString()} ج.م</p>
                  <Badge variant={customer.status === 'VIP' ? 'default' : 'secondary'}>
                    {customer.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* اتجاهات المبيعات */}
      <Card>
        <CardHeader>
          <CardTitle>اتجاهات المبيعات للعملاء</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyCustomers}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line 
                type="monotone" 
                dataKey="sales" 
                stroke="#8884d8" 
                strokeWidth={2}
                dot={{ fill: '#8884d8' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}