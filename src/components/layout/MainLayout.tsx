
import { ReactNode, useEffect } from "react";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { useNotificationStore } from "@/stores/notificationStore";
import { supabase } from "@/integrations/supabase/client";

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({
  children
}: MainLayoutProps) {
  const {
    isAuthenticated,
    loading
  } = useAuth();
  
  const { setUnreadOrders } = useNotificationStore();
  
  // Fetch unread orders count when layout mounts
  useEffect(() => {
    const fetchUnreadOrders = async () => {
      try {
        const { count, error } = await supabase
          .from('online_orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');
        
        if (error) throw error;
        setUnreadOrders(count || 0);
      } catch (error) {
        console.error('Error fetching unread orders:', error);
      }
    };
    
    if (isAuthenticated) {
      fetchUnreadOrders();
    }
  }, [isAuthenticated, setUnreadOrders]);

  // If loading, show loading indicator
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">جاري التحميل...</div>;
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  return <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Navbar />
        <main className="flex-1 p-6 rounded-lg px-0 py-0">{children}</main>
      </div>
    </div>;
}
