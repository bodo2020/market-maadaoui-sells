import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Order, OrderItem } from "@/types";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Mail, Phone, MapPin, Bike, Check } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentConfirmationDialog } from "@/components/orders/PaymentConfirmationDialog";

export default function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<Order['status'] | null>(null);

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

  const handleStatusChange = async () => {
    if (!order || !selectedStatus || order.status === selectedStatus || isUpdatingStatus) return;
    
    try {
      setIsUpdatingStatus(true);
      console.log("Updating order status to:", selectedStatus, "for order ID:", id);
      
      const { error } = await supabase
        .from('online_orders')
        .update({ 
          status: selectedStatus,
          updated_at: new Date().toISOString() 
        })
        .eq('id', id);
      
      if (error) {
        console.error("Supabase update error:", error);
        throw error;
      }
      
      console.log("Status updated successfully in Supabase");
      
      // Update the local state
      setOrder(prev => prev ? { ...prev, status: selectedStatus } : null);
      setSelectedStatus(null);
      
      toast.success(`تم تحديث حالة الطلب إلى ${
        selectedStatus === 'waiting' ? 'في الانتظار' : 
        selectedStatus === 'ready' ? 'جاهز للشحن' : 
        selectedStatus === 'shipped' ? 'تم الشحن' : 'تم التسليم'
      }`);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('حدث خطأ أثناء تحديث حالة الطلب');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handlePaymentStatusUpdate = async () => {
    if (!order || order.payment_status === 'paid') return;
    setPaymentConfirmOpen(true);
  };

  const onPaymentConfirmed = () => {
    fetchOrder(); // Refresh order data after payment is confirmed
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

  const getStatusBadgeColor = (status: Order['status']) => {
    const colors = {
      waiting: "bg-amber-100 text-amber-800 hover:bg-amber-200",
      ready: "bg-green-100 text-green-800 hover:bg-green-200",
      shipped: "bg-blue-100 text-blue-800 hover:bg-blue-200",
      done: "bg-gray-100 text-gray-800 hover:bg-gray-200"
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6 dir-rtl">
        <div className="flex justify-between items-center mb-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">تجهيز الطلب #{order?.id.slice(0, 8)}</h1>
            <div className="space-y-4">
              <div className="flex gap-2">
                <button 
                  onClick={() => setSelectedStatus('waiting')} 
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${selectedStatus === 'waiting' ? getStatusBadgeColor('waiting') : order?.status === 'waiting' ? getStatusBadgeColor('waiting') : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
                  disabled={isUpdatingStatus || order.status === 'waiting'}
                >
                  في الانتظار
                </button>
                <button 
                  onClick={() => setSelectedStatus('ready')} 
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${selectedStatus === 'ready' ? getStatusBadgeColor('ready') : order?.status === 'ready' ? getStatusBadgeColor('ready') : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
                  disabled={isUpdatingStatus || order.status === 'ready'}
                >
                  جاهز للشحن
                </button>
                <button 
                  onClick={() => setSelectedStatus('shipped')} 
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${selectedStatus === 'shipped' ? getStatusBadgeColor('shipped') : order?.status === 'shipped' ? getStatusBadgeColor('shipped') : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
                  disabled={isUpdatingStatus || order.status === 'shipped'}
                >
                  تم الشحن
                </button>
                <button 
                  onClick={() => setSelectedStatus('done')} 
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${selectedStatus === 'done' ? getStatusBadgeColor('done') : order?.status === 'done' ? getStatusBadgeColor('done') : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
                  disabled={isUpdatingStatus || order.status === 'done'}
                >
                  تم التسليم
                </button>
              </div>
              {selectedStatus && selectedStatus !== order.status && (
                <Button
                  onClick={handleStatusChange}
                  disabled={isUpdatingStatus}
                  className="flex items-center gap-2"
                >
                  <Check className="h-4 w-4" />
                  تأكيد تحديث الحالة
                </Button>
              )}
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate('/online-orders')}>
            عودة
          </Button>
        </div>

        <div className="flex justify-between items-start flex-wrap md:flex-nowrap gap-6">
          <div className="w-full md:w-3/5 space-y-6">
            {/* Products section */}
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
                    {!order?.items || order.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4">
                          لا توجد منتجات في هذا الطلب
                        </TableCell>
                      </TableRow>
                    ) : (
                      order.items.map((item: OrderItem, index: number) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-3">
                              {item.image_url && (
                                <div className="w-12 h-12 rounded-md overflow-hidden">
                                  <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover" />
                                </div>
                              )}
                              <span>{item.product_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                          <TableCell className="text-center">{item.price} ج.م</TableCell>
                          <TableCell className="text-center">{item.total || item.price * item.quantity} ج.م</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 mt-4">
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={handlePaymentStatusUpdate}
                  disabled={order.payment_status === 'paid' || isUpdatingStatus}
                >
                  {order?.payment_status === 'pending' ? 'تأكيد الدفع' : 'تم الدفع'}
                </Button>
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
            {/* Customer notes card */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium text-lg">ملاحظات من العميل</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {order?.notes || 'لا توجد ملاحظات من العميل'}
                </p>
              </CardContent>
            </Card>

            {/* Customer info card */}
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

            {/* Contact info card */}
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

            {/* Shipping address card */}
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

        <PaymentConfirmationDialog
          open={paymentConfirmOpen}
          onOpenChange={setPaymentConfirmOpen}
          orderId={order.id}
          onConfirm={onPaymentConfirmed}
        />
      </div>
    </MainLayout>
  );
}
