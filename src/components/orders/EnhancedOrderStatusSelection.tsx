import { Order } from "@/types";
import { OrderStatusSelector } from "./OrderStatusSelector";

interface EnhancedOrderStatusSelectionProps {
  currentStatus: Order['status'];
  onStatusConfirm: (newStatus: Order['status'], notes?: string) => void;
  isUpdating: boolean;
}

export function EnhancedOrderStatusSelection({
  currentStatus,
  onStatusConfirm,
  isUpdating
}: EnhancedOrderStatusSelectionProps) {
  return (
    <div className="space-y-4">
      <OrderStatusSelector
        currentStatus={currentStatus}
        onStatusChange={onStatusConfirm}
        isUpdating={isUpdating}
      />
    </div>
  );
}