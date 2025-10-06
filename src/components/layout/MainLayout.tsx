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
import { useBranchStore } from "@/stores/branchStore";
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
  const {
    setUnreadOrders,
    setUnreadReturns
  } = useNotificationStore();
  const isMobile = useIsMobile();
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const { init } = useBranchStore();

  // Initialize branch selection (loads from localStorage or first active branch)
  useEffect(() => {
    init().catch(() => {/* noop */});
  }, [init]);

  // Fetch unread orders count when layout mounts
  useEffect(() => {
    const fetchUnreadOrders = async () => {
      try {
        const {
          count,
          error
        } = await supabase.from('online_orders').select('*', {
          count: 'exact',
          head: true
        }).eq('status', 'pending');
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

  // Realtime subscription for order/return counts
  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchCounts = async () => {
      try {
        const [ordersRes, returnsRes] = await Promise.all([supabase.from('online_orders').select('*', {
          count: 'exact',
          head: true
        }).eq('status', 'pending'), supabase.from('returns').select('*', {
          count: 'exact',
          head: true
        }).eq('status', 'pending')]);
        if (ordersRes.error) console.error('Error counting waiting orders:', ordersRes.error);
        if (returnsRes.error) console.error('Error counting pending returns:', returnsRes.error);
        setUnreadOrders(ordersRes.count || 0);
        setUnreadReturns(returnsRes.count || 0);
      } catch (e) {
        console.error('Error fetching counts:', e);
      }
    };

    // initial fetch
    fetchCounts();
    const channel = supabase.channel('global-notifications').on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'online_orders'
    }, () => {
      fetchCounts();
    }).on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'online_orders'
    }, () => {
      fetchCounts();
    }).on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'returns'
    }, () => {
      fetchCounts();
    }).on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'returns'
    }, () => {
      fetchCounts();
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, setUnreadOrders, setUnreadReturns]);

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
  return <TooltipProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row fixed inset-0 overflow-hidden">
        {/* Mobile Menu Button - Only visible on mobile */}
        {isMobile && <div className="fixed top-2 right-2 z-50">
            <Button variant="outline" size="icon" className="bg-white shadow-md" onClick={toggleMobileSidebar}>
              <Menu size={24} />
              <span className="sr-only">القائمة</span>
            </Button>
          </div>}
        
        {/* Sidebar - visible on desktop or when toggled on mobile */}
        <Sidebar isMobile={isMobile} showMobileSidebar={showMobileSidebar} toggleMobileSidebar={toggleMobileSidebar} />
        
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Navbar />
          <main className="flex-1 overflow-auto p-3 md:p-6 pb-20 py-0">{children}</main>
        </div>
      </div>
    </TooltipProvider>;
}