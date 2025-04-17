import { Product } from "@/types";
import { fetchProducts } from "./supabase/productService";
import { toast } from "@/components/ui/sonner";

export interface StockNotification {
  id: string;
  product: Product;
  type: 'low_stock';
  read: boolean;
  createdAt: Date;
  displayed: boolean;
}

// Default threshold for low stock, can be configurable in the future
const LOW_STOCK_THRESHOLD = 10;

// Store notifications in local storage to persist between sessions
const NOTIFICATIONS_STORAGE_KEY = 'stock-notifications';

// Get notifications from local storage
export const getNotifications = (): StockNotification[] => {
  const storedNotifications = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
  if (!storedNotifications) return [];
  
  try {
    return JSON.parse(storedNotifications).map((notification: any) => ({
      ...notification,
      createdAt: new Date(notification.createdAt),
      displayed: notification.displayed || false
    }));
  } catch (error) {
    console.error("Error parsing notifications from storage:", error);
    return [];
  }
};

// Save notifications to local storage
export const saveNotifications = (notifications: StockNotification[]): void => {
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
};

// Add a new notification
export const addNotification = (notification: StockNotification): void => {
  const notifications = getNotifications();
  
  // Check if notification for this product already exists
  const existingIndex = notifications.findIndex(n => 
    n.product.id === notification.product.id && n.type === notification.type
  );
  
  if (existingIndex >= 0) {
    // Update existing notification
    notifications[existingIndex] = {
      ...notification,
      displayed: notifications[existingIndex].displayed
    };
  } else {
    // Add new notification (not displayed yet)
    notifications.push({
      ...notification,
      displayed: false
    });
  }
  
  saveNotifications(notifications);
};

// Mark notification as read
export const markNotificationAsRead = (notificationId: string): void => {
  const notifications = getNotifications();
  const updatedNotifications = notifications.map(notification => 
    notification.id === notificationId 
      ? { ...notification, read: true } 
      : notification
  );
  
  saveNotifications(updatedNotifications);
};

// Mark all notifications as read
export const markAllNotificationsAsRead = (): void => {
  const notifications = getNotifications();
  const updatedNotifications = notifications.map(notification => ({ ...notification, read: true }));
  
  saveNotifications(updatedNotifications);
};

// Mark notification as displayed
export const markNotificationAsDisplayed = (notificationId: string): void => {
  const notifications = getNotifications();
  const updatedNotifications = notifications.map(notification => 
    notification.id === notificationId 
      ? { ...notification, displayed: true } 
      : notification
  );
  
  saveNotifications(updatedNotifications);
};

// Remove a notification
export const removeNotification = (notificationId: string): void => {
  const notifications = getNotifications();
  const updatedNotifications = notifications.filter(
    notification => notification.id !== notificationId
  );
  
  saveNotifications(updatedNotifications);
};

// Check for low stock products and generate notifications
export const checkLowStockProducts = async (): Promise<StockNotification[]> => {
  try {
    const products = await fetchProducts();
    const lowStockProducts = products.filter(product => (product.quantity || 0) < LOW_STOCK_THRESHOLD);
    
    const notifications: StockNotification[] = [];
    
    // Create notifications for low stock products
    lowStockProducts.forEach(product => {
      const notification: StockNotification = {
        id: `low-stock-${product.id}`,
        product,
        type: 'low_stock',
        read: false,
        createdAt: new Date(),
        displayed: false
      };
      
      addNotification(notification);
      notifications.push(notification);
    });
    
    return notifications;
  } catch (error) {
    console.error("Error checking for low stock products:", error);
    return [];
  }
};

// Show toast notification for low stock products (only if not displayed yet)
export const showLowStockToast = (notification: StockNotification): void => {
  // Only show toast if this notification hasn't been displayed yet
  const notifications = getNotifications();
  const existingNotification = notifications.find(n => n.id === notification.id);
  
  if (existingNotification && !existingNotification.displayed) {
    const { product } = notification;
    
    toast("تنبيه المخزون المنخفض", {
      description: `المنتج "${product.name}" منخفض المخزون (${product.quantity} وحدة متبقية)`,
      duration: 5000
    });
    
    // Mark this notification as displayed so it won't show again
    markNotificationAsDisplayed(notification.id);
  }
};
