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

  const { data: analytics = {}, isLoading: analyticsLoading } = useQuery({
    queryKey: ["customer-analytics"],
    queryFn: fetchCustomerAnalytics,
  });

  // بيانات وهمية للرسوم البيانية
  const monthlyCustomers = [
    { month: 'يناير', customers: 45, sales: 12500 },
    { month: 'فبراير', customers: 52, sales: 15200 },
    { month: 'مارس', customers: 38, sales: 9800 },
    { month: 'أبريل', customers: 61, sales: 18900 },
    { month: 'مايو', customers: 55, sales: 16700 },
    { month: 'يونيو', customers: 67, sales: 21300 },
  ];

  const customerSegments = [
    { name: 'عملاء VIP', value: 25, color: '#8884d8' },
    { name: 'عملاء منتظمين', value: 45, color: '#82ca9d' },
    { name: 'عملاء جدد', value: 30, color: '#ffc658' },
  ];

  const topCustomers = [
    { name: 'أحمد محمد', orders: 45, total: 25600, status: 'VIP' },
    { name: 'فاطمة أحمد', orders: 38, total: 19800, status: 'منتظم' },
    { name: 'محمد علي', orders: 42, total: 22100, status: 'VIP' },
    { name: 'نور الدين', orders: 29, total: 15400, status: 'منتظم' },
    { name: 'سارة حسن', orders: 33, total: 18200, status: 'منتظم' },
  ];

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
            <CardTitle className="text-sm font-medium">متوسط قيمة الطلب</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">385 ج.م</div>
            <p className="text-xs text-muted-foreground">
              +12% من الشهر الماضي
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">متوسط الطلبات شهرياً</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">4.2</div>
            <p className="text-xs text-muted-foreground">
              +8% من الشهر الماضي
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">معدل الاحتفاظ</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">74%</div>
            <p className="text-xs text-muted-foreground">
              +5% من الشهر الماضي
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">مدة حياة العميل</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">18 شهر</div>
            <p className="text-xs text-muted-foreground">
              +2 شهر من العام الماضي
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