
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
import { Search, Download, Plus, ChevronDown, Check, Package } from "lucide-react";
import { CustomerProfileDialog } from "@/components/orders/CustomerProfileDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderActionsMenu } from "@/components/orders/OrderActionsMenu";
import { OrderItemsDialog } from "@/components/orders/OrderItemsDialog";
import { useNavigate } from "react-router-dom";
import { PaymentConfirmationDialog } from "@/components/orders/PaymentConfirmationDialog";
import { AssignDeliveryPersonDialog } from "@/components/orders/AssignDeliveryPersonDialog";

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
  delivery_person?: string | null;
};

export default function OnlineOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [selectedItems, setSelectedItems] = useState<any[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [assignDeliveryOpen, setAssignDeliveryOpen] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const {
    markOrdersAsRead
  } = useNotificationStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrders();
    const channel = subscribeToOrders();
    markOrdersAsRead();
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [activeTab, ordersRefreshKey]);

  const subscribeToOrders = () => {
    const channel = supabase.channel('online-orders')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'online_orders'
      }, payload => {
        toast.info("طلب جديد!", {
          description: "تم استلام طلب جديد"
        });
        fetchOrders();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'online_orders'
      }, payload => {
        console.log("Order updated:", payload);
        fetchOrders();
      })
      .subscribe();
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
      
      const { data, error } = await query;
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
        customer_phone: item.customer_phone || '',
        notes: item.notes || '',
        tracking_number: item.tracking_number || null,
        delivery_person: item.delivery_person || null
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
      pending: "بانتظار التجهيز",
      processing: "قيد المعالجة",
      shipped: "تم الشحن",
      delivered: "تم التسليم",
      cancelled: "ملغي"
    };
    return <Badge variant={variants[status]} className="mx-auto whitespace-nowrap">
        {labels[status]}
      </Badge>;
  };

  const getPaymentStatusBadge = (status: Order['payment_status']) => {
    const variants: Record<Order['payment_status'], "default" | "destructive" | "outline" | "secondary"> = {
      pending: "outline",
      paid: "default",
      failed: "destructive",
      refunded: "secondary"
    };
    const labels: Record<Order['payment_status'], string> = {
      pending: "بانتظار الدفع",
      paid: "مدفوع",
      failed: "فشل الدفع",
      refunded: "تم الاسترجاع"
    };
    return <Badge variant={variants[status]} className="mx-auto whitespace-nowrap">
        {labels[status]}
      </Badge>;
  };

  const getOrderItemsCount = (order: Order) => {
    return order.items ? order.items.length : 0;
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const downloadOrders = () => {
    toast.info("جاري تحميل الطلبات...");
  };

  const createNewOrder = () => {
    toast.info("إنشاء طلب جديد");
  };

  const handleArchive = (order: Order) => {
    toast.success("تم أرشفة الطلب");
  };

  const handleProcess = (order: Order) => {
    navigate(`/online-orders/${order.id}`);
  };

  const handleComplete = async (order: Order) => {
    try {
      const { error } = await supabase.from('online_orders')
        .update({
          status: 'delivered',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);
        
      if (error) throw error;
      
      fetchOrders();
      toast.success("تم اكتمال الطلب");
    } catch (error) {
      console.error('Error completing order:', error);
      toast.error("حدث خطأ أثناء اكتمال الطلب");
    }
  };

  const handleCancel = async (order: Order) => {
    try {
      const { error } = await supabase.from('online_orders')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);
        
      if (error) throw error;
      
      fetchOrders();
      toast.success("تم إلغاء الطلب");
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error("حدث خطأ أثناء إلغاء الطلب");
    }
  };

  const handlePaymentConfirm = (order: Order) => {
    setCurrentOrderId(order.id);
    setPaymentConfirmOpen(true);
  };

  const handleAssignDelivery = (order: Order) => {
    setCurrentOrderId(order.id);
    setAssignDeliveryOpen(true);
  };

  const handleOrderUpdated = () => {
    setOrdersRefreshKey(prev => prev + 1);
  };

  return <MainLayout>
      <div className="container mx-auto p-6 dir-rtl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">الطلبات</h1>
          <div className="flex gap-2">
            <Button onClick={downloadOrders} variant="outline" size="sm" className="flex items-center gap-1">
              <Download className="h-4 w-4" />
              استخراج
            </Button>
            <Button onClick={createNewOrder} variant="default" size="sm" className="flex items-center gap-1">
              <Plus className="h-4 w-4" />
              أنشئ طلب
            </Button>
          </div>
        </div>

        <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full mb-6 dir-rtl">
          <TabsList className="grid grid-cols-7 mb-4">
            <TabsTrigger value="all" className="relative font-semibold">
              الجميع
              <Badge className="mr-2 bg-primary">{orders.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="pending" className="relative font-semibold">
              بإنتظار التجهيز
              <Badge className="mr-2 bg-primary">{getPendingOrdersCount()}</Badge>
            </TabsTrigger>
            <TabsTrigger value="processing" className="font-semibold">قيد المعالجة</TabsTrigger>
            <TabsTrigger value="shipped" className="font-semibold">تم الشحن</TabsTrigger>
            <TabsTrigger value="delivered" className="font-semibold">تم التسليم</TabsTrigger>
            <TabsTrigger value="cancelled" className="font-semibold">ملغي</TabsTrigger>
            <TabsTrigger value="unpaid" className="relative font-semibold">
              غير مدفوع
              <Badge className="mr-2 bg-primary">{getUnpaidOrdersCount()}</Badge>
            </TabsTrigger>
          </TabsList>

          <div className="mb-4 flex">
            <div className="relative w-full max-w-sm">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="البحث والتصنيفات" className="pl-10 pr-10" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
          </div>

          <TabsContent value={activeTab} className="m-0">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <CardTitle>قائمة الطلبات</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? <p className="text-center py-4">جاري التحميل...</p> : <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10 text-center">
                            <Checkbox />
                          </TableHead>
                          <TableHead className="text-right">#</TableHead>
                          <TableHead className="text-right">التاريخ</TableHead>
                          <TableHead className="text-right">العميل</TableHead>
                          <TableHead className="text-center">المبلغ</TableHead>
                          <TableHead className="text-center">حالة الدفع</TableHead>
                          <TableHead className="text-center">حالة الطلب</TableHead>
                          <TableHead className="text-center cursor-pointer">العناصر</TableHead>
                          <TableHead className="text-center">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOrders.length === 0 ? <TableRow>
                            <TableCell colSpan={9} className="text-center">
                              لا توجد طلبات مسجلة
                            </TableCell>
                          </TableRow> : filteredOrders.map((order, index) => <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/online-orders/${order.id}`)}>
                              <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                                <Checkbox />
                              </TableCell>
                              <TableCell className="font-medium">#{order.id.slice(0, 8)}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                {formatDate(order.created_at)}
                              </TableCell>
                              <TableCell>
                                <Button variant="link" className="p-0 h-auto text-right underline" onClick={e => {
                          e.stopPropagation();
                          showCustomerProfile(order);
                        }}>
                                  {order.customer_name || 'غير معروف'}
                                </Button>
                              </TableCell>
                              <TableCell className="text-center">{order.total} ج.م</TableCell>
                              <TableCell className="text-center">
                                {getPaymentStatusBadge(order.payment_status)}
                              </TableCell>
                              <TableCell className="text-center">
                                {getStatusBadge(order.status)}
                              </TableCell>
                              <TableCell className="text-center cursor-pointer hover:text-primary" onClick={e => {
                        e.stopPropagation();
                        setSelectedItems(order.items);
                      }}>
                                {getOrderItemsCount(order)}
                              </TableCell>
                              <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                                <OrderActionsMenu 
                                  onArchive={() => handleArchive(order)} 
                                  onCancel={() => handleCancel(order)} 
                                  onProcess={() => handleProcess(order)} 
                                  onComplete={() => handleComplete(order)}
                                  onPaymentConfirm={() => handlePaymentConfirm(order)}
                                  onAssignDelivery={() => handleAssignDelivery(order)}
                                />
                              </TableCell>
                            </TableRow>)}
                      </TableBody>
                    </Table>
                  </div>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <OrderDetailsDialog 
          order={selectedOrder} 
          open={!!selectedOrder} 
          onOpenChange={open => !open && setSelectedOrder(null)} 
          onStatusUpdated={handleOrderUpdated} 
        />
        
        <OrderItemsDialog 
          items={selectedItems || []} 
          open={!!selectedItems} 
          onClose={() => setSelectedItems(null)} 
        />
        
        <CustomerProfileDialog 
          customer={selectedCustomer} 
          open={!!selectedCustomer} 
          onOpenChange={open => !open && setSelectedCustomer(null)} 
        />

        {currentOrderId && (
          <>
            <PaymentConfirmationDialog
              open={paymentConfirmOpen}
              onOpenChange={setPaymentConfirmOpen}
              orderId={currentOrderId}
              onConfirm={handleOrderUpdated}
            />
            
            <AssignDeliveryPersonDialog
              open={assignDeliveryOpen}
              onOpenChange={setAssignDeliveryOpen}
              orderId={currentOrderId}
              onConfirm={handleOrderUpdated}
            />
          </>
        )}
      </div>
    </MainLayout>;
}
