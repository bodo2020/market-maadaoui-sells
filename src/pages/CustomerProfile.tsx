
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Check, Mail, Phone, MapPin, AlertCircle } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Order, OrderItem } from "@/types";

export default function CustomerProfile() {
  const { customerId } = useParams();
  const [customer, setCustomer] = useState<any>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCustomerData() {
      if (!customerId || customerId === 'unknown') {
        toast({ description: "لا يمكن تحديد هوية العميل", variant: "destructive" });
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Fetch customer data with phone_verified field
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('*, phone_verified')
          .eq('id', customerId)
          .single();
        
        if (customerError) {
          throw customerError;
        }
        
        // Fetch orders for this customer
        const { data: ordersData, error: ordersError } = await supabase
          .from('online_orders')
          .select('*')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false });
        
        if (ordersError) {
          throw ordersError;
        }
        
        // Transform orders to match the Order type
        const transformedOrders: Order[] = [];
        
        if (ordersData) {
          for (const orderData of ordersData) {
            // Parse and transform items
            let parsedItems: OrderItem[] = [];
            if (orderData.items) {
              // Handle items parsing
              try {
                const itemsData = typeof orderData.items === 'string' 
                  ? JSON.parse(orderData.items) 
                  : orderData.items;
                
                if (Array.isArray(itemsData)) {
                  parsedItems = itemsData.map(item => ({
                    product_id: item.product_id || '',
                    product_name: item.product_name || '',
                    quantity: item.quantity || 0,
                    price: item.price || 0,
                    total: item.total || 0,
                    image_url: item.image_url || null,
                    barcode: item.barcode || null
                  }));
                }
              } catch (e) {
                console.error('Error parsing order items:', e);
                parsedItems = [];
              }
            }

            // Safely access customer data
            const customerName = customerData ? customerData.name || '' : '';
            const customerEmail = customerData ? customerData.email || '' : '';
            const customerPhone = customerData ? customerData.phone || '' : '';
            const customerPhoneVerified = customerData ? Boolean(customerData.phone_verified) : false;
            
            // Create a properly typed order object
            transformedOrders.push({
              id: orderData.id,
              created_at: orderData.created_at,
              total: orderData.total,
              status: orderData.status,
              payment_status: orderData.payment_status,
              payment_method: orderData.payment_method || '',
              shipping_address: orderData.shipping_address || '',
              items: parsedItems,
              customer_id: orderData.customer_id,
              customer_name: customerName,
              customer_email: customerEmail,
              customer_phone: customerPhone,
              customer_phone_verified: customerPhoneVerified,
              notes: orderData.notes || '',
              tracking_number: orderData.tracking_number || null,
              delivery_person: orderData.delivery_person || null
            });
          }
        }
        
        setCustomer(customerData);
        setCustomerOrders(transformedOrders);
      } catch (error) {
        console.error('Error fetching customer data:', error);
        toast({ description: "حدث خطأ أثناء تحميل بيانات العميل", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    }

    fetchCustomerData();
  }, [customerId]);

  const getInitials = (name: string) => {
    if (!name) return 'غ'; // Default initial if no name
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case 'waiting':
        return <Badge variant="outline">في الانتظار</Badge>;
      case 'ready':
        return <Badge variant="secondary">جاهز للشحن</Badge>;
      case 'shipped':
        return <Badge variant="default">تم الشحن</Badge>;
      case 'done':
        return <Badge className="bg-green-100 text-green-800 border-green-200">تم التسليم</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTotalOrdersValue = () => {
    return customerOrders.reduce((total, order) => total + (order.total || 0), 0).toFixed(2);
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="container mx-auto p-6 dir-rtl">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-1/3">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <Skeleton className="h-16 w-16 rounded-full" />
                    <div>
                      <Skeleton className="h-6 w-40 mb-2" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                  <Separator className="my-4" />
                  <Skeleton className="h-4 w-full mb-4" />
                  <Skeleton className="h-4 w-full mb-4" />
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
            </div>
            <div className="w-full md:w-2/3">
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!customer && !loading) {
    return (
      <MainLayout>
        <div className="container mx-auto p-6 dir-rtl">
          <Card>
            <CardContent className="p-6 text-center">
              <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">لم يتم العثور على العميل</h2>
              <p className="text-muted-foreground">
                لا يمكن العثور على بيانات هذا العميل في النظام
              </p>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto p-6 dir-rtl">
        <h1 className="text-2xl font-bold mb-6">صفحة العميل</h1>
        
        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-1/3">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Avatar className="w-16 h-16">
                    <AvatarFallback className="text-lg bg-primary text-primary-foreground">
                      {getInitials(customer?.name || '')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      {customer?.name || 'غير معروف'}
                      {customer?.phone_verified && (
                        <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200 flex items-center gap-1">
                          <Check size={14} className="text-blue-600" />
                          <span>موثق</span>
                        </Badge>
                      )}
                    </h2>
                    <Badge variant="outline">عميل</Badge>
                  </div>
                </div>
                
                <Separator className="my-4" />
                
                <div className="space-y-4">
                  {customer?.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <a href={`mailto:${customer.email}`} className="text-primary underline">
                        {customer.email}
                      </a>
                    </div>
                  )}
                  
                  {customer?.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a href={`tel:${customer.phone}`} className="text-primary underline">
                        {customer.phone}
                      </a>
                    </div>
                  )}
                  
                  {customer?.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                      <p>{customer.address}</p>
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div className="bg-muted rounded-md p-3 text-center">
                    <p className="text-2xl font-bold">{customerOrders.length}</p>
                    <p className="text-sm text-muted-foreground">طلبات</p>
                  </div>
                  <div className="bg-muted rounded-md p-3 text-center">
                    <p className="text-2xl font-bold">{getTotalOrdersValue()} ج.م</p>
                    <p className="text-sm text-muted-foreground">مبيعات</p>
                  </div>
                  <div className="bg-muted rounded-md p-3 text-center">
                    <p className="text-2xl font-bold">{customerOrders.length > 0 ? 
                      formatDate(customerOrders[0].created_at).split(' ')[0] : '-'}</p>
                    <p className="text-sm text-muted-foreground">آخر طلب</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="w-full md:w-2/3">
            <Card>
              <CardHeader>
                <CardTitle>طلبات العميل</CardTitle>
              </CardHeader>
              <CardContent>
                {customerOrders.length > 0 ? (
                  <div className="space-y-4">
                    {customerOrders.map(order => (
                      <Card key={order.id} className="border border-muted">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-center mb-2">
                            <div>
                              <h5 className="font-medium">#{order.id.slice(0, 8)}</h5>
                              <p className="text-sm text-muted-foreground">{formatDate(order.created_at)}</p>
                            </div>
                            <Badge variant="outline" className="font-medium">{order.total} ج.م</Badge>
                          </div>
                          
                          <Separator className="my-3" />
                          
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary">{order.items.length} منتج</Badge>
                            {getOrderStatusBadge(order.status)}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-6">
                    <p className="text-muted-foreground">لم يقم هذا العميل بإجراء أي طلبات بعد</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
