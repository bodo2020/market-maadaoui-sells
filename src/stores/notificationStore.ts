
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotificationStore {
  unreadOrders: number;
  incrementUnreadOrders: () => void;
  markOrdersAsRead: () => void;
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set) => ({
      unreadOrders: 0,
      incrementUnreadOrders: () => set((state) => ({ unreadOrders: state.unreadOrders + 1 })),
      markOrdersAsRead: () => set({ unreadOrders: 0 }),
    }),
    {
      name: 'notification-store',
    }
  )
);
