import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProtectedRoute from './components/ProtectedRoute';
import Users from './pages/Users';
import Categories from './pages/Categories';
import Companies from './pages/Companies';
import Suppliers from './pages/Suppliers';
import Customers from './pages/Customers';
import Expenses from './pages/Expenses';
import Products from './pages/Products';
import AddProduct from './pages/AddProduct';
import ProductManagement from './pages/ProductManagement';
import Pos from './pages/Pos';
import Sales from './pages/Sales';
import Orders from './pages/Orders';
import SettingsPage from './pages/SettingsPage';
import Profile from './pages/Profile';
import Purchases from './pages/Purchases';
import ProductCollections from './pages/ProductCollections';
import DeliveryLocations from './pages/DeliveryLocations';
import BarcodePrinting from "@/pages/BarcodePrinting";

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-background font-sans antialiased">
          <Toaster />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/users" element={
              <ProtectedRoute>
                <Users />
              </ProtectedRoute>
            } />
            <Route path="/categories" element={
              <ProtectedRoute>
                <Categories />
              </ProtectedRoute>
            } />
            <Route path="/companies" element={
              <ProtectedRoute>
                <Companies />
              </ProtectedRoute>
            } />
            <Route path="/suppliers" element={
              <ProtectedRoute>
                <Suppliers />
              </ProtectedRoute>
            } />
            <Route path="/customers" element={
              <ProtectedRoute>
                <Customers />
              </ProtectedRoute>
            } />
            <Route path="/expenses" element={
              <ProtectedRoute>
                <Expenses />
              </ProtectedRoute>
            } />
             <Route path="/products" element={
              <ProtectedRoute>
                <ProductManagement />
              </ProtectedRoute>
            } />
            <Route path="/add-product" element={
              <ProtectedRoute>
                <AddProduct />
              </ProtectedRoute>
            } />
             <Route path="/pos" element={
              <ProtectedRoute>
                <Pos />
              </ProtectedRoute>
            } />
            <Route path="/sales" element={
              <ProtectedRoute>
                <Sales />
              </ProtectedRoute>
            } />
             <Route path="/orders" element={
              <ProtectedRoute>
                <Orders />
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            } />
             <Route path="/profile" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/purchases" element={
              <ProtectedRoute>
                <Purchases />
              </ProtectedRoute>
            } />
            <Route path="/product-collections" element={
              <ProtectedRoute>
                <ProductCollections />
              </ProtectedRoute>
            } />
            <Route path="/delivery-locations" element={
              <ProtectedRoute>
                <DeliveryLocations />
              </ProtectedRoute>
            } />
            {/* Add the new route */}
            <Route path="/barcode-printing" element={
              <ProtectedRoute>
                <BarcodePrinting />
              </ProtectedRoute>
            } />
            {/* Catch-all route for 404 */}
            <Route path="*" element={<div>404 Not Found</div>} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
