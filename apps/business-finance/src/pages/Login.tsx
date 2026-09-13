import { useState } from 'react';
import { LockKeyhole, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!supabase) { setError('لم يتم إعداد اتصال Supabase لهذا التطبيق.'); return; }
    setLoading(true); setError(''); const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setError('تعذر تسجيل الدخول. تأكد من البيانات والصلاحيات.'); setLoading(false);
  }
  return <div className="auth-page"><section className="auth-card"><div className="brand brand--center"><span className="brand__mark">م</span><div><strong>المعداوي</strong><span>للأعمال</span></div></div><div className="auth-heading"><h1>أهلًا بك</h1><p>سجّل دخولك للوصول إلى التقارير والنظام المالي.</p></div><form onSubmit={submit} className="auth-form"><label><span>البريد الإلكتروني</span><div className="input-wrap"><Mail size={19}/><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required/></div></label><label><span>كلمة المرور</span><div className="input-wrap"><LockKeyhole size={19}/><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required/></div></label>{error && <div className="inline-error">{error}</div>}<button className="primary-button" disabled={loading}>{loading ? 'جاري الدخول…' : 'تسجيل الدخول'}</button></form><p className="auth-footnote">الوصول يخضع لصلاحيات النظام وRLS على قاعدة البيانات.</p></section></div>;
}
