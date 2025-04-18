
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Order } from "@/types/index";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { UpdateOrderStatusDialog } from "./UpdateOrderStatusDialog";

interface OrderDetailsDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusUpdated?: () => void;
}

export function OrderDetailsDialog({ order, open, onOpenChange, onStatusUpdated }: OrderDetailsDialogProps) {
  const [updateStatusOpen, setUpdateStatusOpen] = useState(false);

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
      pending: "قيد الانتظار",
      paid: "تم الدفع",
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>تفاصيل الطلب #{order.id.slice(0, 8)}</DialogTitle>
        </DialogHeader>
        
        <div className="flex justify-between items-start flex-wrap md:flex-nowrap gap-6">
          {/* Order Summary */}
          <div className="space-y-6 w-full md:w-1/2">
            <div className="space-y-2">
              <h3 className="font-medium text-lg">معلومات الطلب</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">رقم الطلب</p>
                  <p className="font-medium">#{order.id.slice(0, 8)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">تاريخ الطلب</p>
                  <p className="font-medium">{formatDate(order.created_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">حالة الطلب</p>
                  <Badge variant={getStatusVariant(order.status)}>{getStatusLabel(order.status)}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">حالة الدفع</p>
                  <Badge variant={getPaymentStatusVariant(order.payment_status)}>
                    {getPaymentStatusLabel(order.payment_status)}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">طريقة الدفع</p>
                  <p className="font-medium">{order.payment_method || 'الدفع عند الاستلام'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">المبلغ الإجمالي</p>
                  <p className="font-medium">{order.total} ج.م</p>
                </div>
              </div>
            </div>

            {/* Customer Information */}
            {order.customer_name && (
              <div className="space-y-2">
                <h3 className="font-medium text-lg">معلومات العميل</h3>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <p className="text-sm text-muted-foreground">الاسم</p>
                    <p className="font-medium">{order.customer_name}</p>
                  </div>
                  {order.customer_phone && (
                    <div>
                      <p className="text-sm text-muted-foreground">رقم الهاتف</p>
                      <p className="font-medium">{order.customer_phone}</p>
                    </div>
                  )}
                  {order.customer_email && (
                    <div>
                      <p className="text-sm text-muted-foreground">البريد الإلكتروني</p>
                      <p className="font-medium">{order.customer_email}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Shipping Information */}
            {order.shipping_address && (
              <div className="space-y-2">
                <h3 className="font-medium text-lg">عنوان الشحن</h3>
                <p className="text-sm">{order.shipping_address}</p>
              </div>
            )}
          </div>

          <Separator orientation="vertical" className="h-auto hidden md:block" />

          {/* Order Items */}
          <div className="w-full md:w-1/2">
            <h3 className="font-medium text-lg mb-2">المنتجات</h3>
            <ScrollArea className="h-[300px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المنتج</TableHead>
                    <TableHead>الكمية</TableHead>
                    <TableHead>السعر</TableHead>
                    <TableHead>المجموع</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.product_id}>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{item.price} ج.م</TableCell>
                      <TableCell>{item.total} ج.م</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="mt-4 space-y-2">
              <div className="flex justify-between">
                <span>المجموع الفرعي:</span>
                <span>{order.total} ج.م</span>
              </div>
              <div className="flex justify-between">
                <span>الشحن:</span>
                <span>0 ج.م</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold">
                <span>الإجمالي:</span>
                <span>{order.total} ج.م</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
          <Button onClick={() => setUpdateStatusOpen(true)}>
            تحديث الحالة
          </Button>
        </div>

        <UpdateOrderStatusDialog 
          order={order}
          open={updateStatusOpen}
          onOpenChange={setUpdateStatusOpen}
          onStatusUpdated={() => {
            if (onStatusUpdated) onStatusUpdated();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
