import { useState } from "react";
import { Order } from "@/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
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
      pending: { bg: "bg-amber-100", text: "text-amber-700", label: "قيد المراجعة" },
      confirmed: { bg: "bg-blue-100", text: "text-blue-700", label: "تم التأكيد" },
      preparing: { bg: "bg-orange-100", text: "text-orange-700", label: "قيد التجهيز" },
      ready: { bg: "bg-green-100", text: "text-green-700", label: "جاهز للشحن" },
      shipped: { bg: "bg-purple-100", text: "text-purple-700", label: "تم الشحن" },
      delivered: { bg: "bg-gray-100", text: "text-gray-700", label: "تم التسليم" },
      cancelled: { bg: "bg-red-100", text: "text-red-700", label: "ملغي" }
    };

    const style = variants[status] || variants.pending;
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
      console.log("Updating order status:", { orderId: order.id, from: currentStatus, to: newStatus });
      
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
      
      console.log("Status updated successfully in Supabase");
      setCurrentStatus(newStatus);
      
      const statusLabels = {
        pending: 'قيد المراجعة',
        confirmed: 'تم التأكيد',
        preparing: 'قيد التجهيز',
        ready: 'جاهز للشحن',
        shipped: 'تم الشحن',
        delivered: 'تم التسليم',
        cancelled: 'ملغي'
      };
      
      toast.success(`تم تحديث حالة الطلب إلى ${statusLabels[newStatus]}`);
      
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
          onClick={() => handleStatusChange('pending')}
          disabled={currentStatus === 'pending' || isUpdating}
        >
          {currentStatus === 'pending' && <Check className="h-4 w-4" />}
          قيد المراجعة
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          onClick={() => handleStatusChange('confirmed')}
          disabled={currentStatus === 'confirmed' || isUpdating}
        >
          {currentStatus === 'confirmed' && <Check className="h-4 w-4" />}
          تم التأكيد
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          onClick={() => handleStatusChange('preparing')}
          disabled={currentStatus === 'preparing' || isUpdating}
        >
          {currentStatus === 'preparing' && <Check className="h-4 w-4" />}
          قيد التجهيز
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
          onClick={() => handleStatusChange('delivered')}
          disabled={currentStatus === 'delivered' || isUpdating}
        >
          {currentStatus === 'delivered' && <Check className="h-4 w-4" />}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}