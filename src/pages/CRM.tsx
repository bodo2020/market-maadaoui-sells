import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomersList } from "@/components/customers/CustomersList";
import { CustomerInteractions } from "@/components/crm/CustomerInteractions";
import { CustomerAnalytics } from "@/components/crm/CustomerAnalytics";
import { LeadsManagement } from "@/components/crm/LeadsManagement";
import { fetchCustomers } from "@/services/supabase/customerService";
import { Users, TrendingUp, Target, Award, Search, Plus, Filter } from "lucide-react";

export default function CRM() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("customers");

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers,
  });

  // إحصائيات سريعة
  const totalCustomers = customers.length;
  const verifiedCustomers = customers.filter(c => c.phone_verified).length;
  const newCustomersThisMonth = customers.filter(c => {
    const customerDate = new Date(c.created_at);
    const now = new Date();
    return customerDate.getMonth() === now.getMonth() && 
           customerDate.getFullYear() === now.getFullYear();
  }).length;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">إدارة علاقات العملاء (CRM)</h1>
            <p className="text-muted-foreground">
              إدارة شاملة لعملائك وتتبع تفاعلاتهم ومبيعاتهم
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Filter className="h-4 w-4 ml-2" />
              فلترة
            </Button>
            <Button>
              <Plus className="h-4 w-4 ml-2" />
              عميل جديد
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي العملاء</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCustomers}</div>
              <p className="text-xs text-muted-foreground">
                +{newCustomersThisMonth} هذا الشهر
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">عملاء مفعلين</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{verifiedCustomers}</div>
              <p className="text-xs text-muted-foreground">
                {((verifiedCustomers / totalCustomers) * 100).toFixed(1)}% من الإجمالي
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">عملاء محتملين</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">24</div>
              <p className="text-xs text-muted-foreground">
                +12% من الأسبوع الماضي
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">معدل التحويل</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">68%</div>
              <p className="text-xs text-muted-foreground">
                +5% من الشهر الماضي
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث عن عميل بالاسم أو رقم الهاتف أو البريد الإلكتروني..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
              <Badge variant="secondary" className="mr-2">
                {totalCustomers} عميل
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="customers">قائمة العملاء</TabsTrigger>
            <TabsTrigger value="interactions">التفاعلات</TabsTrigger>
            <TabsTrigger value="leads">العملاء المحتملين</TabsTrigger>
            <TabsTrigger value="analytics">التحليلات</TabsTrigger>
          </TabsList>

          <TabsContent value="customers" className="space-y-4">
            <CustomersList searchTerm={searchTerm} />
          </TabsContent>

          <TabsContent value="interactions" className="space-y-4">
            <CustomerInteractions />
          </TabsContent>

          <TabsContent value="leads" className="space-y-4">
            <LeadsManagement />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <CustomerAnalytics />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}