import { Order } from "@/types";

// Helper function to migrate old status values to new ones
export const migrateOrderStatus = (oldStatus: string): Order['status'] => {
  const statusMap: Record<string, Order['status']> = {
    'waiting': 'pending',
    'done': 'delivered',
    'ready': 'ready',
    'shipped': 'shipped',
    'cancelled': 'cancelled',
    // New statuses
    'pending': 'pending',
    'confirmed': 'confirmed', 
    'preparing': 'preparing',
    'delivered': 'delivered'
  };

  return statusMap[oldStatus] || 'pending';
};

// Helper to convert status for display
export const getStatusDisplayText = (status: Order['status']): string => {
  const statusTexts: Record<Order['status'], string> = {
    'pending': 'قيد المراجعة',
    'confirmed': 'تم التأكيد',
    'preparing': 'قيد التجهيز', 
    'ready': 'جاهز للشحن',
    'shipped': 'تم الشحن',
    'delivered': 'تم التسليم',
    'cancelled': 'ملغي'
  };

  return statusTexts[status] || 'غير محدد';
};