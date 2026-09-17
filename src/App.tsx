import OrderNotifications from '@/components/orders/OrderNotifications';
import ApprovalCenterNotifications from "@/components/approvals/ApprovalCenterNotifications";
import CustomerTaskNotifications from "@/components/customers/CustomerTaskNotifications";
import OperationsTaskNotifications from "@/components/tasks/OperationsTaskNotifications";
import InventoryTransferSmartAlertNotifications from "@/components/inventory/InventoryTransferSmartAlertNotifications";
import POSOnlineOrdersRouteDock from "@/components/POS/POSOnlineOrdersRouteDock";
import GooglePasswordAutofill from "@/components/Auth/GooglePasswordAutofill";
import FranchiseAccountDock from "@/components/franchise/FranchiseAccountDock";
import { BrowserRouter as Router, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/contexts/AuthContext";
import AppRoutes from "@/AppRoutes";
import FranchisePortalApp from "@/FranchisePortalApp";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

function StaffApplication() {
  return (
    <>
      <GooglePasswordAutofill />
      <AuthProvider>
        <OrderNotifications />
        <CustomerTaskNotifications />
        <OperationsTaskNotifications />
        <InventoryTransferSmartAlertNotifications />
        <ApprovalCenterNotifications />
        <POSOnlineOrdersRouteDock />
        <FranchiseAccountDock />
        <AppRoutes />
      </AuthProvider>
    </>
  );
}

function RoutedApplication() {
  const { pathname } = useLocation();
  const authCallback = typeof window !== "undefined" && (window.location.hash.includes("type=invite") || window.location.hash.includes("type=recovery"));
  const isFranchisePortal = pathname === "/franchise-login"
    || pathname === "/franchise-auth"
    || pathname === "/franchise-portal"
    || pathname.startsWith("/franchise-portal/")
    || authCallback;
  return isFranchisePortal ? <FranchisePortalApp /> : <StaffApplication />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <TooltipProvider>
          <RoutedApplication />
          <SonnerToaster position="top-center" richColors />
          <Toaster />
        </TooltipProvider>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
