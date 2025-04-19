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
import { Pencil, Mail, Phone, MapPin, Bike } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AssignDeliveryPersonDialog } from "@/components/orders/AssignDeliveryPersonDialog";
export default function OrderDetails() {
  const {
    id
  } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [updateStatusOpen, setUpdateStatusOpen] = useState(false);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [assignDeliveryOpen, setAssignDeliveryOpen] = useState(false);
  const [isUpdatingShipping, setIsUpdatingShipping] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    fetchOrder();
  }, [id]);
  const fetchOrder = async () => {
    try {
      setIsLoading(true);
      // Get order data with customer details if available
      const {
        data,
        error
      } = await supabase.from('online_orders').select(`
          *,
          delivery_person,
          tracking_number,
          customers(
            name,
            email,
            phone
          )
        `).eq('id', id).single();
      if (error) throw error;
      if (data) {
        // Validate status to ensure it's one of the allowed values
        const validateOrderStatus = (status: string): Order['status'] => {
          const validStatuses: Order['status'][] = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
          return validStatuses.includes(status as Order['status']) ? status as Order['status'] : 'pending';
        };

        // Validate payment status
        const validatePaymentStatus = (status: string): Order['payment_status'] => {
          const validStatuses: Order['payment_status'][] = ['pending', 'paid', 'failed', 'refunded'];
          return validStatuses.includes(status as Order['payment_status']) ? status as Order['payment_status'] : 'pending';
        };

        // Transform items from Json to OrderItem[]
        const transformItems = (items: any): OrderItem[] => {
          if (!Array.isArray(items)) {
            try {
              // If it's a JSON string, parse it
              if (typeof items === 'string') {
                items = JSON.parse(items);
              }

              // If it's an object but not an array, wrap it in an array
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

        // Get customer information from customer table
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
  const updateShippingStatus = async (status: 'shipped' | 'delivered') => {
    if (!order) return;
    try {
      setIsUpdatingShipping(true);
      const {
        error
      } = await supabase.from('online_orders').update({
        status,
        updated_at: new Date().toISOString()
      }).eq('id', order.id);
      if (error) throw error;
      toast.success(`تم تحديث حالة الشحن إلى ${status === 'shipped' ? 'خرج للتوصيل' : 'تم التوصيل'}`);
      fetchOrder();
    } catch (error) {
      console.error('Error updating shipping status:', error);
      toast.error('حدث خطأ أثناء تحديث حالة الشحن');
    } finally {
      setIsUpdatingShipping(false);
    }
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
          <h1 className="text-2xl font-bold">تجهيز الطلب #{order.id.slice(0, 8)}</h1>
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
                    {order.items.length === 0 ? <TableRow>
                        <TableCell colSpan={4} className="text-center py-4">
                          لا توجد منتجات في هذا الطلب
                        </TableCell>
                      </TableRow> : order.items.map((item: OrderItem, index: number) => <TableRow key={index}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-3">
                              {item.image_url ? <div className="w-12 h-12 rounded-md overflow-hidden">
                                  <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover" />
                                </div> : <div className="w-12 h-12 rounded-md bg-gray-200 flex items-center justify-center">
                                  <span className="text-gray-500 text-xs">بدون صورة</span>
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
                  {order.notes || 'لا توجد ملاحظات من العميل'}
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
                    {order.customer_name?.charAt(0) || 'غ'}
                  </div>
                  <div>
                    <h4 className="font-medium text-primary">{order.customer_name}</h4>
                    <p className="text-sm text-muted-foreground">عميل</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-medium text-lg">بيانات التواصل</h3>
                
                {order.customer_email && <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${order.customer_email}`} className="text-primary hover:underline">
                      {order.customer_email}
                    </a>
                  </div>}
                
                {order.customer_phone && <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${order.customer_phone}`} className="text-primary hover:underline">
                      {order.customer_phone}
                    </a>
                  </div>}
              </CardContent>
            </Card>

            {order.shipping_address && <Card>
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

        <UpdateOrderStatusDialog order={order} open={updateStatusOpen} onOpenChange={setUpdateStatusOpen} onStatusUpdated={fetchOrder} />

        <PaymentConfirmationDialog open={paymentConfirmOpen} onOpenChange={setPaymentConfirmOpen} orderId={order.id} onConfirm={fetchOrder} />

        <AssignDeliveryPersonDialog open={assignDeliveryOpen} onOpenChange={setAssignDeliveryOpen} orderId={order.id} onConfirm={fetchOrder} />
      </div>
    </MainLayout>;
}