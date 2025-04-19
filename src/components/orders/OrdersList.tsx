
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Order } from "@/types";
import { formatDate } from "@/lib/utils";
import { Printer, Package, Truck, CheckCircle, XCircle, User, CreditCard } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderFilters } from "@/hooks/orders/useOrdersData";

interface OrdersListProps {
  orders: Order[];
  loading: boolean;
  onViewDetails: (order: Order) => void;
  onPrintInvoice: (order: Order) => void;
  onMarkAsReady: (order: Order) => void;
  onAssignDelivery: (order: Order) => void;
  onConfirmPayment: (order: Order) => void;
  onCancelOrder: (order: Order) => void;
  onChangeFilters: (filters: Partial<OrderFilters>) => void;
}

export function OrdersList({
  orders,
  loading,
  onViewDetails,
  onPrintInvoice,
  onMarkAsReady,
  onAssignDelivery,
  onConfirmPayment,
  onCancelOrder,
  onChangeFilters
}: OrdersListProps) {
  
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
      <Badge variant={variants[status] || "outline"} className="whitespace-nowrap">
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
      <Badge variant={variants[status] || "outline"} className="whitespace-nowrap">
        {labels[status] || status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card className="p-6 text-center">
        <p className="text-muted-foreground">جاري تحميل الطلبات...</p>
      </Card>
    );
  }

  if (orders.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-muted-foreground">لا توجد طلبات متاحة</p>
      </Card>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 text-center">
              <Checkbox />
            </TableHead>
            <TableHead className="text-right">رقم الطلب</TableHead>
            <TableHead className="text-right">التاريخ</TableHead>
            <TableHead className="text-right">العميل</TableHead>
            <TableHead className="text-center">المبلغ</TableHead>
            <TableHead className="text-center">حالة الدفع</TableHead>
            <TableHead className="text-center">حالة الطلب</TableHead>
            <TableHead className="text-center">الإجراءات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="text-center">
                <Checkbox />
              </TableCell>
              <TableCell className="font-medium">#{order.id.slice(0, 8)}</TableCell>
              <TableCell>{formatDate(order.created_at)}</TableCell>
              <TableCell>
                <Button
                  variant="link"
                  className="p-0 h-auto flex items-center gap-1 text-primary"
                  onClick={() => onViewDetails(order)}
                >
                  <User className="h-4 w-4" />
                  {order.customer_name || 'غير معروف'}
                </Button>
              </TableCell>
              <TableCell className="text-center">{order.total.toFixed(2)} ج.م</TableCell>
              <TableCell className="text-center">
                {getPaymentStatusBadge(order.payment_status)}
              </TableCell>
              <TableCell className="text-center">
                {getStatusBadge(order.status)}
              </TableCell>
              <TableCell className="text-center">
                <div className="flex justify-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onViewDetails(order)}
                    title="عرض التفاصيل"
                  >
                    <Package className="h-4 w-4" />
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onPrintInvoice(order)}
                    title="طباعة الفاتورة"
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                  
                  {order.status === 'processing' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onMarkAsReady(order)}
                      title="تحديث حالة الطلب إلى جاهز للتوصيل"
                    >
                      <CheckCircle className="h-4 w-4" />
                    </Button>
                  )}
                  
                  {(order.status === 'ready' || order.status === 'processing') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onAssignDelivery(order)}
                      title="تعيين مندوب توصيل"
                    >
                      <Truck className="h-4 w-4" />
                    </Button>
                  )}
                  
                  {order.payment_status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onConfirmPayment(order)}
                      title="تأكيد الدفع"
                    >
                      <CreditCard className="h-4 w-4" />
                    </Button>
                  )}
                  
                  {(order.status === 'pending' || order.status === 'processing') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onCancelOrder(order)}
                      title="إلغاء الطلب"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
