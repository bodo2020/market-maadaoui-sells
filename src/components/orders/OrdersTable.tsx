
import { Order } from "@/types";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderActionsMenu } from "./OrderActionsMenu";
import { useNavigate } from "react-router-dom";

interface OrdersTableProps {
  orders: Order[];
  onShowCustomer: (order: Order) => void;
  onArchive: (order: Order) => void;
  onCancel: (order: Order) => void;
  onProcess: (order: Order) => void;
  onComplete: (order: Order) => void;
  onPaymentConfirm: (order: Order) => void;
  onAssignDelivery: (order: Order) => void;
}

export function OrdersTable({
  orders,
  onShowCustomer,
  onArchive,
  onCancel,
  onProcess,
  onComplete,
  onPaymentConfirm,
  onAssignDelivery
}: OrdersTableProps) {
  const navigate = useNavigate();

  const getStatusBadge = (status: Order['status']) => {
    const variants: Record<string, { bg: string, text: string, label: string }> = {
      waiting: { bg: "bg-amber-100", text: "text-amber-700", label: "في الانتظار" },
      ready: { bg: "bg-green-100", text: "text-green-700", label: "جاهز" },
      shipped: { bg: "bg-blue-100", text: "text-blue-700", label: "تم الشحن" },
      done: { bg: "bg-gray-100", text: "text-gray-700", label: "مكتمل" }
    };

    const style = variants[status] || variants.waiting;
    return (
      <Badge className={`${style.bg} ${style.text} border-none`}>
        {style.label}
      </Badge>
    );
  };

  const handleRowClick = (orderId: string) => {
    navigate(`/online-orders/${orderId}`);
  };

  const getPaymentStatusBadge = (status: Order['payment_status']) => {
    const variants: Record<Order['payment_status'], "default" | "destructive" | "outline" | "secondary"> = {
      pending: "outline",
      paid: "default",
      failed: "destructive",
      refunded: "secondary"
    };
    const labels: Record<Order['payment_status'], string> = {
      pending: "بانتظار الدفع",
      paid: "مدفوع",
      failed: "فشل الدفع",
      refunded: "تم الاسترجاع"
    };
    return <Badge variant={variants[status]} className="mx-auto whitespace-nowrap">
        {labels[status]}
      </Badge>;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10 text-center">
            <Checkbox />
          </TableHead>
          <TableHead className="text-right">#</TableHead>
          <TableHead className="text-right">التاريخ</TableHead>
          <TableHead className="text-right">العميل</TableHead>
          <TableHead className="text-center">المبلغ</TableHead>
          <TableHead className="text-center">حالة الدفع</TableHead>
          <TableHead className="text-center">حالة الطلب</TableHead>
          <TableHead className="text-center cursor-pointer">العناصر</TableHead>
          <TableHead className="text-center">الإجراءات</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow 
            key={order.id} 
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => handleRowClick(order.id)}
          >
            <TableCell className="text-center">
              <Checkbox />
            </TableCell>
            <TableCell className="font-medium">#{order.id.slice(0, 8)}</TableCell>
            <TableCell className="whitespace-nowrap">
              {formatDate(order.created_at)}
            </TableCell>
            <TableCell>
              <Button
                variant="link"
                className="p-0 h-auto text-right underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowCustomer(order);
                }}
              >
                {order.customer_name || 'غير معروف'}
              </Button>
            </TableCell>
            <TableCell className="text-center">{order.total} ج.م</TableCell>
            <TableCell className="text-center">
              {getPaymentStatusBadge(order.payment_status)}
            </TableCell>
            <TableCell className="text-center">
              {getStatusBadge(order.status)}
            </TableCell>
            <TableCell className="text-center">
              {order.items?.length || 0}
            </TableCell>
            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
              <OrderActionsMenu
                onArchive={() => onArchive(order)}
                onCancel={() => onCancel(order)}
                onProcess={() => onProcess(order)}
                onComplete={() => onComplete(order)}
                onPaymentConfirm={() => onPaymentConfirm(order)}
                onAssignDelivery={() => onAssignDelivery(order)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
