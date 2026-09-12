import BrandLoader from '@/components/ui/BrandLoader';
import { ReactNode, useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import NavbarV2 from "./NavbarV2";
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

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><BrandLoader size="lg" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" />;

  return (
    <TooltipProvider>
      <div className="fixed inset-0 flex min-h-screen flex-col overflow-hidden bg-slate-50 md:flex-row">
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
