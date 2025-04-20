
import { Order } from "@/types";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface OrderStatusSelectionProps {
  selectedStatus: Order['status'] | null;
  onStatusSelect: (status: Order['status']) => void;
  onStatusConfirm: () => void;
  currentStatus: Order['status'];
  isUpdating: boolean;
}

export function OrderStatusSelection({
  selectedStatus,
  onStatusSelect,
  onStatusConfirm,
  currentStatus,
  isUpdating
}: OrderStatusSelectionProps) {
  const getStatusClass = (status: Order['status']) => {
    const classes = {
      waiting: 'ring-2 ring-amber-500 bg-amber-100 text-amber-800',
      ready: 'ring-2 ring-green-500 bg-green-100 text-green-800',
      shipped: 'ring-2 ring-blue-500 bg-blue-100 text-blue-800',
      done: 'ring-2 ring-gray-500 bg-gray-100 text-gray-800',
      cancelled: 'ring-2 ring-red-500 bg-red-100 text-red-800',
      returned: 'ring-2 ring-purple-500 bg-purple-100 text-purple-800'
    };
    return selectedStatus === status ? classes[status] : '';
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <button 
          onClick={() => onStatusSelect('waiting')} 
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selectedStatus === 'waiting' ? getStatusClass('waiting') : 
            currentStatus === 'waiting' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
          }`}
          disabled={isUpdating || currentStatus === 'waiting'}
        >
          في الانتظار
        </button>
        <button 
          onClick={() => onStatusSelect('ready')} 
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selectedStatus === 'ready' ? getStatusClass('ready') : 
            currentStatus === 'ready' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
          }`}
          disabled={isUpdating || currentStatus === 'ready'}
        >
          جاهز للشحن
        </button>
        <button 
          onClick={() => onStatusSelect('shipped')} 
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selectedStatus === 'shipped' ? getStatusClass('shipped') : 
            currentStatus === 'shipped' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
          }`}
          disabled={isUpdating || currentStatus === 'shipped'}
        >
          تم الشحن
        </button>
        <button 
          onClick={() => onStatusSelect('done')} 
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selectedStatus === 'done' ? getStatusClass('done') : 
            currentStatus === 'done' ? 'bg-gray-100 text-gray-800' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
          }`}
          disabled={isUpdating || currentStatus === 'done'}
        >
          تم التسليم
        </button>
        <button 
          onClick={() => onStatusSelect('cancelled')} 
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selectedStatus === 'cancelled' ? getStatusClass('cancelled') : 
            currentStatus === 'cancelled' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
          }`}
          disabled={isUpdating || currentStatus === 'cancelled'}
        >
          ملغي
        </button>
        <button 
          onClick={() => onStatusSelect('returned')} 
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selectedStatus === 'returned' ? getStatusClass('returned') : 
            currentStatus === 'returned' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
          }`}
          disabled={isUpdating || currentStatus === 'returned'}
        >
          مرتجع
        </button>
      </div>
      {selectedStatus && selectedStatus !== currentStatus && (
        <Button
          onClick={onStatusConfirm}
          disabled={isUpdating}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90"
        >
          {isUpdating ? (
            <>جاري التحديث...</>
          ) : (
            <>
              <Check className="h-4 w-4" />
              تأكيد تحديث الحالة
            </>
          )}
        </Button>
      )}
    </div>
  );
}
