
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/Auth/ProtectedRoute";
import { UserRole } from "@/types";

import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import POS from "./pages/POS";
import ProductManagement from "./pages/ProductManagement";
import InventoryManagement from "./pages/InventoryManagement";
import SuppliersCustomers from "./pages/SuppliersCustomers";
import Reports from "./pages/Reports";
import EmployeeManagement from "./pages/EmployeeManagement";
import ExpenseManagement from "./pages/ExpenseManagement";
import Finance from "./pages/Finance";
import Invoices from "./pages/Invoices";
import Settings from "./pages/Settings";
import Shifts from "./pages/Shifts";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              
              <Route path="/" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />
              
              <Route path="/pos" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.CASHIER]}>
                  <POS />
                </ProtectedRoute>
              } />
              
              <Route path="/products" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <ProductManagement />
                </ProtectedRoute>
              } />
              
              <Route path="/inventory" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.EMPLOYEE]}>
                  <InventoryManagement />
                </ProtectedRoute>
              } />
              
              <Route path="/suppliers-customers" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.EMPLOYEE]}>
                  <SuppliersCustomers />
                </ProtectedRoute>
              } />
              
              <Route path="/finance" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <Finance />
                </ProtectedRoute>
              } />
              
              <Route path="/reports" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <Reports />
                </ProtectedRoute>
              } />
              
              <Route path="/invoices" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.CASHIER]}>
                  <Invoices />
                </ProtectedRoute>
              } />
              
              <Route path="/employees" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <EmployeeManagement />
                </ProtectedRoute>
              } />
              
              <Route path="/expenses" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <ExpenseManagement />
                </ProtectedRoute>
              } />
              
              <Route path="/shifts" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <Shifts />
                </ProtectedRoute>
              } />
              
              <Route path="/settings" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <Settings />
                </ProtectedRoute>
              } />
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
