import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomerStats } from "./CustomerStats";
import { CRMDashboard } from "./CRMDashboard";
import CustomersList from "@/components/customers/CustomersList";
import { CustomerInteractions } from "./CustomerInteractions";
import { LeadsManagement } from "./LeadsManagement";
import { ProductAnalytics } from "./ProductAnalytics";
import { OrderHeatmap } from "./OrderHeatmap";
import { fetchCustomers } from "@/services/supabase/customerService";
import { fetchCustomerAnalytics } from "@/services/supabase/crmService";
import { Users, Search, Plus, Filter, BarChart3, MessageSquare, Target, Download } from "lucide-react";
export function EnhancedCRM() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const {
    data: customers = [],
    isLoading
  } = useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers
  });
  const {
    data: analytics
  } = useQuery({
    queryKey: ["customer-analytics"],
    queryFn: fetchCustomerAnalytics
  });
  const filteredCustomers = customers.filter(customer => customer.name.toLowerCase().includes(searchTerm.toLowerCase()) || customer.phone && customer.phone.includes(searchTerm) || customer.email && customer.email.toLowerCase().includes(searchTerm.toLowerCase()));
  return <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">نظام إدارة علاقات العملاء</h1>
          <p className="text-muted-foreground">
            إدارة شاملة لعملائك وتتبع تفاعلاتهم ومبيعاتهم
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 ml-2" />
            تصدير البيانات
          </Button>
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
      <CustomerStats />

      {/* Search Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="ابحث عن عميل بالاسم أو رقم الهاتف أو البريد الإلكتروني..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="max-w-sm" />
            <Badge variant="secondary" className="mr-2">
              {searchTerm ? `${filteredCustomers.length} نتيجة` : `${customers.length} عميل`}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            لوحة التحكم
          </TabsTrigger>
          <TabsTrigger value="customers" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            قائمة العملاء
          </TabsTrigger>
          <TabsTrigger value="interactions" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            التفاعلات
          </TabsTrigger>
          <TabsTrigger value="leads" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            العملاء المحتملين
          </TabsTrigger>
          
          
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <CRMDashboard />
        </TabsContent>

        <TabsContent value="customers" className="space-y-4">
          <CustomersList searchTerm={searchTerm} />
        </TabsContent>

        <TabsContent value="interactions" className="space-y-4">
          <CustomerInteractions />
        </TabsContent>

          <TabsContent value="leads" className="space-y-4">
            <LeadsManagement />
          </TabsContent>
      </Tabs>
    </div>;
}