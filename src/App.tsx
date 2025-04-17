import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/Auth/ProtectedRoute";
import { UserRole } from "@/types";
import { supabase } from "@/integrations/supabase/client";

// Import pages
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import POS from "./pages/POS";
import ProductManagement from "./pages/ProductManagement";
import AddProduct from "./pages/AddProduct";
import InventoryManagement from "./pages/InventoryManagement";
import SuppliersCustomers from "./pages/SuppliersCustomers";
import Reports from "./pages/Reports";
import EmployeeManagement from "./pages/EmployeeManagement";
import ExpenseManagement from "./pages/ExpenseManagement";
import Invoices from "./pages/Invoices";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Purchases from "./pages/Purchases";
import SupplierPurchases from "./pages/SupplierPurchases";
import CashTracking from "./pages/CashTracking";
import Companies from "./pages/Companies";
import Banners from "./pages/Banners";
import OnlineOrders from "./pages/OnlineOrders";
import Categories from "./pages/Categories";
import AddBanner from "./pages/AddBanner";

const queryClient = new QueryClient();

function App() {
  useEffect(() => {
    const initStorage = async () => {
      try {
        // Attempt to create banners bucket when the app starts
        const response = await fetch(
          "https://qzvpayjaadbmpayeglon.functions.supabase.co/create_banners_bucket",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
        
        if (!response.ok) {
          console.error("Warning: Could not initialize banners bucket at startup");
        } else {
          console.log("Banners bucket verified at startup");
        }
      } catch (error) {
        console.error("Storage initialization error:", error);
      }
    };

    initStorage();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router>
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
              
              <Route path="/add-product" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <AddProduct />
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
              
              <Route path="/purchases" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <Purchases />
                </ProtectedRoute>
              } />
              
              <Route path="/supplier-purchases" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <SupplierPurchases />
                </ProtectedRoute>
              } />
              
              <Route path="/finance" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <Reports />
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
              
              <Route path="/settings" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <Settings />
                </ProtectedRoute>
              } />
              
              <Route path="/cash-tracking" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <CashTracking />
                </ProtectedRoute>
              } />
              
              <Route path="/companies" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <Companies />
                </ProtectedRoute>
              } />
              
              <Route path="/banners" element={<Banners />} />
              <Route path="/banners/add" element={<AddBanner />} />
              <Route path="/banners/edit" element={<AddBanner />} />
              
              <Route path="/online-orders" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <OnlineOrders />
                </ProtectedRoute>
              } />
              
              <Route path="/categories" element={
                <ProtectedRoute>
                  <Categories />
                </ProtectedRoute>
              } />
              
              <Route path="/categories/:id" element={
                <ProtectedRoute>
                  <Categories />
                </ProtectedRoute>
              } />
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Router>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
