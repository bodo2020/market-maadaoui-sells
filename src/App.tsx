import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import NotFound from "@/pages/NotFound";
import POS from "@/pages/POS";
import ProtectedRoute from "@/components/Auth/ProtectedRoute";
import Categories from "@/pages/Categories";
import CategoriesPage from "@/pages/CategoriesPage";
import AddProduct from "@/pages/AddProduct";
import ProductManagement from "@/pages/ProductManagement";
import InventoryManagement from "@/pages/InventoryManagement";
import SupplierPurchases from "@/pages/SupplierPurchases";
import Companies from "@/pages/Companies";
import CompanyDetails from "@/pages/CompanyDetails";
import { AuthProvider } from "@/contexts/AuthContext";
import Purchases from "@/pages/Purchases";
import Invoices from "@/pages/Invoices";
import Reports from "@/pages/Reports";
import Finance from "@/pages/Finance";
import ExpenseManagement from "@/pages/ExpenseManagement";
import Settings from "@/pages/Settings";
import OnlineOrders from "@/pages/OnlineOrders";
import OrderDetails from "@/pages/OrderDetails";
import SuppliersCustomers from "@/pages/SuppliersCustomers";
import EmployeeManagement from "@/pages/EmployeeManagement";
import CashTracking from "@/pages/CashTracking";
import Banners from "@/pages/Banners";
import AddBanner from "@/pages/AddBanner";
import Barcode from "@/pages/Barcode";
import DeliveryLocationsPage from "@/pages/DeliveryLocationsPage";
import DeliveryLocations from "@/pages/DeliveryLocations";
import SalesDashboard from "@/pages/SalesDashboard";
import OffersPage from "@/pages/OffersPage";
import ProductCollections from "@/pages/ProductCollections";
import CreateProductCollection from "@/pages/CreateProductCollection";
import EditProductCollection from "@/pages/EditProductCollection";
import Returns from "@/pages/Returns";
import CustomerProfile from "@/pages/CustomerProfile";
import MapPage from "@/pages/MapPage";
import DailyInventoryPage from "@/pages/DailyInventoryPage";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AuthProvider>
          <TooltipProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/pos" element={<ProtectedRoute><POS /></ProtectedRoute>} />
              <Route path="/categories" element={<ProtectedRoute><Categories /></ProtectedRoute>} />
              <Route path="/categories/:id" element={<ProtectedRoute><CategoriesPage /></ProtectedRoute>} />
              <Route path="/categories/:id/:subId" element={<ProtectedRoute><CategoriesPage /></ProtectedRoute>} />
              <Route path="/subsubcategories/:id" element={<ProtectedRoute><CategoriesPage /></ProtectedRoute>} />
              <Route path="/products" element={<ProtectedRoute><ProductManagement /></ProtectedRoute>} />
              <Route path="/products/add" element={<ProtectedRoute><AddProduct /></ProtectedRoute>} />
              <Route path="/products/edit/:id" element={<ProtectedRoute><AddProduct /></ProtectedRoute>} />
              <Route path="/add-product" element={<ProtectedRoute><AddProduct /></ProtectedRoute>} />
              <Route path="/inventory" element={<ProtectedRoute><InventoryManagement /></ProtectedRoute>} />
              <Route path="/daily-inventory" element={<ProtectedRoute><DailyInventoryPage /></ProtectedRoute>} />
              <Route path="/supplier-purchases" element={<ProtectedRoute><SupplierPurchases /></ProtectedRoute>} />
              <Route path="/companies" element={<ProtectedRoute><Companies /></ProtectedRoute>} />
              <Route path="/companies/:id" element={<ProtectedRoute><CompanyDetails /></ProtectedRoute>} />
              <Route path="/purchases/:id" element={<ProtectedRoute><Purchases /></ProtectedRoute>} />
              <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
              <Route path="/finance" element={<ProtectedRoute><Finance /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
              <Route path="/expenses" element={<ProtectedRoute><ExpenseManagement /></ProtectedRoute>} />
              <Route path="/returns" element={<ProtectedRoute><Returns /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/online-orders" element={<ProtectedRoute><OnlineOrders /></ProtectedRoute>} />
              <Route path="/online-orders/:id" element={<ProtectedRoute><OrderDetails /></ProtectedRoute>} />
              <Route path="/customer-profile/:customerId" element={<ProtectedRoute><CustomerProfile /></ProtectedRoute>} />
              <Route path="/suppliers-customers" element={<ProtectedRoute><SuppliersCustomers /></ProtectedRoute>} />
              <Route path="/employees" element={<ProtectedRoute><EmployeeManagement /></ProtectedRoute>} />
              <Route path="/cash-tracking" element={<ProtectedRoute><CashTracking /></ProtectedRoute>} />
              <Route path="/banners" element={<ProtectedRoute><Banners /></ProtectedRoute>} />
              <Route path="/banners/add" element={<ProtectedRoute><AddBanner /></ProtectedRoute>} />
              <Route path="/delivery-locations" element={<ProtectedRoute><DeliveryLocationsPage /></ProtectedRoute>} />
              <Route path="/delivery-locations/:id" element={<ProtectedRoute><DeliveryLocations /></ProtectedRoute>} />
              <Route path="/sales-dashboard" element={<ProtectedRoute><SalesDashboard /></ProtectedRoute>} />
              <Route path="/offers" element={<ProtectedRoute><OffersPage /></ProtectedRoute>} />
              <Route path="/product-collections" element={<ProtectedRoute><ProductCollections /></ProtectedRoute>} />
              <Route path="/product-collections/create" element={<ProtectedRoute><CreateProductCollection /></ProtectedRoute>} />
              <Route path="/product-collections/edit/:id" element={<ProtectedRoute><EditProductCollection /></ProtectedRoute>} />
              <Route path="/barcode" element={<ProtectedRoute><Barcode /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <SonnerToaster position="top-center" richColors />
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
