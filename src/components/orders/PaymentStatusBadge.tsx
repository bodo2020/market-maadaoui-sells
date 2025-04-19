
import { Order } from "@/types";
import { Badge } from "@/components/ui/badge";
import { 
  CircleCheck, 
  CircleDollarSign, 
  CircleX, 
  BadgeDollarSign 
} from "lucide-react";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";

interface PaymentStatusBadgeProps {
  status: Order['payment_status'];
}

export function PaymentStatusBadge({ status }: PaymentStatusBadgeProps) {
  const getStatusDetails = (status: Order['payment_status']) => {
    switch (status) {
      case 'paid':
        return { 
          label: 'تم الدفع', 
          variant: 'default' as const, 
          icon: CircleCheck,
          description: 'الدفع مكتمل بنجاح'
        };
      case 'pending':
        return { 
          label: 'في انتظار الدفع', 
          variant: 'secondary' as const, 
          icon: CircleDollarSign,
          description: 'الدفع قيد الانتظار'
        };
      case 'failed':
        return { 
          label: 'فشل الدفع', 
          variant: 'destructive' as const, 
          icon: CircleX,
          description: 'فشل عملية الدفع'
        };
      case 'refunded':
        return { 
          label: 'تم الاسترجاع', 
          variant: 'outline' as const, 
          icon: BadgeDollarSign,
          description: 'تمت عملية استرجاع المبلغ'
        };
      default:
        return { 
          label: 'غير معروف', 
          variant: 'outline' as const, 
          icon: CircleX,
          description: 'حالة دفع غير معروفة'
        };
    }
  };

  const { label, variant, icon: Icon, description } = getStatusDetails(status);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge variant={variant} className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{description}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
