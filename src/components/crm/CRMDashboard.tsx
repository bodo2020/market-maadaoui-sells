import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchCustomers } from "@/services/supabase/customerService";
import { fetchCustomerAnalytics, getCustomerLifecycleData } from "@/services/supabase/crmService";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Users, ShoppingCart, TrendingUp, DollarSign } from "lucide-react";

export function CRMDashboard() {
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers,
  });

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["customer-analytics"],
    queryFn: fetchCustomerAnalytics,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">جاري التحميل...</div>;
  }

  // بيانات للرسوم البيانية
  const customerGrowthData = [
    { month: "يناير", customers: 45 },
    { month: "فبراير", customers: 52 },
    { month: "مارس", customers: 48 },
    { month: "أبريل", customers: 62 },
    { month: "مايو", customers: analytics?.totalCustomers || 62 },
  ];

  const customerSegmentData = [
    { name: "عملاء مفعلين", value: analytics?.verifiedCustomers || 0, color: "#10b981" },
    { name: "عملاء جدد", value: analytics?.newCustomersThisMonth || 0, color: "#3b82f6" },
    { name: "عملاء غير مفعلين", value: (analytics?.totalCustomers || 0) - (analytics?.verifiedCustomers || 0), color: "#f59e0b" },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي العملاء</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.totalCustomers || 0}</div>
            <p className="text-xs text-muted-foreground">
              +{analytics?.newCustomersThisMonth || 0} هذا الشهر
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المبيعات</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.totalSales || 0}</div>
            <p className="text-xs text-muted-foreground">
              عملية بيع
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الإيرادات</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(analytics?.totalRevenue || 0).toFixed(0)} ج.م</div>
            <p className="text-xs text-muted-foreground">
              من جميع المبيعات
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">متوسط قيمة الطلب</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(analytics?.averageOrderValue || 0).toFixed(0)} ج.م</div>
            <p className="text-xs text-muted-foreground">
              لكل عملية شراء
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Growth Chart */}
        <Card>
          <CardHeader>
            <CardTitle>نمو العملاء الشهري</CardTitle>
            <CardDescription>عدد العملاء الجدد كل شهر</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={customerGrowthData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="customers" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Customer Segments */}
        <Card>
          <CardHeader>
            <CardTitle>تصنيف العملاء</CardTitle>
            <CardDescription>توزيع العملاء حسب الحالة</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={customerSegmentData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {customerSegmentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Customers */}
      <Card>
        <CardHeader>
          <CardTitle>العملاء الجدد</CardTitle>
          <CardDescription>آخر العملاء المضافين للنظام</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {customers.slice(0, 5).map((customer) => (
              <div key={customer.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <p className="font-medium">{customer.name}</p>
                  <p className="text-sm text-muted-foreground">{customer.phone || "لا يوجد هاتف"}</p>
                </div>
                <div className="text-left space-y-1">
                  <Badge variant={customer.phone_verified ? "default" : "secondary"}>
                    {customer.phone_verified ? "مفعل" : "غير مفعل"}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {new Date(customer.created_at).toLocaleDateString("ar-EG")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}