import BrandLoader from '@/components/ui/BrandLoader';
import { ReactNode, useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import NavbarV2 from "./NavbarV2";
import ITDeviceRuntime from "@/components/it/ITDeviceRuntime";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { useNotificationStore } from "@/stores/notificationStore";
import { supabase } from "@/integrations/supabase/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBranchStore } from "@/stores/branchStore";

interface MainLayoutProps { children: ReactNode; }

export default function MainLayout({ children }: MainLayoutProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const { setUnreadOrders, setUnreadReturns } = useNotificationStore();
  const isMobile = useIsMobile();
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const { init } = useBranchStore();

  useEffect(() => { init().catch(() => {/* noop */}); }, [init]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchCounts = async () => {
      try {
        const [ordersRes, returnsRes] = await Promise.all([
          supabase.from('online_orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('returns').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        ]);
        if (!ordersRes.error) setUnreadOrders(ordersRes.count || 0);
        if (!returnsRes.error) setUnreadReturns(returnsRes.count || 0);
      } catch (error) { console.error('Error fetching notification counts:', error); }
    };

    void fetchCounts();
    const channel = supabase.channel('global-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'online_orders' }, fetchCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'returns' }, fetchCounts)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated, setUnreadOrders, setUnreadReturns]);

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><BrandLoader size="lg" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" />;

  return (
    <TooltipProvider>
      <div className="fixed inset-0 flex min-h-screen flex-col overflow-hidden bg-slate-50 md:flex-row">
        <ITDeviceRuntime />
        <Sidebar
          isMobile={isMobile}
          showMobileSidebar={showMobileSidebar}
          toggleMobileSidebar={() => setShowMobileSidebar(value => !value)}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <NavbarV2 isMobile={isMobile} onMenuClick={() => setShowMobileSidebar(true)} />
          <main className="flex-1 overflow-auto px-3 pb-24 md:px-6 md:pb-8">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
