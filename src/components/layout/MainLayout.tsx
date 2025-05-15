
import { ReactNode, useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { useNotificationStore } from "@/stores/notificationStore";
import { supabase } from "@/integrations/supabase/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu } from "lucide-react";
import { Button } from "../ui/button";

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({
  children
}: MainLayoutProps) {
  const {
    isAuthenticated,
    isLoading
  } = useAuth();
  
  const { setUnreadOrders } = useNotificationStore();
  const isMobile = useIsMobile();
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  
  // Fetch unread orders count when layout mounts
  useEffect(() => {
    const fetchUnreadOrders = async () => {
      try {
        const { count, error } = await supabase
          .from('online_orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'waiting');
        
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
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">جاري التحميل...</div>;
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  const toggleMobileSidebar = () => {
    setShowMobileSidebar(!showMobileSidebar);
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
        {/* Mobile Menu Button - Only visible on mobile */}
        {isMobile && (
          <div className="fixed top-2 right-2 z-50">
            <Button 
              variant="outline" 
              size="icon"
              className="bg-white shadow-md"
              onClick={toggleMobileSidebar}
            >
              <Menu size={24} />
              <span className="sr-only">القائمة</span>
            </Button>
          </div>
        )}
        
        {/* Sidebar - visible on desktop or when toggled on mobile */}
        <Sidebar 
          isMobile={isMobile} 
          showMobileSidebar={showMobileSidebar} 
          toggleMobileSidebar={toggleMobileSidebar} 
        />
        
        <div className="flex-1 flex flex-col w-full">
          <Navbar />
          <main className="flex-1 p-3 md:p-6 rounded-lg">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
