import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { OrderDetailsDialog } from "@/components/orders/OrderDetailsDialog";
import { useNotificationStore } from "@/stores/notificationStore";
import { Order, OrderItem } from "@/types/index";
import { Input } from "@/components/ui/input";
import { Search, Download } from "lucide-react";
import { CustomerProfileDialog } from "@/components/orders/CustomerProfileDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
type OrderFromDB = {
  id: string;
  created_at: string;
  total: number;
  status: string;
  payment_status: string;
  payment_method: string | null;
  shipping_address: string | null;
  items: any;
  customer_id?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  tracking_number?: string | null;
  shipping_cost?: number | null;
  notes?: string | null;
  updated_at?: string | null;
};
export default function OnlineOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const {
    markOrdersAsRead
  } = useNotificationStore();
  useEffect(() => {
    fetchOrders();
    const channel = subscribeToOrders();
    markOrdersAsRead();
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [activeTab]);
  const subscribeToOrders = () => {
    const channel = supabase.channel('online-orders').on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'online_orders'
    }, payload => {
      toast.info("طلب جديد!", {
        description: "تم استلام طلب جديد"
      });
      fetchOrders();
    }).on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'online_orders'
    }, payload => {
      fetchOrders();
    }).subscribe();
    return channel;
  };
  const fetchOrders = async () => {
    try {
      setLoading(true);
      let query = supabase.from('online_orders').select('*').order('created_at', {
        ascending: false
      });
      if (activeTab === "pending") {
        query = query.eq('status', 'pending');
      } else if (activeTab === "processing") {
        query = query.eq('status', 'processing');
      } else if (activeTab === "shipped") {
        query = query.eq('status', 'shipped');
      } else if (activeTab === "delivered") {
        query = query.eq('status', 'delivered');
      } else if (activeTab === "cancelled") {
        query = query.eq('status', 'cancelled');
      } else if (activeTab === "unpaid") {
        query = query.eq('payment_status', 'pending');
      }
      const {
        data,
        error
      } = await query;
      if (error) throw error;
      const transformedOrders: Order[] = (data || []).map((item: OrderFromDB) => ({
        id: item.id,
        created_at: item.created_at,
        total: item.total,
        status: validateOrderStatus(item.status),
        payment_status: validatePaymentStatus(item.payment_status),
        payment_method: item.payment_method,
        shipping_address: item.shipping_address,
        items: Array.isArray(item.items) ? item.items : [],
        customer_name: item.customer_name || 'غير معروف',
        customer_email: item.customer_email || '',
        customer_phone: item.customer_phone || ''
      }));
      setOrders(transformedOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error("حدث خطأ أثناء تحميل الطلبات");
    } finally {
      setLoading(false);
    }
  };
  const validateOrderStatus = (status: string): Order['status'] => {
    const validStatuses: Order['status'][] = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    return validStatuses.includes(status as Order['status']) ? status as Order['status'] : 'pending';
  };
  const validatePaymentStatus = (status: string): Order['payment_status'] => {
    const validStatuses: Order['payment_status'][] = ['pending', 'paid', 'failed', 'refunded'];
    return validStatuses.includes(status as Order['payment_status']) ? status as Order['payment_status'] : 'pending';
  };
  const getStatusBadge = (status: Order['status']) => {
    const variants: Record<Order['status'], "default" | "destructive" | "outline" | "secondary"> = {
      pending: "outline",
      processing: "secondary",
      shipped: "default",
      delivered: "default",
      cancelled: "destructive"
    };
    const labels: Record<Order['status'], string> = {
      pending: "قيد الانتظار",
      processing: "قيد المعالجة",
      shipped: "تم الشحن",
      delivered: "تم التسليم",
      cancelled: "ملغي"
    };
    return <div className="flex items-center gap-2">
        {(status === 'pending' || status === 'processing') && <div className="w-2 h-2 rounded-full bg-green-500"></div>}
        <Badge variant={variants[status]}>{labels[status]}</Badge>
      </div>;
  };
  const getPaymentStatusBadge = (status: Order['payment_status']) => {
    const variants: Record<Order['payment_status'], "default" | "destructive" | "outline" | "secondary"> = {
      pending: "outline",
      paid: "default",
      failed: "destructive",
      refunded: "secondary"
    };
    const labels: Record<Order['payment_status'], string> = {
      pending: "قيد الانتظار",
      paid: "تم الدفع",
      failed: "فشل الدفع",
      refunded: "تم الاسترجاع"
    };
    return <div className="flex items-center gap-2">
        {status === 'pending' && <div className="w-2 h-2 rounded-full bg-amber-500"></div>}
        <Badge variant={variants[status]}>{labels[status]}</Badge>
      </div>;
  };
  const getPendingOrdersCount = () => {
    return orders.filter(order => order.status === 'pending' || order.status === 'processing').length;
  };
  const getUnpaidOrdersCount = () => {
    return orders.filter(order => order.payment_status === 'pending').length;
  };
  const filteredOrders = orders.filter(order => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return order.id.toLowerCase().includes(searchLower) || order.customer_name && order.customer_name.toLowerCase().includes(searchLower) || order.customer_phone && order.customer_phone.toLowerCase().includes(searchLower);
  });
  const showCustomerProfile = (order: Order) => {
    setSelectedCustomer({
      name: order.customer_name,
      email: order.customer_email,
      phone: order.customer_phone,
      address: order.shipping_address,
      order: order
    });
  };
  const downloadOrders = () => {
    toast.info("جاري تحميل الطلبات...");
  };
  return <MainLayout>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">الطلبات الإلكترونية</h1>
          <div className="flex gap-2">
            <Button onClick={downloadOrders} variant="outline" size="sm">
              <Download className="ml-2 h-4 w-4" />
              استخراج
            </Button>
            <Button onClick={() => fetchOrders()} variant="default" size="sm">
              أنشئ طلب
            </Button>
          </div>
        </div>

        <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full mb-6">
          <TabsList className="grid grid-cols-7 mb-4">
            <TabsTrigger value="all" className="relative">
              الجميع
              <Badge className="mr-2 bg-primary">{orders.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="pending" className="relative">
              بإنتظار التجهيز
              <Badge className="mr-2 bg-primary">{getPendingOrdersCount()}</Badge>
            </TabsTrigger>
            <TabsTrigger value="processing">قيد المعالجة</TabsTrigger>
            <TabsTrigger value="shipped">تم الشحن</TabsTrigger>
            <TabsTrigger value="delivered">تم التسليم</TabsTrigger>
            <TabsTrigger value="cancelled">ملغي</TabsTrigger>
            <TabsTrigger value="unpaid" className="relative">
              غير مدفوع
              <Badge className="mr-2 bg-primary">{getUnpaidOrdersCount()}</Badge>
            </TabsTrigger>
          </TabsList>

          <div className="mb-4 flex">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="البحث والتصنيفات" className="pr-10" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
          </div>

          <TabsContent value={activeTab} className="m-0">
            <Card>
              <CardHeader>
                <CardTitle>قائمة الطلبات</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? <p>جاري التحميل...</p> : <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>رقم الطلب</TableHead>
                        <TableHead>التاريخ</TableHead>
                        <TableHead>بيانات العميل</TableHead>
                        <TableHead>المبلغ</TableHead>
                        <TableHead>حالة الطلب</TableHead>
                        <TableHead>حالة الدفع</TableHead>
                        
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.length === 0 ? <TableRow>
                          <TableCell colSpan={7} className="text-center">
                            لا توجد طلبات مسجلة
                          </TableCell>
                        </TableRow> : filteredOrders.map(order => <TableRow key={order.id}>
                            <TableCell>#{order.id.slice(0, 8)}</TableCell>
                            <TableCell>
                              {new Date(order.created_at).toLocaleDateString('ar')}
                            </TableCell>
                            <TableCell>
                              <Button variant="link" className="p-0 h-auto text-right underline" onClick={() => showCustomerProfile(order)}>
                                {order.customer_name || 'غير معروف'}
                              </Button>
                            </TableCell>
                            <TableCell>{order.total} ج.م</TableCell>
                            
                            <TableCell>{getPaymentStatusBadge(order.payment_status)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(order)}>
                                عرض التفاصيل
                              </Button>
                            </TableCell>
                          </TableRow>)}
                    </TableBody>
                  </Table>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <OrderDetailsDialog order={selectedOrder} open={!!selectedOrder} onOpenChange={open => !open && setSelectedOrder(null)} onStatusUpdated={fetchOrders} />
        
        <CustomerProfileDialog customer={selectedCustomer} open={!!selectedCustomer} onOpenChange={open => !open && setSelectedCustomer(null)} />
      </div>
    </MainLayout>;
}