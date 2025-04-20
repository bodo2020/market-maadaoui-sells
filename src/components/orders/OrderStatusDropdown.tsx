
import { Check } from "lucide-react";
import { Order } from "@/types";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OrderStatusDropdownProps {
  order: Order;
  onStatusChange?: () => void;
}

export function OrderStatusDropdown({ order, onStatusChange }: OrderStatusDropdownProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<Order['status']>(order.status);

  const getStatusBadge = (status: Order['status']) => {
    const variants: Record<string, { bg: string, text: string, label: string }> = {
      waiting: { bg: "bg-amber-100", text: "text-amber-700", label: "في الانتظار" },
      ready: { bg: "bg-green-100", text: "text-green-700", label: "جاهز" },
      shipped: { bg: "bg-blue-100", text: "text-blue-700", label: "تم الشحن" },
      done: { bg: "bg-gray-100", text: "text-gray-700", label: "مكتمل" },
      cancelled: { bg: "bg-red-100", text: "text-red-700", label: "ملغي" },
      returned: { bg: "bg-purple-100", text: "text-purple-700", label: "مرتجع" }
    };

    const style = variants[status] || variants.waiting;
    return (
      <Badge className={`${style.bg} ${style.text} border-none`}>
        {style.label}
      </Badge>
    );
  };

  const handleStatusChange = async (newStatus: Order['status']) => {
    if (newStatus === currentStatus || isUpdating) return;
    
    try {
      setIsUpdating(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString() 
        })
        .eq('id', order.id);
      
      if (error) {
        console.error("Supabase update error:", error);
        throw error;
      }
      
      setCurrentStatus(newStatus);
      
      toast.success(`تم تحديث حالة الطلب إلى ${
        newStatus === 'waiting' ? 'في الانتظار' : 
        newStatus === 'ready' ? 'جاهز للشحن' : 
        newStatus === 'shipped' ? 'تم الشحن' : 
        newStatus === 'done' ? 'تم التسليم' :
        newStatus === 'cancelled' ? 'ملغي' : 'مرتجع'
      }`);
      
      if (onStatusChange) {
        onStatusChange();
      }
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('حدث خطأ أثناء تحديث حالة الطلب');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="cursor-pointer" onClick={(e) => e.stopPropagation()}>
          {getStatusBadge(currentStatus)}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuItem
          className="gap-2"
          onClick={() => handleStatusChange('waiting')}
          disabled={currentStatus === 'waiting' || isUpdating}
        >
          {currentStatus === 'waiting' && <Check className="h-4 w-4" />}
          في الانتظار
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          onClick={() => handleStatusChange('ready')}
          disabled={currentStatus === 'ready' || isUpdating}
        >
          {currentStatus === 'ready' && <Check className="h-4 w-4" />}
          جاهز للشحن
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          onClick={() => handleStatusChange('shipped')}
          disabled={currentStatus === 'shipped' || isUpdating}
        >
          {currentStatus === 'shipped' && <Check className="h-4 w-4" />}
          تم الشحن
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          onClick={() => handleStatusChange('done')}
          disabled={currentStatus === 'done' || isUpdating}
        >
          {currentStatus === 'done' && <Check className="h-4 w-4" />}
          تم التسليم
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          onClick={() => handleStatusChange('cancelled')}
          disabled={currentStatus === 'cancelled' || isUpdating}
        >
          {currentStatus === 'cancelled' && <Check className="h-4 w-4" />}
          ملغي
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          onClick={() => handleStatusChange('returned')}
          disabled={currentStatus === 'returned' || isUpdating}
        >
          {currentStatus === 'returned' && <Check className="h-4 w-4" />}
          مرتجع
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
