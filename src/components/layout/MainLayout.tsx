import BrandLoader from '@/components/ui/BrandLoader';
import { ReactNode, useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import NavbarV2 from "./NavbarV2";
import HrMobileBottomNav from "@/components/hr/HrMobileBottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBranchStore } from "@/stores/branchStore";

interface MainLayoutProps { children: ReactNode; }

export default function MainLayout({ children }: MainLayoutProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const isMobile = useIsMobile();
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const { init } = useBranchStore();

  useEffect(() => { init().catch(() => {/* noop */}); }, [init]);

  if (isLoading) return <div className="hr-safe-screen flex min-h-[100dvh] items-center justify-center bg-slate-50"><BrandLoader size="lg" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" />;

  return (
    <TooltipProvider>
      <div className="hr-app-shell fixed inset-0 flex min-h-[100dvh] flex-col overflow-hidden bg-slate-50 md:flex-row">
        <Sidebar
          isMobile={isMobile}
          showMobileSidebar={showMobileSidebar}
          toggleMobileSidebar={() => setShowMobileSidebar(value => !value)}
        />
        <div className="hr-safe-top flex min-w-0 flex-1 flex-col overflow-hidden">
          <NavbarV2 isMobile={isMobile} onMenuClick={() => setShowMobileSidebar(true)} />
          <main className="hr-content-scroll min-h-0 flex-1 overflow-auto px-3 pb-[calc(5rem+var(--safe-area-bottom))] md:px-6 md:pb-8">{children}</main>
          <HrMobileBottomNav />
        </div>
      </div>
    </TooltipProvider>
  );
}
