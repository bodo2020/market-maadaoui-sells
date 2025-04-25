import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/ui/theme-provider';
import Dashboard from '@/pages/Dashboard';
import POS from '@/pages/POS';
import ProductManagement from '@/pages/ProductManagement';
import AddProduct from '@/pages/AddProduct';
import InventoryManagement from '@/pages/InventoryManagement';
import SuppliersCustomers from '@/pages/SuppliersCustomers';
import Categories from '@/pages/Categories';
import CategoriesPage from '@/pages/CategoriesPage';
import Reports from '@/pages/Reports';
import Finance from '@/pages/Finance';
import Settings from '@/pages/Settings';
import NotFound from '@/pages/NotFound';
import ProtectedRoute from '@/components/Auth/ProtectedRoute';
import Login from '@/pages/Login';
import { supabase } from '@/integrations/supabase/client';

function App() {
  useEffect(() => {
    // Ensure the products bucket exists by calling our edge function
    const initStorage = async () => {
      try {
        await supabase.functions.invoke('create_products_bucket');
        console.log('Products bucket initialization completed');
      } catch (error) {
        console.error('Error initializing products bucket:', error);
      }
    };
    
    initStorage();
  }, []);
  
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-react-theme">
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<NotFound />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pos"
            element={
              <ProtectedRoute>
                <POS />
              </ProtectedRoute>
            }
          />
          <Route
            path="/product-management"
            element={
              <ProtectedRoute>
                <ProductManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/add-product"
            element={
              <ProtectedRoute>
                <AddProduct />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory-management"
            element={
              <ProtectedRoute>
                <InventoryManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/suppliers-customers"
            element={
              <ProtectedRoute>
                <SuppliersCustomers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/categories"
            element={
              <ProtectedRoute>
                <Categories />
              </ProtectedRoute>
            }
          />
           <Route
            path="/categories-page"
            element={
              <ProtectedRoute>
                <CategoriesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance"
            element={
              <ProtectedRoute>
                <Finance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
        </Routes>
        <Toaster />
      </Router>
    </ThemeProvider>
  );
}

export default App;
