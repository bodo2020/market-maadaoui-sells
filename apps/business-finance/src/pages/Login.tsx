import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import Brand from '../components/Brand';
import { supabase } from '../lib/supabase';
import './login.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) { setError('لم يتم إعداد اتصال Supabase لهذا التطبيق.'); return; }
    const normalizedUsername = username.trim();
    const email = normalizedUsername.includes('@') ? normalizedUsername : staffAuthEmail(normalizedUsername);
    setLoading(true);
    setError('');
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setError('تعذر تسجيل الدخول. تأكد من البيانات والصلاحيات.');
    setLoading(false);
  }

  return <div className="auth-page"><section className="auth-card"><Brand centered/><div className="auth-heading"><h1>أهلًا بك</h1><p>سجّل ببيانات الموظف للوصول إلى تقارير ومالية الفروع المصرح بها فقط.</p></div>
    <form onSubmit={submit} className="auth-form" autoComplete="on">
      <label htmlFor="business-username"><span>اسم المستخدم أو البريد الإلكتروني</span><div className="input-wrap"><UserRound size={19}/><input id="business-username" name="username" type="text" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required/></div></label>
      <label htmlFor="business-password"><span>كلمة المرور</span><div className="input-wrap password-input-wrap"><LockKeyhole size={19}/><input id="business-password" name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required/><button type="button" className="password-visibility" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
      {error && <div className="inline-error">{error}</div>}
      <button type="submit" className="primary-button" disabled={loading}>{loading ? 'جاري الدخول…' : 'تسجيل الدخول'}</button>
    </form>
    <p className="auth-footnote">يمكن لـGoogle Password Manager أو مدير كلمات المرور في الجهاز حفظ بيانات الدخول بعد نجاح تسجيل الدخول.</p>
  </section></div>;
}

function staffAuthEmail(username: string): string {
  const bytes = new TextEncoder().encode(username.trim());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `u-${encoded}@staff.elmadawymarket.local`;
}
