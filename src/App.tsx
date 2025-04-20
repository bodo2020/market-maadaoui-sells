import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SalesDashboard from './pages/SalesDashboard';
import OnlineOrders from './pages/OnlineOrders';
import OrderDetails from './pages/OrderDetails';
import Finance from './pages/Finance';
import InventoryManagement from './pages/InventoryManagement';
import ProductManagement from './pages/ProductManagement';
import AddProduct from './pages/AddProduct';
import Categories from './pages/CategoriesPage';
import CategoriesPage from './pages/CategoriesPage';
import Companies from './pages/Companies';
import CompanyDetails from './pages/CompanyDetails';
import SuppliersCustomers from './pages/SuppliersCustomers';
import CustomerCartsPage from './pages/CustomerCartsPage';
import Banners from './pages/Banners';
import AddBanner from './pages/AddBanner';
import OffersPage from './pages/OffersPage';
import ExpenseManagement from './pages/ExpenseManagement';
import CashTracking from './pages/CashTracking';
import EmployeeManagement from './pages/EmployeeManagement';
import DeliveryLocationsPage from './pages/DeliveryLocationsPage';
import Reports from './pages/Reports';
import Suppliers from './pages/SuppliersCustomers';
import Purchases from './pages/Purchases';
import SupplierPurchases from './pages/SupplierPurchases';
import Settings from './pages/Settings';
import Invoices from './pages/Invoices';
import NotFound from './pages/NotFound';
import POS from './pages/POS';
import ReturnOrders from './pages/ReturnOrders';
import { useAuth } from './contexts/AuthContext';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth();

  if (!isLoggedIn) {
    return <Navigate to="/login" />;
  }

  return <>{children}</>;
}

function App() {
  const { isLoggedIn } = useAuth();

  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/pos" element={<ProtectedRoute><POS /></ProtectedRoute>} />
          <Route path="/sales-dashboard" element={<ProtectedRoute><SalesDashboard /></ProtectedRoute>} />
          <Route path="/online-orders" element={<ProtectedRoute><OnlineOrders /></ProtectedRoute>} />
          <Route path="/online-orders/:id" element={<ProtectedRoute><OrderDetails /></ProtectedRoute>} />
          <Route path="/return-orders" element={<ProtectedRoute><ReturnOrders /></ProtectedRoute>} />
          <Route path="/finances" element={<ProtectedRoute><Finance /></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute><InventoryManagement /></ProtectedRoute>} />
          <Route path="/products" element={<ProtectedRoute><ProductManagement /></ProtectedRoute>} />
          <Route path="/products/add" element={<ProtectedRoute><AddProduct /></ProtectedRoute>} />
          <Route path="/products/edit/:id" element={<ProtectedRoute><AddProduct /></ProtectedRoute>} />
          <Route path="/categories" element={<ProtectedRoute><Categories /></ProtectedRoute>} />
          <Route path="/categories/:id" element={<ProtectedRoute><CategoriesPage /></ProtectedRoute>} />
          <Route path="/categories/:id/subcategories/:subId" element={<ProtectedRoute><CategoriesPage /></ProtectedRoute>} />
          <Route path="/subcategories/:id" element={<ProtectedRoute><CategoriesPage /></ProtectedRoute>} />
          <Route path="/subsubcategories/:id" element={<ProtectedRoute><CategoriesPage /></ProtectedRoute>} />
          <Route path="/companies" element={<ProtectedRoute><Companies /></ProtectedRoute>} />
          <Route path="/companies/:id" element={<ProtectedRoute><CompanyDetails /></ProtectedRoute>} />
          <Route path="/customers" element={<ProtectedRoute><SuppliersCustomers /></ProtectedRoute>} />
          <Route path="/customer-carts" element={<ProtectedRoute><CustomerCartsPage /></ProtectedRoute>} />
          <Route path="/banners" element={<ProtectedRoute><Banners /></ProtectedRoute>} />
          <Route path="/banners/add" element={<ProtectedRoute><AddBanner /></ProtectedRoute>} />
          <Route path="/offers" element={<ProtectedRoute><OffersPage /></ProtectedRoute>} />
          <Route path="/expenses" element={<ProtectedRoute><ExpenseManagement /></ProtectedRoute>} />
          <Route path="/cash-tracking" element={<ProtectedRoute><CashTracking /></ProtectedRoute>} />
          <Route path="/employees" element={<ProtectedRoute><EmployeeManagement /></ProtectedRoute>} />
          <Route path="/delivery-locations" element={<ProtectedRoute><DeliveryLocationsPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/suppliers" element={<ProtectedRoute><SuppliersCustomers /></ProtectedRoute>} />
          <Route path="/purchases" element={<ProtectedRoute><Purchases /></ProtectedRoute>} />
          <Route path="/supplier-purchases/:id" element={<ProtectedRoute><SupplierPurchases /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;
