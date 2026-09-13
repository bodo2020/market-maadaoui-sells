import { useState } from 'react';
import { LockKeyhole, UserRound } from 'lucide-react';
import Brand from '../components/Brand';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!supabase) { setError('لم يتم إعداد اتصال Supabase لهذا التطبيق.'); return; }
    const email = username.includes('@') ? username.trim() : staffAuthEmail(username);
    setLoading(true); setError(''); const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setError('تعذر تسجيل الدخول. تأكد من البيانات والصلاحيات.'); setLoading(false);
  }
  return <div className="auth-page"><section className="auth-card"><Brand centered/><div className="auth-heading"><h1>أهلًا بك</h1><p>سجّل ببيانات الموظف للوصول إلى تقارير ومالية الفروع المصرح بها فقط.</p></div><form onSubmit={submit} className="auth-form"><label><span>اسم المستخدم أو البريد الإلكتروني</span><div className="input-wrap"><UserRound size={19}/><input type="text" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required/></div></label><label><span>كلمة المرور</span><div className="input-wrap"><LockKeyhole size={19}/><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required/></div></label>{error && <div className="inline-error">{error}</div>}<button className="primary-button" disabled={loading}>{loading ? 'جاري الدخول…' : 'تسجيل الدخول'}</button></form><p className="auth-footnote">الوصول يخضع لصلاحيات الموظف والفرع على قاعدة البيانات.</p></section></div>;
}

function staffAuthEmail(username: string): string {
  const bytes = new TextEncoder().encode(username.trim());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `u-${encoded}@staff.elmadawymarket.local`;
}
