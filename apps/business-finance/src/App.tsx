import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import Finance from './pages/Finance';
import Login from './pages/Login';
import More from './pages/More';
import Notifications from './pages/Notifications';
import Reports from './pages/Reports';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.subscription.unsubscribe();
  }, []);

  if (!hasSupabaseConfig) return <SetupRequired />;
  if (loading) return <div className="full-loader"><span className="brand__mark">م</span><p>جاري تجهيز المعداوي للأعمال…</p></div>;
  if (!session) return <Routes><Route path="*" element={<Login/>}/></Routes>;

  return <AppShell><Routes>
    <Route path="/" element={<Dashboard/>}/>
    <Route path="/reports" element={<Reports/>}/>
    <Route path="/finance" element={<Finance/>}/>
    <Route path="/notifications" element={<Notifications/>}/>
    <Route path="/more" element={<More/>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></AppShell>;
}

function SetupRequired() {
  return <div className="auth-page"><section className="auth-card setup-card"><div className="brand brand--center"><span className="brand__mark">م</span><div><strong>المعداوي</strong><span>للأعمال</span></div></div><h1>إعداد الاتصال مطلوب</h1><p>انسخ <code>.env.example</code> إلى <code>.env</code> وأضف رابط Supabase والمفتاح العام لنفس بيئة المعداوي. لا يتم تضمين المفاتيح داخل الكود.</p></section></div>;
}
