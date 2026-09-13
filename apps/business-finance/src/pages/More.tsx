import { Building2, CheckCircle2, KeyRound, LogOut, ShieldCheck, Smartphone, UserRoundCog } from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { supabase } from '../lib/supabase';

const permissionLabels: Record<string, string> = {
  'reports.view': 'عرض التقارير', 'finance.view': 'عرض المالية', 'finance.manage': 'إدارة المالية',
  'inventory.view': 'عرض المخزون', 'inventory.manage': 'إدارة المخزون', 'inventory.count': 'الجرد',
};

export default function More() {
  const { identity, branches, selectedBranch } = useBusiness();
  return <div className="stack-lg">
    <section className="page-intro"><span className="eyebrow">الإدارة</span><h2>الحساب والوصول</h2><p>بيانات حسابك والفروع والصلاحيات الفعلية التي يطبقها الخادم على تطبيق الأعمال.</p></section>

    <section className="profile-card section-card">
      <span className="profile-card__icon"><UserRoundCog size={26}/></span>
      <div><span className="eyebrow">المستخدم الحالي</span><h3>{identity?.name || 'مستخدم المعداوي'}</h3><p>{identity?.username || '—'} · {identity?.is_super_admin ? 'مدير نظام' : selectedBranch?.role_name_ar || 'موظف'}</p></div>
      <span className="status-badge"><CheckCircle2 size={15}/> حساب نشط</span>
    </section>

    <section className="split-grid">
      <article className="section-card"><div className="section-heading"><div><span className="eyebrow">Branches</span><h3>الفروع المتاحة</h3></div><Building2 size={20}/></div><div className="rows-list">{branches.map((branch) => <div className="data-row data-row--two-line" key={branch.branch_id}><div><span>{branch.branch_name}</span><small>{branch.role_name_ar}{branch.is_primary ? ' · الفرع الرئيسي' : ''}</small></div>{branch.branch_id === selectedBranch?.branch_id && <span className="selected-chip">محدد الآن</span>}</div>)}</div></article>
      <article className="section-card"><div className="section-heading"><div><span className="eyebrow">Access Control</span><h3>صلاحيات الفرع الحالي</h3></div><ShieldCheck size={20}/></div><div className="permission-list">{selectedBranch?.permissions.length ? selectedBranch.permissions.map((permission) => <span key={permission}><KeyRound size={13}/>{permissionLabels[permission] || permission}</span>) : <p className="muted">لا توجد صلاحيات إضافية.</p>}</div></article>
    </section>

    <section className="section-card app-info"><div className="section-heading"><div><span className="eyebrow">Application</span><h3>المعداوي للأعمال</h3></div><Smartphone size={20}/></div><div className="data-row"><span>الإصدار</span><strong>1.0.0</strong></div><div className="data-row"><span>نطاق البيانات</span><strong>{selectedBranch?.branch_name || '—'}</strong></div><p className="muted">يتم حفظ جلسة الدخول بأمان داخل التطبيق، ولا يحتوي ملف التطبيق على مفاتيح إدارية أو Service Role.</p></section>
    <button className="logout-button" onClick={() => supabase?.auth.signOut()}><LogOut size={19}/> تسجيل الخروج</button>
  </div>;
}
