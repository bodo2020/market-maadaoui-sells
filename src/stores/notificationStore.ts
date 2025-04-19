
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotificationStore {
  unreadOrders: number;
  lowStockProducts: { id: string; name: string; quantity: number; notifyQuantity: number }[];
  incrementUnreadOrders: () => void;
  markOrdersAsRead: () => void;
  addLowStockProduct: (product: { id: string; name: string; quantity: number; notifyQuantity: number }) => void;
  removeLowStockProduct: (productId: string) => void;
  clearLowStockProducts: () => void;
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set) => ({
      unreadOrders: 0,
      lowStockProducts: [],
      incrementUnreadOrders: () => set((state) => ({ unreadOrders: state.unreadOrders + 1 })),
      markOrdersAsRead: () => set({ unreadOrders: 0 }),
      addLowStockProduct: (product) => set((state) => ({
        lowStockProducts: [...state.lowStockProducts.filter(p => p.id !== product.id), product]
      })),
      removeLowStockProduct: (productId) => set((state) => ({
        lowStockProducts: state.lowStockProducts.filter(p => p.id !== productId)
      })),
      clearLowStockProducts: () => set({ lowStockProducts: [] }),
    }),
    {
      name: 'notification-store',
    }
  )
);
