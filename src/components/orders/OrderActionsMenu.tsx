
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Archive, X, Package, Check, CreditCard, Truck } from "lucide-react";

interface OrderActionsMenuProps {
  onArchive: () => void;
  onCancel: () => void;
  onProcess: () => void;
  onComplete: () => void;
  onPaymentConfirm?: () => void;
  onAssignDelivery?: () => void;
}

export function OrderActionsMenu({ 
  onArchive, 
  onCancel, 
  onProcess, 
  onComplete,
  onPaymentConfirm,
  onAssignDelivery
}: OrderActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">فتح القائمة</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="dir-rtl">
        <DropdownMenuLabel>إجراءات الطلب</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2" onClick={onProcess}>
          <Package className="h-4 w-4" />
          <span>تجهيز الطلب</span>
        </DropdownMenuItem>
        
        {onPaymentConfirm && (
          <DropdownMenuItem className="gap-2" onClick={onPaymentConfirm}>
            <CreditCard className="h-4 w-4" />
            <span>تأكيد الدفع</span>
          </DropdownMenuItem>
        )}
        
        {onAssignDelivery && (
          <DropdownMenuItem className="gap-2" onClick={onAssignDelivery}>
            <Truck className="h-4 w-4" />
            <span>تعيين مندوب توصيل</span>
          </DropdownMenuItem>
        )}
        
        <DropdownMenuItem className="gap-2" onClick={onComplete}>
          <Check className="h-4 w-4" />
          <span>تم التسليم</span>
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem className="gap-2" onClick={onArchive}>
          <Archive className="h-4 w-4" />
          <span>أرشفة</span>
        </DropdownMenuItem>
        
        <DropdownMenuItem className="gap-2 text-red-600" onClick={onCancel}>
          <X className="h-4 w-4" />
          <span>إلغاء الطلب</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
