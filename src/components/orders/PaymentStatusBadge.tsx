
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useState } from "react";

interface PaymentStatusBadgeProps {
  status: Order['payment_status'];
  onStatusChange?: (newStatus: Order['payment_status']) => void;
  editable?: boolean;
}

export function PaymentStatusBadge({ 
  status, 
  onStatusChange, 
  editable = false 
}: PaymentStatusBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);

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

  const handleStatusChange = (newStatus: Order['payment_status']) => {
    setIsOpen(false);
    if (onStatusChange) {
      onStatusChange(newStatus);
    }
  };

  const { label, variant, icon: Icon, description } = getStatusDetails(status);

  if (!editable) {
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

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger>
        <Badge variant={variant} className="flex items-center gap-2 cursor-pointer hover:opacity-80">
          <Icon className="h-4 w-4" />
          {label}
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem 
          className={status === 'paid' ? 'bg-muted' : ''}
          onClick={() => handleStatusChange('paid')}
        >
          <CircleCheck className="mr-2 h-4 w-4" />
          <span>تم الدفع</span>
        </DropdownMenuItem>
        <DropdownMenuItem 
          className={status === 'pending' ? 'bg-muted' : ''}
          onClick={() => handleStatusChange('pending')}
        >
          <CircleDollarSign className="mr-2 h-4 w-4" />
          <span>في انتظار الدفع</span>
        </DropdownMenuItem>
        <DropdownMenuItem 
          className={status === 'failed' ? 'bg-muted' : ''}
          onClick={() => handleStatusChange('failed')}
        >
          <CircleX className="mr-2 h-4 w-4" />
          <span>فشل الدفع</span>
        </DropdownMenuItem>
        <DropdownMenuItem 
          className={status === 'refunded' ? 'bg-muted' : ''}
          onClick={() => handleStatusChange('refunded')}
        >
          <BadgeDollarSign className="mr-2 h-4 w-4" />
          <span>تم الاسترجاع</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
