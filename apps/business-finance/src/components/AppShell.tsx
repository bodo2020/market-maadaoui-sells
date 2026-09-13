import type { ReactNode } from 'react';
import { BarChart3, Bell, Building2, CircleDollarSign, LayoutDashboard, MoreHorizontal, Search } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useBusiness } from '../context/BusinessContext';
import Brand from './Brand';

const nav = [
  { to: '/', label: 'الرئيسية', icon: LayoutDashboard },
  { to: '/reports', label: 'التقارير', icon: BarChart3 },
  { to: '/finance', label: 'المالية', icon: CircleDollarSign },
  { to: '/notifications', label: 'التنبيهات', icon: Bell },
  { to: '/more', label: 'المزيد', icon: MoreHorizontal },
];
const titles: Record<string, string> = { '/': 'نظرة عامة', '/reports': 'التقارير والتحليلات', '/finance': 'النظام المالي', '/notifications': 'التنبيهات', '/more': 'المزيد' };

export default function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { branches, identity, selectedBranch, selectBranch } = useBusiness();
  const title = location.pathname.startsWith('/reports/') ? 'تفاصيل التقرير' : titles[location.pathname] ?? 'المعداوي للأعمال';
  const visibleNav = nav.filter((item) => {
    if (item.to === '/' || item.to === '/reports') return selectedBranch?.permissions.includes('reports.view');
    if (item.to === '/finance') return selectedBranch?.permissions.some((permission) => permission === 'finance.view' || permission === 'finance.manage');
    return true;
  });
  return <div className="app-shell">
    <aside className="desktop-sidebar">
      <Brand />
      <nav className="side-nav">{visibleNav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'side-nav__item active' : 'side-nav__item'}><Icon size={20}/><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-note"><strong>Business Finance</strong><span>تقارير ومالية المعداوي ماركت</span></div>
    </aside>
    <div className="app-content">
      <header className="topbar">
        <div className="topbar__title">
          <Brand compact />
          <div><span>{identity?.name || 'المعداوي ماركت'}</span><h1>{title}</h1></div>
        </div>
        <div className="topbar__actions">
          <label className="branch-select">
            <Building2 size={17}/>
            <select value={selectedBranch?.branch_id || ''} onChange={(event) => selectBranch(event.target.value)} aria-label="اختر الفرع">
              {branches.map((branch) => <option value={branch.branch_id} key={branch.branch_id}>{branch.branch_name}</option>)}
            </select>
          </label>
          <button className="icon-button" aria-label="بحث"><Search size={20}/></button>
          <NavLink className="icon-button notification-button" to="/notifications" aria-label="التنبيهات"><Bell size={20}/></NavLink>
        </div>
      </header>
      <main className="page-content">{children}</main>
      <nav className="bottom-nav" style={{ gridTemplateColumns: `repeat(${visibleNav.length}, 1fr)` }}>{visibleNav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'bottom-nav__item active' : 'bottom-nav__item'}><Icon size={21}/><span>{label}</span></NavLink>)}</nav>
    </div>
  </div>;
}
