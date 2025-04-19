
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Order } from "@/types";
import { formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Printer, Package, Truck, CreditCard, Phone, Mail, MapPin } from "lucide-react";
import { AssignDeliveryDialog } from "./AssignDeliveryDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OrderDetailsDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrintInvoice: (order: Order) => void;
  onMarkAsReady: (order: Order) => void;
  onAssignDelivery: (order: Order) => void;
  onConfirmPayment: (order: Order) => void;
}

export function OrderDetailsDialog({
  order,
  open,
  onOpenChange,
  onPrintInvoice,
  onMarkAsReady,
  onAssignDelivery,
  onConfirmPayment
}: OrderDetailsDialogProps) {
  const [assignDeliveryOpen, setAssignDeliveryOpen] = useState(false);
  
  if (!order) return null;
  
  const getStatusBadge = (status: Order['status']) => {
    const variants: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
      pending: "outline",
      processing: "secondary",
      ready: "secondary",
      shipped: "default",
      delivered: "default",
      cancelled: "destructive"
    };
    
    const labels: Record<string, string> = {
      pending: "بانتظار التجهيز",
      processing: "قيد المعالجة",
      ready: "جاهز للتوصيل",
      shipped: "تم الشحن",
      delivered: "تم التسليم",
      cancelled: "ملغي"
    };
    
    return (
      <Badge variant={variants[status] || "outline"} className="px-4 py-1 text-sm">
        {labels[status] || status}
      </Badge>
    );
  };
  
  const getPaymentStatusBadge = (status: Order['payment_status']) => {
    const variants: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
      pending: "outline",
      paid: "default",
      failed: "destructive",
      refunded: "secondary"
    };
    
    const labels: Record<string, string> = {
      pending: "بانتظار الدفع",
      paid: "مدفوع",
      failed: "فشل الدفع",
      refunded: "تم الاسترجاع"
    };
    
    return (
      <Badge variant={variants[status] || "outline"} className="px-4 py-1 text-sm">
        {labels[status] || status}
      </Badge>
    );
  };
  
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-4xl h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center justify-between">
              <span>تفاصيل الطلب #{order.id.slice(0, 8)}</span>
              <div className="flex gap-2">
                {getStatusBadge(order.status)}
                {getPaymentStatusBadge(order.payment_status)}
              </div>
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex justify-between items-start flex-wrap md:flex-nowrap gap-6 dir-rtl">
            {/* Left column: Products & Actions */}
            <div className="w-full md:w-3/5 space-y-6">
              <div>
                <h3 className="font-medium text-lg mb-3">المنتجات</h3>
                <ScrollArea className="h-[300px] rounded-md border">
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
                      {order.items.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-4">
                            لا توجد منتجات في هذا الطلب
                          </TableCell>
                        </TableRow>
                      ) : (
                        order.items.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-3">
                                {item.image_url && (
                                  <div className="w-12 h-12 rounded-md overflow-hidden">
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
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
              
              {/* Order Actions */}
              <div className="space-y-4">
                <h3 className="font-medium text-lg">الإجراءات</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Button 
                    className="gap-2"
                    onClick={() => order && onPrintInvoice(order)}
                  >
                    <Printer className="w-4 h-4" />
                    طباعة الفاتورة
                  </Button>
                  
                  {order.status === 'processing' && (
                    <Button 
                      variant="secondary"
                      className="gap-2"
                      onClick={() => order && onMarkAsReady(order)}
                    >
                      <Package className="w-4 h-4" />
                      تجهيز الطلب
                    </Button>
                  )}
                  
                  {(order.status === 'ready' || order.status === 'processing') && (
                    <Button 
                      variant={order.delivery_person ? "default" : "secondary"}
                      className="gap-2"
                      onClick={() => setAssignDeliveryOpen(true)}
                    >
                      <Truck className="w-4 h-4" />
                      {order.delivery_person ? 'تغيير مندوب التوصيل' : 'تعيين مندوب التوصيل'}
                    </Button>
                  )}
                  
                  {order.payment_status === 'pending' && (
                    <Button 
                      variant="outline"
                      className="gap-2"
                      onClick={() => order && onConfirmPayment(order)}
                    >
                      <CreditCard className="w-4 h-4" />
                      تأكيد الدفع
                    </Button>
                  )}
                </div>
                
                {/* Delivery details if assigned */}
                {order.delivery_person && (
                  <Card className="mt-4">
                    <CardContent className="p-3">
                      <h4 className="font-medium">بيانات التوصيل</h4>
                      <div className="text-sm mt-2">
                        <p>مندوب التوصيل: {order.delivery_person}</p>
                        {order.tracking_number && <p>رقم التتبع: {order.tracking_number}</p>}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
              
              {/* Order Summary */}
              <div className="mt-4">
                <h3 className="font-medium text-lg mb-3">ملخص الطلب</h3>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span>المجموع الفرعي:</span>
                    <span>{order.total} ج.م</span>
                  </div>
                  <div className="flex justify-between">
                    <span>الشحن:</span>
                    <span>0 ج.م</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between font-bold">
                    <span>الإجمالي:</span>
                    <span>{order.total} ج.م</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>وسيلة الدفع:</span>
                    <span>{order.payment_method || 'الدفع عند الاستلام'}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Right column: Customer Info & Notes */}
            <div className="w-full md:w-2/5 space-y-6">
              {/* Order Info */}
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-medium text-lg mb-3">معلومات الطلب</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">رقم الطلب:</span>
                      <span>#{order.id.slice(0, 8)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">تاريخ الطلب:</span>
                      <span>{formatDate(order.created_at)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Customer Info */}
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-medium text-lg mb-3">معلومات العميل</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        {order.customer_name?.charAt(0) || 'ع'}
                      </div>
                      <div>
                        <p className="font-medium">{order.customer_name || 'غير معروف'}</p>
                      </div>
                    </div>
                    
                    {order.customer_phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <a href={`tel:${order.customer_phone}`} className="text-primary hover:underline">
                          {order.customer_phone}
                        </a>
                      </div>
                    )}
                    
                    {order.customer_email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <a href={`mailto:${order.customer_email}`} className="text-primary hover:underline">
                          {order.customer_email}
                        </a>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              
              {/* Shipping Address */}
              {order.shipping_address && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-medium text-lg mb-3">عنوان الشحن</h3>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                      <p className="text-sm">{order.shipping_address}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Notes */}
              {order.notes && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-medium text-lg mb-3">ملاحظات</h3>
                    <p className="text-sm">{order.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
          
          <DialogFooter className="flex gap-2 mt-6">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <AssignDeliveryDialog
        order={order}
        open={assignDeliveryOpen}
        onOpenChange={setAssignDeliveryOpen}
        onConfirm={() => {
          setAssignDeliveryOpen(false);
          onAssignDelivery(order);
        }}
      />
    </>
  );
}
