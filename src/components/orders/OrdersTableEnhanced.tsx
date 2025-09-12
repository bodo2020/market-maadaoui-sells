import { useState, useEffect } from "react";
import { Order } from "@/types";
import { formatDate, formatCompactDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderActionsMenu } from "./OrderActionsMenu";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { OrderStatusProgress } from "./OrderStatusProgress";
import { ShieldCheck, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface OrdersTableEnhancedProps {
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
  onPrintInvoice?: (order: Order) => void;
  selectedOrders?: string[];
  onSelectOrder?: (orderId: string) => void;
  onSelectAll?: () => void;
}

export function OrdersTableEnhanced({
  orders,
  onShowCustomer,
  onArchive,
  onCancel,
  onProcess,
  onComplete,
  onPaymentConfirm,
  onAssignDelivery,
  onOrderUpdate,
  onReturn,
  onPrintInvoice,
  selectedOrders = [],
  onSelectOrder,
  onSelectAll
}: OrdersTableEnhancedProps) {
  const navigate = useNavigate();
  const [verifiedCustomers, setVerifiedCustomers] = useState<Record<string, boolean>>({});

  // Fetch verified customer statuses
  useEffect(() => {
    const fetchVerifiedStatuses = async () => {
      const customerIds = orders
        .map(order => order.customer_id)
        .filter(Boolean) as string[];

      if (customerIds.length === 0) return;

      try {
        const { data, error } = await supabase
          .from('customers')
          .select('id, phone_verified')
          .in('id', customerIds);

        if (error) throw error;

        const verifiedMap: Record<string, boolean> = {};
        data?.forEach(customer => {
          verifiedMap[customer.id] = customer.phone_verified || false;
        });

        setVerifiedCustomers(verifiedMap);
      } catch (error) {
        console.error('Error fetching verified statuses:', error);
      }
    };

    fetchVerifiedStatuses();
  }, [orders]);

  const getPaymentStatusBadge = (status: Order['payment_status']) => {
    const variants = {
      pending: "secondary" as const,
      paid: "default" as const,
      failed: "destructive" as const,
      refunded: "outline" as const
    };

    const labels = {
      pending: "غير مدفوع",
      paid: "مدفوع",
      failed: "فشل الدفع",
      refunded: "مُسترد"
    };

    return (
      <Badge variant={variants[status]} className="text-xs">
        {labels[status]}
      </Badge>
    );
  };

  const handleRowClick = (orderId: string, e: React.MouseEvent) => {
    // Don't navigate if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest('button') || 
      target.closest('[role="checkbox"]') ||
      target.closest('.dropdown-trigger')
    ) {
      return;
    }
    navigate(`/order-details/${orderId}`);
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {onSelectOrder && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedOrders.length === orders.length && orders.length > 0}
                    onCheckedChange={onSelectAll}
                    aria-label="تحديد الكل"
                  />
                </TableHead>
              )}
              <TableHead className="text-right">رقم الطلب</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">العميل</TableHead>
              <TableHead className="text-right">الموقع</TableHead>
              <TableHead className="text-right">الإجمالي</TableHead>
              <TableHead className="text-right">حالة الدفع</TableHead>
              <TableHead className="text-right">حالة الطلب</TableHead>
              <TableHead className="text-right">التقدم</TableHead>
              <TableHead className="text-right">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow 
                key={order.id} 
                className="hover:bg-muted/30 cursor-pointer transition-colors group"
                onClick={(e) => handleRowClick(order.id, e)}
              >
                {onSelectOrder && (
                  <TableCell>
                    <Checkbox
                      checked={selectedOrders.includes(order.id)}
                      onCheckedChange={() => onSelectOrder(order.id)}
                      aria-label={`تحديد الطلب ${order.id.slice(-8)}`}
                    />
                  </TableCell>
                )}
                
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">
                      #{order.id.slice(-8).toUpperCase()}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowClick(order.id, e);
                      }}
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="text-sm">
                    <div className="font-medium">{formatCompactDate(order.created_at)}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleTimeString('ar-EG', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{order.customer_name || 'غير محدد'}</span>
                    {order.customer_id && verifiedCustomers[order.customer_id] && (
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                </TableCell>

                <TableCell>
                  <div className="text-sm">
                    {order.governorate && (
                      <div className="font-medium">{order.governorate}</div>
                    )}
                    {order.city && (
                      <div className="text-xs text-muted-foreground">{order.city}</div>
                    )}
                  </div>
                </TableCell>

                <TableCell>
                  <div className="font-semibold text-lg">
                    {order.total.toFixed(2)} ج.م
                  </div>
                </TableCell>

                <TableCell>
                  {getPaymentStatusBadge(order.payment_status)}
                </TableCell>

                <TableCell>
                  <OrderStatusBadge status={order.status} />
                </TableCell>

                <TableCell>
                  <OrderStatusProgress status={order.status} className="min-w-fit" />
                </TableCell>

                <TableCell>
                  <OrderActionsMenu
                    order={order}
                    onShowCustomer={onShowCustomer}
                    onArchive={onArchive}
                    onCancel={onCancel}
                    onProcess={onProcess}
                    onComplete={onComplete}
                    onPaymentConfirm={onPaymentConfirm}
                    onAssignDelivery={onAssignDelivery}
                    onReturn={onReturn}
                    onPrintInvoice={onPrintInvoice}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {orders.length === 0 && (
        <div className="text-center py-12">
          <div className="text-muted-foreground">لا توجد طلبات</div>
        </div>
      )}
    </div>
  );
}