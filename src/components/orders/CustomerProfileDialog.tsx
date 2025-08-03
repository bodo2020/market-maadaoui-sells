
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mail, Phone, MapPin, Shield, ShieldCheck } from "lucide-react";
import { Order } from "@/types/index";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getOrderStatusText, getPaymentStatusText, formatDate } from "@/lib/utils";

interface CustomerProfileProps {
  customer: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    governorate?: string;
    city?: string;
    area?: string;
    neighborhood?: string;
    order: Order;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerProfileDialog({ customer, open, onOpenChange }: CustomerProfileProps) {
  const [customerData, setCustomerData] = useState<any>(null);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  if (!customer) return null;

  useEffect(() => {
    if (open && customer) {
      fetchCustomerData();
    }
  }, [open, customer]);

  const fetchCustomerData = async () => {
    if (!customer.phone && !customer.email) return;
    
    setLoading(true);
    try {
      // Find customer by phone or email
      let query = supabase
        .from('customers')
        .select('*');
      
      if (customer.phone) {
        query = query.eq('phone', customer.phone);
      } else if (customer.email) {
        query = query.eq('email', customer.email);
      }

      const { data: customerInfo, error: customerError } = await query.single();

      if (customerError) {
        console.error('Error fetching customer:', customerError);
        return;
      }

      setCustomerData(customerInfo);

      // Fetch all orders for this customer
      const { data: orders, error: ordersError } = await supabase
        .from('online_orders')
        .select('*')
        .or(`customer_phone.eq.${customer.phone},customer_email.eq.${customer.email}`)
        .order('created_at', { ascending: false });

      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
      } else {
        setCustomerOrders(orders || []);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleVerification = async () => {
    if (!customerData) return;

    try {
      const { error } = await supabase
        .from('customers')
        .update({ verified: !customerData.verified })
        .eq('id', customerData.id);

      if (error) throw error;

      setCustomerData({ ...customerData, verified: !customerData.verified });
      toast.success(customerData.verified ? 'تم إلغاء توثيق العميل' : 'تم توثيق العميل بنجاح');
    } catch (error) {
      console.error('Error updating verification:', error);
      toast.error('حدث خطأ في تحديث حالة التوثيق');
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'غ';
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const getTotalPurchases = () => {
    return customerOrders.reduce((sum, order) => sum + parseFloat(order.total), 0);
  };

  const getOrderStatusBadge = (status: string) => {
    const variant = status === 'cancelled' ? 'destructive' : 
                   status === 'done' ? 'default' : 'secondary';
    return (
      <Badge variant={variant}>
        {getOrderStatusText(status)}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>معلومات العميل</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[80vh]">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-1/2 space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="text-lg bg-primary text-primary-foreground">
                    {getInitials(customer.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold">{customer.name || 'غير معروف'}</h3>
                    {customerData?.verified && (
                      <ShieldCheck className="h-5 w-5 text-green-600" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline">عميل</Badge>
                    {customerData?.verified && (
                      <Badge variant="default" className="bg-green-600">موثق</Badge>
                    )}
                  </div>
                </div>
                {customerData && (
                  <Button
                    variant={customerData.verified ? "destructive" : "default"}
                    size="sm"
                    onClick={toggleVerification}
                    className="flex items-center gap-1"
                  >
                    {customerData.verified ? <Shield className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                    {customerData.verified ? 'إلغاء التوثيق' : 'توثيق العميل'}
                  </Button>
                )}
              </div>
              
              <Separator />
              
              <div className="space-y-4">
                <h4 className="text-lg font-medium">بيانات التواصل</h4>
                
                {customer.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${customer.email}`} className="text-primary underline">
                      {customer.email}
                    </a>
                  </div>
                )}
                
                {customer.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${customer.phone}`} className="text-primary underline">
                      {customer.phone}
                    </a>
                  </div>
                )}
              </div>
              
              {(customer.governorate || customer.city || customer.area || customer.neighborhood || customer.address) && (
                <div className="space-y-4">
                  <h4 className="text-lg font-medium">معلومات الموقع</h4>
                  <div className="space-y-2">
                    {customer.governorate && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-muted-foreground">المحافظة:</span>
                        <span>{customer.governorate}</span>
                      </div>
                    )}
                    {customer.city && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-muted-foreground">المدينة:</span>
                        <span>{customer.city}</span>
                      </div>
                    )}
                    {customer.area && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-muted-foreground">المنطقة:</span>
                        <span>{customer.area}</span>
                      </div>
                    )}
                    {customer.neighborhood && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-muted-foreground">الحي:</span>
                        <span>{customer.neighborhood}</span>
                      </div>
                    )}
                    {customer.address && (
                      <div className="flex items-start gap-2 mt-3 pt-3 border-t">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                        <p>{customer.address}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <h4 className="text-lg font-medium">إحصائيات</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted rounded-md p-3 text-center">
                    <p className="text-2xl font-bold">{customerOrders.length}</p>
                    <p className="text-sm text-muted-foreground">عدد الطلبات</p>
                  </div>
                  <div className="bg-muted rounded-md p-3 text-center">
                    <p className="text-2xl font-bold">{getTotalPurchases().toFixed(2)} ج.م</p>
                    <p className="text-sm text-muted-foreground">إجمالي المشتريات</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="w-full md:w-1/2 space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-medium">سجل الطلبات</h4>
                {loading && <p className="text-sm text-muted-foreground">جاري التحميل...</p>}
              </div>
              
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {customerOrders.map((order) => (
                    <Card key={order.id}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h5 className="font-medium">#{order.id.slice(0, 8)}</h5>
                            <p className="text-sm text-muted-foreground">{formatDate(order.created_at)}</p>
                          </div>
                          <Badge variant="outline">{order.total} ج.م</Badge>
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{Array.isArray(order.items) ? order.items.length : 0} منتج</Badge>
                          {getOrderStatusBadge(order.status)}
                          <Badge variant={order.payment_status === 'paid' ? 'default' : 'destructive'}>
                            {getPaymentStatusText(order.payment_status)}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  
                  {customerOrders.length === 0 && !loading && (
                    <p className="text-center text-muted-foreground py-8">لا توجد طلبات أخرى</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </ScrollArea>
        
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
