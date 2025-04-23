import { Order } from "@/types";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderActionsMenu } from "./OrderActionsMenu";
import { OrderStatusDropdown } from "./OrderStatusDropdown";
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
  onOrderUpdate?: () => void;
  onReturn?: (order: Order) => void;
}

export function OrdersTable({
  orders,
  onShowCustomer,
  onArchive,
  onCancel,
  onProcess,
  onComplete,
  onPaymentConfirm,
  onAssignDelivery,
  onOrderUpdate,
  onReturn
}: OrdersTableProps) {
  const navigate = useNavigate();

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

  const handleRowClick = (orderId: string) => {
    navigate(`/online-orders/${orderId}`);
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
                {order.customer_name || 'عميل'}
              </Button>
            </TableCell>
            <TableCell className="text-center">{order.total} ج.م</TableCell>
            <TableCell className="text-center">
              {getPaymentStatusBadge(order.payment_status)}
            </TableCell>
            <TableCell className="text-center">
              <OrderStatusDropdown 
                order={order} 
                onStatusChange={onOrderUpdate}
              />
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
                onReturn={onReturn ? () => onReturn(order) : undefined}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
