import ApprovalCenterNotifications from "@/components/approvals/ApprovalCenterNotifications";
import OperationsTaskNotifications from "@/components/tasks/OperationsTaskNotifications";
import { BrowserRouter as Router } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/contexts/AuthContext";
import AppRoutes from "@/AppRoutes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AuthProvider>
          <TooltipProvider>
            <OperationsTaskNotifications />
            <ApprovalCenterNotifications />
            <AppRoutes />
            <SonnerToaster position="top-center" richColors />
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
