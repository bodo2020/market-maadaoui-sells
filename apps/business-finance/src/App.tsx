import { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { Session } from '@supabase/supabase-js';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import { BusinessProvider, useBusiness } from './context/BusinessContext';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import Finance from './pages/Finance';
import FinancialReport from './pages/FinancialReport';
import Login from './pages/Login';
import ManagementReport from './pages/ManagementReport';
import More from './pages/More';
import Notifications from './pages/Notifications';
import OperationsReport from './pages/OperationsReport';
import Reports from './pages/Reports';
import SalesReport from './pages/SalesReport';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack && window.history.length > 1) window.history.back();
      else void CapacitorApp.exitApp();
    });
    return () => { void listener.then((handle) => handle.remove()); };
  }, []);

  if (!hasSupabaseConfig) return <SetupRequired />;
  if (loading) return <div className="full-loader"><span className="brand__mark">م</span><p>جاري تجهيز المعداوي للأعمال…</p></div>;
  if (!session) return <Routes><Route path="*" element={<Login/>}/></Routes>;

  return <BusinessProvider><BusinessAccessGate /></BusinessProvider>;
}

function BusinessAccessGate() {
  const { loading, error, reload, selectedBranch } = useBusiness();
  if (loading) return <div className="full-loader"><span className="brand__mark">م</span><p>جاري تحميل الفروع والصلاحيات…</p></div>;
  if (error) return <div className="auth-page"><section className="auth-card setup-card"><h1>تعذر فتح تطبيق الأعمال</h1><p>{error}</p><button className="primary-button" onClick={() => void reload()}>إعادة المحاولة</button></section></div>;

  const canViewReports = selectedBranch?.permissions.includes('reports.view') === true;
  const canViewFinance = selectedBranch?.permissions.some((permission) => permission === 'finance.view' || permission === 'finance.manage') === true;

  return <AppShell><Routes>
    <Route path="/" element={canViewReports ? <Dashboard/> : <Navigate to="/finance" replace/>}/>
    <Route path="/reports" element={canViewReports ? <Reports/> : <Navigate to="/finance" replace/>}/>
    <Route path="/reports/sales" element={canViewReports ? <SalesReport/> : <Navigate to="/finance" replace/>}/>
    <Route path="/reports/profitability" element={canViewReports ? <FinancialReport kind="profitability"/> : <Navigate to="/finance" replace/>}/>
    <Route path="/reports/payments" element={canViewReports ? <FinancialReport kind="payments"/> : <Navigate to="/finance" replace/>}/>
    <Route path="/reports/products" element={canViewReports ? <OperationsReport kind="products"/> : <Navigate to="/finance" replace/>}/>
    <Route path="/reports/inventory" element={canViewReports ? <OperationsReport kind="inventory"/> : <Navigate to="/finance" replace/>}/>
    <Route path="/reports/returns" element={canViewReports ? <OperationsReport kind="returns"/> : <Navigate to="/finance" replace/>}/>
    <Route path="/reports/cashiers" element={canViewReports ? <ManagementReport kind="cashiers"/> : <Navigate to="/finance" replace/>}/>
    <Route path="/reports/branches" element={canViewReports ? <ManagementReport kind="branches"/> : <Navigate to="/finance" replace/>}/>
    <Route path="/reports/online" element={canViewReports ? <ManagementReport kind="online"/> : <Navigate to="/finance" replace/>}/>
    <Route path="/reports/customers" element={canViewReports ? <ManagementReport kind="customers"/> : <Navigate to="/finance" replace/>}/>
    <Route path="/reports/costs" element={canViewReports ? <ManagementReport kind="costs"/> : <Navigate to="/finance" replace/>}/>
    <Route path="/reports/transfers" element={canViewReports ? <ManagementReport kind="transfers"/> : <Navigate to="/finance" replace/>}/>
    <Route path="/reports/insights" element={canViewReports ? <ManagementReport kind="insights"/> : <Navigate to="/finance" replace/>}/>
    <Route path="/reports/*" element={<Navigate to="/reports" replace/>}/>
    <Route path="/finance" element={canViewFinance ? <Finance/> : <Navigate to="/" replace/>}/>
    <Route path="/notifications" element={<Notifications/>}/>
    <Route path="/more" element={<More/>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></AppShell>;
}

function SetupRequired() {
  return <div className="auth-page"><section className="auth-card setup-card"><div className="brand brand--center"><span className="brand__mark">م</span><div><strong>المعداوي</strong><span>للأعمال</span></div></div><h1>إعداد الاتصال مطلوب</h1><p>انسخ <code>.env.example</code> إلى <code>.env</code> وأضف رابط Supabase والمفتاح العام لنفس بيئة المعداوي. لا يتم تضمين المفاتيح داخل الكود.</p></section></div>;
}
