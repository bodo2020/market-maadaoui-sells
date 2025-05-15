
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotificationState {
  unreadOrders: number;
  unreadReturns: number;
  unreadDeliveries: number;
  unreadInventoryAlerts: number;
  
  setUnreadOrders: (count: number) => void;
  setUnreadReturns: (count: number) => void;
  setUnreadDeliveries: (count: number) => void;
  setUnreadInventoryAlerts: (count: number) => void;
  
  markOrdersAsRead: () => void;
  markReturnsAsRead: () => void;
  markDeliveriesAsRead: () => void;
  markInventoryAlertsAsRead: () => void;
  
  incrementUnreadOrders: () => void;
  incrementUnreadReturns: () => void;
  incrementUnreadDeliveries: () => void;
  incrementUnreadInventoryAlerts: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      unreadOrders: 0,
      unreadReturns: 0,
      unreadDeliveries: 0,
      unreadInventoryAlerts: 0,
      
      setUnreadOrders: (count) => set({ unreadOrders: count }),
      setUnreadReturns: (count) => set({ unreadReturns: count }),
      setUnreadDeliveries: (count) => set({ unreadDeliveries: count }),
      setUnreadInventoryAlerts: (count) => set({ unreadInventoryAlerts: count }),
      
      markOrdersAsRead: () => set({ unreadOrders: 0 }),
      markReturnsAsRead: () => set({ unreadReturns: 0 }),
      markDeliveriesAsRead: () => set({ unreadDeliveries: 0 }),
      markInventoryAlertsAsRead: () => set({ unreadInventoryAlerts: 0 }),
      
      incrementUnreadOrders: () => set((state) => ({ unreadOrders: state.unreadOrders + 1 })),
      incrementUnreadReturns: () => set((state) => ({ unreadReturns: state.unreadReturns + 1 })),
      incrementUnreadDeliveries: () => set((state) => ({ unreadDeliveries: state.unreadDeliveries + 1 })),
      incrementUnreadInventoryAlerts: () => set((state) => ({ unreadInventoryAlerts: state.unreadInventoryAlerts + 1 })),
    }),
    {
      name: 'notification-store',
    }
  )
);
