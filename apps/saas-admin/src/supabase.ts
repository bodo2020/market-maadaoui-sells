import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qzvpayjaadbmpayeglon.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmF5ZSIsInJlZiI6InF6dnBheWphYWRibXBheWVnbG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4MDUwMTMsImV4cCI6MjA2MDM4MTAxM30.ti7DYVtr4GdlzCeoUF8zD1lStDQfNuDj3mbsnYWP5H8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type StaffIdentity = {
  user_id: string;
  name: string;
  username: string;
  active: boolean;
  is_super_admin: boolean;
};

export function staffAuthEmail(username: string) {
  const bytes = new TextEncoder().encode(username.trim());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `u-${encoded}@staff.elmadawymarket.local`;
}

export async function fetchIdentity(): Promise<StaffIdentity> {
  const { data, error } = await supabase.rpc('get_my_staff_identity');
  if (error || !data || typeof data !== 'object') throw new Error('تعذر التحقق من الحساب.');
  const identity = data as StaffIdentity;
  if (!identity.active || !identity.is_super_admin) throw new Error('هذا التطبيق متاح لـ Super Admin فقط.');
  return identity;
}

export async function signInStaff(username: string, password: string) {
  const authEmail = staffAuthEmail(username);
  let result = await supabase.auth.signInWithPassword({ email: authEmail, password });
  if (result.error) {
    const { error } = await supabase.functions.invoke('migrate-staff-login', {
      body: { username: username.trim(), password },
    });
    if (error) {
      const fnError = error as any;
      try {
        const payload = await fnError?.context?.json?.();
        if (payload?.code !== 'already_migrated') throw new Error(payload?.error || 'اسم المستخدم أو كلمة المرور غير صحيحة.');
      } catch (e) {
        if (e instanceof Error) throw e;
      }
    }
    result = await supabase.auth.signInWithPassword({ email: authEmail, password });
  }
  if (result.error || !result.data.user) throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
  try {
    return await fetchIdentity();
  } catch (error) {
    await supabase.auth.signOut();
    throw error;
  }
}

export async function signOut() {
  await supabase.auth.signOut();
}
