
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Order, OrderItem } from "@/types";
import MainLayout from "@/components/layout/MainLayout";
import { UpdateOrderStatusDialog } from "@/components/orders/UpdateOrderStatusDialog";
import { PaymentConfirmationDialog } from "@/components/orders/PaymentConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Pencil, Mail, Phone, MapPin, Bike, RotateCcw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AssignDeliveryPersonDialog } from "@/components/orders/AssignDeliveryPersonDialog";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [updateStatusOpen, setUpdateStatusOpen] = useState(false);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [assignDeliveryOpen, setAssignDeliveryOpen] = useState(false);
  const [isUpdatingShipping, setIsUpdatingShipping] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmStatusDialog, setConfirmStatusDialog] = useState(false);
  const [statusToUpdate, setStatusToUpdate] = useState<Order['status'] | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  useEffect(() => {
    fetchOrder();
  }, [id]);

  const fetchOrder = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.from('online_orders').select(`
          *,
          customers(
            name,
            email,
            phone
          )
        `).eq('id', id).single();
      
      if (error) throw error;
      
      if (data) {
        const validateOrderStatus = (status: string): Order['status'] => {
          const validStatuses: Order['status'][] = ['waiting', 'ready', 'shipped', 'done'];
          return validStatuses.includes(status as Order['status']) ? status as Order['status'] : 'waiting';
        };
        
        const validatePaymentStatus = (status: string): Order['payment_status'] => {
          const validStatuses: Order['payment_status'][] = ['pending', 'paid', 'failed', 'refunded'];
          return validStatuses.includes(status as Order['payment_status']) ? status as Order['payment_status'] : 'pending';
        };
        
        const transformItems = (items: any): OrderItem[] => {
          if (!Array.isArray(items)) {
            try {
              if (typeof items === 'string') {
                items = JSON.parse(items);
              }
              if (!Array.isArray(items)) {
                items = [items];
              }
            } catch (e) {
              console.error("Error parsing items:", e);
              return [];
            }
          }
          
          return items.map((item: any) => ({
            product_id: item.product_id || '',
            product_name: item.product_name || '',
            quantity: item.quantity || 0,
            price: item.price || 0,
            total: item.total || item.price * item.quantity || 0,
            image_url: item.image_url || null
          }));
        };
        
        const customerName = data.customers?.name || 'غير معروف';
        const customerEmail = data.customers?.email || '';
        const customerPhone = data.customers?.phone || '';
        
        setOrder({
          id: data.id,
          created_at: data.created_at,
          total: data.total,
          status: validateOrderStatus(data.status),
          payment_status: validatePaymentStatus(data.payment_status),
          payment_method: data.payment_method,
          shipping_address: data.shipping_address,
          items: transformItems(data.items),
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          notes: data.notes || '',
          tracking_number: data.tracking_number || null,
          delivery_person: data.delivery_person || null
        });
      }
    } catch (error) {
      console.error('Error fetching order:', error);
      toast.error("حدث خطأ أثناء تحميل الطلب");
    } finally {
      setIsLoading(false);
    }
  };

  const updateShippingStatus = async (status: 'shipped' | 'done') => {
    if (!order) return;
    
    try {
      setIsUpdatingShipping(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({ 
          status,
          updated_at: new Date().toISOString() 
        })
        .eq('id', order.id);
      
      if (error) throw error;
      
      // Reload the order data to reflect the changes
      await fetchOrder();
      
      toast.success(`تم تحديث حالة الشحن إلى ${status === 'shipped' ? 'خرج للتوصيل' : 'تم التوصيل'}`);
    } catch (error) {
      console.error('Error updating shipping status:', error);
      toast.error('حدث خطأ أثناء تحديث حالة الشحن');
    } finally {
      setIsUpdatingShipping(false);
    }
  };

  const handleStatusClick = (status: Order['status']) => {
    setStatusToUpdate(status);
    setConfirmStatusDialog(true);
  };

  const confirmStatusUpdate = async () => {
    if (!statusToUpdate || !order) return;
    
    try {
      setIsUpdatingStatus(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({ 
          status: statusToUpdate,
          updated_at: new Date().toISOString() 
        })
        .eq('id', order.id);
      
      if (error) throw error;
      
      // Reload the order data
      await fetchOrder();
      
      toast.success(`تم تحديث حالة الطلب إلى ${
        statusToUpdate === 'waiting' ? 'في الانتظار' : 
        statusToUpdate === 'ready' ? 'جاهز للشحن' : 
        statusToUpdate === 'shipped' ? 'تم الشحن' : 'تم التسليم'
      }`);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('حدث خطأ أثناء تحديث حالة الطلب');
    } finally {
      setIsUpdatingStatus(false);
      setConfirmStatusDialog(false);
      setStatusToUpdate(null);
    }
  };

  const handleDirectStatusUpdate = async () => {
    if (!order) return;
    
    try {
      setIsUpdatingStatus(true);
      
      // Check current status and decide next status
      let newStatus: Order['status'];
      
      switch (order.status) {
        case 'waiting':
          newStatus = 'ready';
          break;
        case 'ready':
          newStatus = 'shipped';
          break;
        case 'shipped':
          newStatus = 'done';
          break;
        default:
          newStatus = 'waiting'; // Reset to waiting if at the end of the cycle
      }
      
      const { error } = await supabase
        .from('online_orders')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString() 
        })
        .eq('id', order.id);
      
      if (error) throw error;
      
      // Reload the order data
      await fetchOrder();
      
      toast.success(`تم تحديث حالة الطلب إلى ${
        newStatus === 'waiting' ? 'في الانتظار' : 
        newStatus === 'ready' ? 'جاهز للشحن' : 
        newStatus === 'shipped' ? 'تم الشحن' : 'تم التسليم'
      }`);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('حدث خطأ أثناء تحديث حالة الطلب');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const getStatusBadgeColor = (status: Order['status']) => {
    const colors = {
      waiting: "bg-amber-100 text-amber-800 hover:bg-amber-200",
      ready: "bg-green-100 text-green-800 hover:bg-green-200",
      shipped: "bg-blue-100 text-blue-800 hover:bg-blue-200",
      done: "bg-gray-100 text-gray-800 hover:bg-gray-200"
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  if (isLoading) {
    return <MainLayout>
        <div className="container mx-auto p-6">
          <div className="flex justify-center items-center h-[70vh]">
            جاري التحميل...
          </div>
        </div>
      </MainLayout>;
  }

  if (!order) {
    return <MainLayout>
        <div className="container mx-auto p-6">
          <div className="flex justify-center items-center h-[70vh]">
            لم يتم العثور على الطلب
          </div>
        </div>
      </MainLayout>;
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ar', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return <MainLayout>
      <div className="container mx-auto p-6 dir-rtl">
        <div className="flex justify-between items-center mb-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">تجهيز الطلب #{order?.id.slice(0, 8)}</h1>
            <div className="flex gap-2">
              <button 
                onClick={() => handleStatusClick('waiting')} 
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${order?.status === 'waiting' ? getStatusBadgeColor('waiting') : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
              >
                في الانتظار
              </button>
              <button 
                onClick={() => handleStatusClick('ready')} 
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${order?.status === 'ready' ? getStatusBadgeColor('ready') : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
              >
                جاهز للشحن
              </button>
              <button 
                onClick={() => handleStatusClick('shipped')} 
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${order?.status === 'shipped' ? getStatusBadgeColor('shipped') : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
              >
                تم الشحن
              </button>
              <button 
                onClick={() => handleStatusClick('done')} 
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${order?.status === 'done' ? getStatusBadgeColor('done') : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
              >
                تم التسليم
              </button>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate('/online-orders')}>
            عودة
          </Button>
        </div>

        <div className="flex justify-between items-start flex-wrap md:flex-nowrap gap-6">
          <div className="w-full md:w-3/5 space-y-6">
            <div>
              <h3 className="font-medium text-lg mb-3">المنتجات</h3>
              <ScrollArea className="h-[350px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">المنتج</TableHead>
                      <TableHead className="text-center">الكمية</TableHead>
                      <TableHead className="text-center">السعر</TableHead>
                      <TableHead className="text-center">المجموع</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!order?.items || order.items.length === 0 ? <TableRow>
                        <TableCell colSpan={4} className="text-center py-4">
                          لا توجد منتجات في هذا الطلب
                        </TableCell>
                      </TableRow> : order.items.map((item: OrderItem, index: number) => <TableRow key={index}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-3">
                              {item.image_url && <div className="w-12 h-12 rounded-md overflow-hidden">
                                  <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover" />
                                </div>}
                              <span>{item.product_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                          <TableCell className="text-center">{item.price} ج.م</TableCell>
                          <TableCell className="text-center">{item.total || item.price * item.quantity} ج.م</TableCell>
                        </TableRow>)}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 mt-4">
                {order?.payment_status === 'pending' ? <Button variant="outline" className="w-full" onClick={() => setPaymentConfirmOpen(true)}>
                    تأكيد الدفع
                  </Button> : <div className="w-full flex gap-3">
                    <Badge variant="default" className="px-4 py-2 text-base w-3/4 flex justify-center items-center">
                      تم تأكيد الدفع
                    </Badge>
                    <Button variant="outline" size="sm" className="w-1/4 flex items-center gap-2" onClick={async () => {
                  try {
                    const { error } = await supabase
                      .from('online_orders')
                      .update({
                        payment_status: 'pending',
                        updated_at: new Date().toISOString()
                      })
                      .eq('id', order?.id);
                    
                    if (error) throw error;
                    
                    await fetchOrder(); // Reload data to reflect changes
                    
                    toast.success('تم التراجع عن تأكيد الدفع');
                  } catch (error) {
                    console.error('Error reverting payment status:', error);
                    toast.error('حدث خطأ أثناء التراجع عن تأكيد الدفع');
                  }
                }}>
                      <RotateCcw className="h-4 w-4" />
                      تراجع
                    </Button>
                  </div>}
              </div>

              <div className="flex justify-between items-center">
                <Button 
                  variant={order?.status === 'ready' ? 'default' : 'outline'} 
                  className="w-full"
                  disabled={isUpdatingStatus}
                  onClick={handleDirectStatusUpdate}
                >
                  {isUpdatingStatus ? 'جاري التحديث...' : 'تحديث حالة الطلب'}
                </Button>
              </div>
              
              <div className="mt-6 space-y-3">
                <h3 className="font-medium text-lg">تعيين مندوب توصيل</h3>
                <Button variant="outline" className="w-full flex gap-2 items-center justify-center" onClick={() => setAssignDeliveryOpen(true)}>
                  <Bike className="w-4 h-4" />
                  {order?.delivery_person ? 'تغيير مندوب التوصيل' : 'اختيار مندوب التوصيل'}
                </Button>
                {order?.delivery_person && <div className="p-2 bg-muted rounded-md mt-2">
                    <p className="text-sm">المندوب: {order.delivery_person}</p>
                    {order.tracking_number && <p className="text-sm">رقم التتبع: {order.tracking_number}</p>}
                  </div>}
              </div>

              <div className="mt-4">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span>المجموع الفرعي:</span>
                    <span>{order?.total} ج.م</span>
                  </div>
                  <div className="flex justify-between">
                    <span>الشحن:</span>
                    <span>0 ج.م</span>
                  </div>
                  <div className="flex justify-between">
                    <span>الضرائب التقديرية:</span>
                    <span>0 ج.م</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold">
                    <span>المجموع:</span>
                    <span>{order?.total} ج.م</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>وسيلة الدفع:</span>
                    <span>{order?.payment_method || 'الدفع عند الاستلام'}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>المدفوع:</span>
                    <span>{order?.payment_status === 'paid' ? order.total : 0} ج.م</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>المتبقي:</span>
                    <span>{order?.payment_status === 'paid' ? 0 : order?.total} ج.م</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full md:w-2/5 space-y-6">
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium text-lg">ملاحظات من العميل</h3>
                  <Button variant="ghost" size="sm" className="p-1 h-auto">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {order?.notes || 'لا توجد ملاحظات من العميل'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium text-lg">بيانات العميل</h3>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl">
                    {order?.customer_name?.charAt(0) || 'غ'}
                  </div>
                  <div>
                    <h4 className="font-medium text-primary">{order?.customer_name}</h4>
                    <p className="text-sm text-muted-foreground">عميل</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-medium text-lg">بيانات التواصل</h3>
                
                {order?.customer_email && <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${order.customer_email}`} className="text-primary hover:underline">
                      {order.customer_email}
                    </a>
                  </div>}
                
                {order?.customer_phone && <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${order.customer_phone}`} className="text-primary hover:underline">
                      {order.customer_phone}
                    </a>
                  </div>}
              </CardContent>
            </Card>

            {order?.shipping_address && <Card>
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-medium text-lg">عنوان الشحن</h3>
                  
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                      <div>
                        <p className="text-sm">{order.shipping_address}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>}
          </div>
        </div>

        <UpdateOrderStatusDialog 
          order={order} 
          open={updateStatusOpen} 
          onOpenChange={setUpdateStatusOpen} 
          onStatusUpdated={fetchOrder} 
        />

        <PaymentConfirmationDialog 
          open={paymentConfirmOpen} 
          onOpenChange={setPaymentConfirmOpen} 
          orderId={order?.id || ''} 
          onConfirm={fetchOrder} 
        />

        <AssignDeliveryPersonDialog 
          open={assignDeliveryOpen} 
          onOpenChange={setAssignDeliveryOpen} 
          orderId={order?.id || ''} 
          onConfirm={fetchOrder} 
        />

        <AlertDialog open={confirmStatusDialog} onOpenChange={setConfirmStatusDialog}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد تغيير حالة الطلب</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من تغيير حالة الطلب إلى{" "}
                {statusToUpdate === 'waiting' && 'في الانتظار'}
                {statusToUpdate === 'ready' && 'جاهز للشحن'}
                {statusToUpdate === 'shipped' && 'تم الشحن'}
                {statusToUpdate === 'done' && 'تم التسليم'}؟
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row-reverse justify-center gap-2">
              <AlertDialogAction onClick={confirmStatusUpdate} disabled={isUpdatingStatus}>
                {isUpdatingStatus ? 'جاري التحديث...' : 'تأكيد'}
              </AlertDialogAction>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>;
}
