
import { Order } from "@/types";
import { Badge } from "@/components/ui/badge";

interface PaymentStatusBadgeProps {
  status: Order['payment_status'];
}

export function PaymentStatusBadge({ status }: PaymentStatusBadgeProps) {
  const getStatusDetails = (status: Order['payment_status']) => {
    switch (status) {
      case 'paid':
        return { label: 'تم الدفع', variant: 'default' as const };
      case 'pending':
        return { label: 'في انتظار الدفع', variant: 'secondary' as const };
      case 'failed':
        return { label: 'فشل الدفع', variant: 'destructive' as const };
      case 'refunded':
        return { label: 'تم الاسترجاع', variant: 'outline' as const };
      default:
        return { label: 'غير معروف', variant: 'outline' as const };
    }
  };

  const { label, variant } = getStatusDetails(status);

  return <Badge variant={variant}>{label}</Badge>;
}
