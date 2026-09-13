import type { ReactNode } from 'react';
import { BarChart3, Bell, CircleDollarSign, LayoutDashboard, Menu, MoreHorizontal, Search } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

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
  const title = titles[location.pathname] ?? 'المعداوي للأعمال';
  return <div className="app-shell">
    <aside className="desktop-sidebar">
      <div className="brand"><span className="brand__mark">م</span><div><strong>المعداوي</strong><span>للأعمال</span></div></div>
      <nav className="side-nav">{nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'side-nav__item active' : 'side-nav__item'}><Icon size={20}/><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-note"><strong>Business Finance</strong><span>تقارير ومالية المعداوي ماركت</span></div>
    </aside>
    <div className="app-content">
      <header className="topbar"><div className="topbar__title"><button className="icon-button mobile-only" aria-label="القائمة"><Menu size={21}/></button><div><span>المعداوي ماركت</span><h1>{title}</h1></div></div><div className="topbar__actions"><button className="icon-button" aria-label="بحث"><Search size={20}/></button><NavLink className="icon-button notification-button" to="/notifications" aria-label="التنبيهات"><Bell size={20}/></NavLink></div></header>
      <main className="page-content">{children}</main>
      <nav className="bottom-nav">{nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'bottom-nav__item active' : 'bottom-nav__item'}><Icon size={21}/><span>{label}</span></NavLink>)}</nav>
    </div>
  </div>;
}
