
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "@/components/Auth/ProtectedRoute";
import { checkLowStockProducts, showLowStockToasts } from "@/services/notificationService";
// Lazy load pages
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const POS = lazy(() => import("@/pages/POS"));
const ProductManagement = lazy(() => import("@/pages/ProductManagement"));
const AddProduct = lazy(() => import("@/pages/AddProduct"));
const Categories = lazy(() => import("@/pages/Categories"));
const Invoices = lazy(() => import("@/pages/Invoices"));
const SuppliersCustomers = lazy(() => import("@/pages/SuppliersCustomers"));
const SupplierPurchases = lazy(() => import("@/pages/SupplierPurchases"));
const Purchases = lazy(() => import("@/pages/Purchases"));
const Finance = lazy(() => import("@/pages/Finance"));
const ExpenseManagement = lazy(() => import("@/pages/ExpenseManagement"));
const CashTracking = lazy(() => import("@/pages/CashTracking"));
const InventoryManagement = lazy(() => import("@/pages/InventoryManagement"));
const OnlineOrders = lazy(() => import("@/pages/OnlineOrders"));
const Reports = lazy(() => import("@/pages/Reports"));
const EmployeeManagement = lazy(() => import("@/pages/EmployeeManagement"));
const Settings = lazy(() => import("@/pages/Settings"));
const Login = lazy(() => import("@/pages/Login"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Banners = lazy(() => import("@/pages/Banners"));
const AddBanner = lazy(() => import("@/pages/AddBanner"));
const Companies = lazy(() => import("@/pages/Companies"));
// Import the new company detail page
const CompanyDetail = lazy(() => import("@/components/companies/CompanyDetail"));

import "./App.css";
import { Toaster } from "@/components/ui/sonner";

function App() {
  // Initialize notifications system on app load
  useEffect(() => {
    const initNotifications = async () => {
      try {
        await checkLowStockProducts();
        showLowStockToasts();
      } catch (error) {
        console.error("Failed to initialize notifications:", error);
        // Don't block app rendering if notifications fail
      }
    };
    
    initNotifications();
  }, []);

  return (
    <Router>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center">جاري التحميل...</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/pos" element={<ProtectedRoute><POS /></ProtectedRoute>} />
          <Route path="/products" element={<ProtectedRoute><ProductManagement /></ProtectedRoute>} />
          <Route path="/add-product" element={<ProtectedRoute><AddProduct /></ProtectedRoute>} />
          <Route path="/categories/*" element={<ProtectedRoute><Categories /></ProtectedRoute>} />
          <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
          <Route path="/suppliers-customers" element={<ProtectedRoute><SuppliersCustomers /></ProtectedRoute>} />
          <Route path="/supplier-purchases" element={<ProtectedRoute><SupplierPurchases /></ProtectedRoute>} />
          <Route path="/purchases" element={<ProtectedRoute><Purchases /></ProtectedRoute>} />
          <Route path="/finances" element={<ProtectedRoute><Finance /></ProtectedRoute>} />
          <Route path="/expenses" element={<ProtectedRoute><ExpenseManagement /></ProtectedRoute>} />
          <Route path="/cash-tracking" element={<ProtectedRoute><CashTracking /></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute><InventoryManagement /></ProtectedRoute>} />
          <Route path="/online-orders" element={<ProtectedRoute><OnlineOrders /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/employees" element={<ProtectedRoute><EmployeeManagement /></ProtectedRoute>} />
          <Route path="/settings/*" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/banners" element={<ProtectedRoute><Banners /></ProtectedRoute>} />
          <Route path="/add-banner" element={<ProtectedRoute><AddBanner /></ProtectedRoute>} />
          <Route path="/companies" element={<ProtectedRoute><Companies /></ProtectedRoute>} />
          <Route path="/companies/:companyId" element={<ProtectedRoute><CompanyDetail /></ProtectedRoute>} />
          
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Toaster position="top-right" />
    </Router>
  );
}

export default App;
