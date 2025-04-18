
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Order } from "@/pages/OnlineOrders";

interface OrderDetailsDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderDetailsDialog({ order, open, onOpenChange }: OrderDetailsDialogProps) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>تفاصيل الطلب #{order.id.slice(0, 8)}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Order Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">تاريخ الطلب</p>
              <p className="font-medium">{formatDate(order.created_at)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">المبلغ الإجمالي</p>
              <p className="font-medium">{order.total} ج.م</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">حالة الطلب</p>
              <Badge variant="outline">{getStatusLabel(order.status)}</Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">حالة الدفع</p>
              <Badge variant={getPaymentStatusVariant(order.payment_status)}>{getPaymentStatusLabel(order.payment_status)}</Badge>
            </div>
          </div>

          {/* Order Items */}
          <div>
            <h3 className="font-medium mb-2">المنتجات</h3>
            <ScrollArea className="h-[200px] rounded-md border">
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
          </div>

          {/* Shipping Info */}
          {order.shipping_address && (
            <div>
              <h3 className="font-medium mb-2">عنوان الشحن</h3>
              <p className="text-sm">{order.shipping_address}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getStatusLabel(status: Order['status']) {
  const labels: Record<Order['status'], string> = {
    pending: "قيد الانتظار",
    processing: "قيد المعالجة",
    shipped: "تم الشحن",
    delivered: "تم التسليم",
    cancelled: "ملغي"
  };
  return labels[status];
}

function getPaymentStatusLabel(status: Order['payment_status']) {
  const labels: Record<Order['payment_status'], string> = {
    pending: "قيد الانتظار",
    paid: "تم الدفع",
    failed: "فشل الدفع",
    refunded: "تم الاسترجاع"
  };
  return labels[status];
}

function getPaymentStatusVariant(status: Order['payment_status']): "default" | "destructive" | "outline" | "secondary" {
  const variants: Record<Order['payment_status'], "default" | "destructive" | "outline" | "secondary"> = {
    pending: "outline",
    paid: "default",
    failed: "destructive",
    refunded: "secondary"
  };
  return variants[status];
}
