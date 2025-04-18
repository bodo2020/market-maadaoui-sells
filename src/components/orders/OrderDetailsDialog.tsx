import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Order } from "@/types/index";
import { Separator } from "@/components/ui/separator";
import { UpdateOrderStatusDialog } from "./UpdateOrderStatusDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Mail, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PaymentConfirmationDialog } from "./PaymentConfirmationDialog";

interface OrderDetailsDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusUpdated?: () => void;
}

export function OrderDetailsDialog({ order, open, onOpenChange, onStatusUpdated }: OrderDetailsDialogProps) {
  const [updateStatusOpen, setUpdateStatusOpen] = useState(false);
  const [shippingStatus, setShippingStatus] = useState<'pending' | 'shipped' | 'delivered'>('pending');
  const [isUpdatingShipping, setIsUpdatingShipping] = useState(false);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);

  if (!order) return null;

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ar', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusLabel = (status: Order['status']) => {
    const labels: Record<Order['status'], string> = {
      pending: "قيد الانتظار",
      processing: "قيد المعالجة",
      shipped: "تم الشحن",
      delivered: "تم التسليم",
      cancelled: "ملغي"
    };
    return labels[status];
  };

  const getPaymentStatusLabel = (status: Order['payment_status']) => {
    const labels: Record<Order['payment_status'], string> = {
      pending: "بانتظار الدفع",
      paid: "مدفوع",
      failed: "فشل الدفع",
      refunded: "تم الاسترجاع"
    };
    return labels[status];
  };

  const getPaymentStatusVariant = (status: Order['payment_status']): "default" | "destructive" | "outline" | "secondary" => {
    const variants: Record<Order['payment_status'], "default" | "destructive" | "outline" | "secondary"> = {
      pending: "outline",
      paid: "default",
      failed: "destructive",
      refunded: "secondary"
    };
    return variants[status];
  };

  const getStatusVariant = (status: Order['status']): "default" | "destructive" | "outline" | "secondary" => {
    const variants: Record<Order['status'], "default" | "destructive" | "outline" | "secondary"> = {
      pending: "outline",
      processing: "secondary",
      shipped: "default",
      delivered: "default",
      cancelled: "destructive"
    };
    return variants[status];
  };

  const updateShippingStatus = async (status: 'shipped' | 'delivered') => {
    if (!order) return;
    
    try {
      setIsUpdatingShipping(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({ status })
        .eq('id', order.id);
      
      if (error) throw error;
      
      setShippingStatus(status);
      toast.success(`تم تحديث حالة الشحن إلى ${status === 'shipped' ? 'خرج للتوصيل' : 'تم التوصيل'}`);
      if (onStatusUpdated) onStatusUpdated();
    } catch (error) {
      console.error('Error updating shipping status:', error);
      toast.error('حدث خطأ أثناء تحديث حالة الشحن');
    } finally {
      setIsUpdatingShipping(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">تجهيز المنتجات #{order.id.slice(0, 8)}</DialogTitle>
        </DialogHeader>
        
        <div className="flex justify-between items-start flex-wrap md:flex-nowrap gap-6 dir-rtl">
          {/* Order Items Section */}
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
                    {order.items.map((item: any, index: number) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            {item.image_url && (
                              <div className="w-10 h-10 rounded-md overflow-hidden">
                                <img 
                                  src={item.image_url} 
                                  alt={item.product_name} 
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <span>{item.product_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-center">{item.price} ج.م</TableCell>
                        <TableCell className="text-center">{item.total || (item.price * item.quantity)} ج.م</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Button 
                  variant={order.status === 'processing' ? 'default' : 'outline'} 
                  className="w-full" 
                  onClick={() => setUpdateStatusOpen(true)}
                >
                  تجهيز المنتجات
                </Button>
              </div>
              
              <div className="flex items-center gap-3 mt-4">
                {order.payment_status === 'pending' ? (
                  <Button 
                    variant="outline"
                    className="w-full"
                    onClick={() => setPaymentConfirmOpen(true)}
                  >
                    بانتظار الدفع
                  </Button>
                ) : (
                  <Badge 
                    variant="default"
                    className="px-4 py-2 text-base w-full flex justify-center items-center"
                  >
                    مدفوع بالكامل
                  </Badge>
                )}
              </div>

              <div className="mt-6 space-y-3">
                <h3 className="font-medium text-lg">حالة التوصيل</h3>
                <div className="flex gap-3">
                  <Button 
                    variant={order.status === 'shipped' ? 'default' : 'outline'}
                    className="w-full"
                    disabled={isUpdatingShipping || order.status === 'shipped' || order.status === 'delivered'}
                    onClick={() => updateShippingStatus('shipped')}
                  >
                    خرج للتوصيل
                  </Button>
                  <Button 
                    variant={order.status === 'delivered' ? 'default' : 'outline'}
                    className="w-full"
                    disabled={isUpdatingShipping || order.status === 'delivered'}
                    onClick={() => updateShippingStatus('delivered')}
                  >
                    تم التوصيل
                  </Button>
                </div>
              </div>

              <div className="mt-4">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span>المجموع الفرعي:</span>
                    <span>{order.total} ج.م</span>
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
                    <span>{order.total} ج.م</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>وسيلة الدفع:</span>
                    <span>{order.payment_method || 'الدفع عند الاستلام'}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>المدفوع:</span>
                    <span>0 ج.م</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>المتبقي:</span>
                    <span>{order.total} ج.م</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Customer Information */}
          <div className="w-full md:w-2/5 space-y-6">
            {/* Customer Notes */}
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

            {/* Customer Information */}
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
                    <p className="text-sm text-muted-foreground">لا طلبات</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-medium text-lg">بيانات التواصل</h3>
                
                {order.customer_email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a 
                      href={`mailto:${order.customer_email}`} 
                      className="text-primary hover:underline"
                    >
                      {order.customer_email}
                    </a>
                  </div>
                )}
                
                {order.customer_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a 
                      href={`tel:${order.customer_phone}`} 
                      className="text-primary hover:underline"
                    >
                      {order.customer_phone}
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Shipping Address */}
            {order.shipping_address && (
              <Card>
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
              </Card>
            )}
          </div>
        </div>

        <UpdateOrderStatusDialog 
          order={order}
          open={updateStatusOpen}
          onOpenChange={setUpdateStatusOpen}
          onStatusUpdated={() => {
            if (onStatusUpdated) onStatusUpdated();
          }}
        />

        <PaymentConfirmationDialog
          open={paymentConfirmOpen}
          onOpenChange={setPaymentConfirmOpen}
          orderId={order.id}
          onConfirm={() => {
            if (onStatusUpdated) onStatusUpdated();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
