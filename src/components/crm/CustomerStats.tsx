import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchCustomers } from "@/services/supabase/customerService";
import { supabase } from "@/integrations/supabase/client";
import { Users, Phone, MapPin, Calendar } from "lucide-react";

export function CustomerStats() {
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers,
  });

  // إحصائيات العملاء
  const totalCustomers = customers.length;
  const verifiedCustomers = customers.filter(c => c.phone_verified).length;
  const customersWithPhone = customers.filter(c => c.phone).length;
  const customersWithAddress = customers.filter(c => c.address).length;

  // العملاء الجدد هذا الشهر
  const currentDate = new Date();
  const newThisMonth = customers.filter(customer => {
    const customerDate = new Date(customer.created_at);
    return customerDate.getMonth() === currentDate.getMonth() && 
           customerDate.getFullYear() === currentDate.getFullYear();
  }).length;

  if (isLoading) {
    return <div>جاري التحميل...</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">إجمالي العملاء</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalCustomers}</div>
          <p className="text-xs text-muted-foreground">
            جميع العملاء المسجلين
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">عملاء مفعلين</CardTitle>
          <Phone className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{verifiedCustomers}</div>
          <p className="text-xs text-muted-foreground">
            {totalCustomers > 0 ? ((verifiedCustomers / totalCustomers) * 100).toFixed(1) : 0}% من الإجمالي
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">عملاء جدد</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{newThisMonth}</div>
          <p className="text-xs text-muted-foreground">
            هذا الشهر
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">بيانات كاملة</CardTitle>
          <MapPin className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{customersWithAddress}</div>
          <p className="text-xs text-muted-foreground">
            عملاء لديهم عناوين
          </p>
        </CardContent>
      </Card>
    </div>
  );
}