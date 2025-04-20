
import { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RefreshCw } from "lucide-react";
import { fetchReturnOrders, ReturnOrder } from "@/services/supabase/returnOrderService";
import ReturnOrdersTable from "@/components/returns/ReturnOrdersTable";

export default function ReturnOrders() {
  const [returnOrders, setReturnOrders] = useState<ReturnOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const loadReturnOrders = async () => {
      try {
        setLoading(true);
        
        let filter: { status?: ReturnOrder["status"], order_type?: 'online' | 'pos' } = {};
        
        if (activeTab === "pending") {
          filter.status = "pending";
        } else if (activeTab === "approved") {
          filter.status = "approved";
        } else if (activeTab === "rejected") {
          filter.status = "rejected";
        } else if (activeTab === "online") {
          filter.order_type = "online";
        } else if (activeTab === "pos") {
          filter.order_type = "pos";
        }
        
        const orders = await fetchReturnOrders(filter);
        setReturnOrders(orders);
      } catch (error) {
        console.error("Error loading return orders:", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadReturnOrders();
  }, [activeTab, refreshKey]);

  const handleRefresh = () => {
    setRefreshKey(prevKey => prevKey + 1);
  };

  const filteredOrders = returnOrders.filter(order => {
    if (!searchQuery) return true;
    
    const searchLower = searchQuery.toLowerCase();
    const idMatch = order.id.toLowerCase().includes(searchLower);
    const customerMatch = order.customer_name?.toLowerCase().includes(searchLower) || false;
    const phoneMatch = order.customer_phone?.toLowerCase().includes(searchLower) || false;
    const invoiceMatch = order.invoice_number?.toLowerCase().includes(searchLower) || false;
    
    return idMatch || customerMatch || phoneMatch || invoiceMatch;
  });

  const countByStatus = {
    all: returnOrders.length,
    pending: returnOrders.filter(o => o.status === 'pending').length,
    approved: returnOrders.filter(o => o.status === 'approved').length,
    rejected: returnOrders.filter(o => o.status === 'rejected').length,
    online: returnOrders.filter(o => o.order_type === 'online').length,
    pos: returnOrders.filter(o => o.order_type === 'pos').length
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6 dir-rtl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">طلبات المرتجعات</h1>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="flex items-center gap-1">
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm font-medium">كل الطلبات</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 pt-0 px-4">
              <p className="text-2xl font-bold">{countByStatus.all}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm font-medium">قيد الانتظار</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 pt-0 px-4">
              <p className="text-2xl font-bold text-yellow-600">{countByStatus.pending}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm font-medium">تمت الموافقة</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 pt-0 px-4">
              <p className="text-2xl font-bold text-green-600">{countByStatus.approved}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm font-medium">مرفوضة</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 pt-0 px-4">
              <p className="text-2xl font-bold text-red-600">{countByStatus.rejected}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm font-medium">طلبات أونلاين</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 pt-0 px-4">
              <p className="text-2xl font-bold text-blue-600">{countByStatus.online}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm font-medium">نقاط البيع</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 pt-0 px-4">
              <p className="text-2xl font-bold text-purple-600">{countByStatus.pos}</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full">
                <TabsTrigger value="all">الكل</TabsTrigger>
                <TabsTrigger value="pending">قيد الانتظار</TabsTrigger>
                <TabsTrigger value="approved">تمت الموافقة</TabsTrigger>
                <TabsTrigger value="rejected">مرفوضة</TabsTrigger>
                <TabsTrigger value="online">طلبات أونلاين</TabsTrigger>
                <TabsTrigger value="pos">نقاط البيع</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="relative w-full max-w-sm mb-4">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="البحث في الطلبات..."
              className="pl-10 pr-10"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>قائمة طلبات المرتجعات</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center items-center h-64">
                  <p className="text-center py-4">جاري التحميل...</p>
                </div>
              ) : (
                <ReturnOrdersTable 
                  returnOrders={filteredOrders} 
                  onOrderUpdated={handleRefresh} 
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
