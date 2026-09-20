import type { LucideIcon } from 'lucide-react';
import { ArrowDownLeft, ArrowUpLeft } from 'lucide-react';

export function money(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(value);
}
export function number(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('ar-EG').format(value);
}

type Props = { title: string; value: string; icon: LucideIcon; change?: number | null; hint?: string; emphasis?: 'default' | 'success' | 'warning' };
export default function MetricCard({ title, value, icon: Icon, change, hint, emphasis = 'default' }: Props) {
  const hasChange = change != null && Number.isFinite(change);
  const positive = (change ?? 0) >= 0;
  return <article className={`metric-card metric-card--${emphasis}`}>
    <div className="metric-card__top"><span className="metric-card__title">{title}</span><span className="metric-card__icon"><Icon size={20} /></span></div>
    <strong className="metric-card__value">{value}</strong>
    <div className="metric-card__footer">{hasChange ? <span className={`trend ${positive ? 'trend--up' : 'trend--down'}`}>{positive ? <ArrowUpLeft size={15} /> : <ArrowDownLeft size={15} />}{Math.abs(change!).toLocaleString('ar-EG', { maximumFractionDigits: 1 })}%<span>عن الفترة السابقة</span></span> : <span className="muted">{hint ?? 'المقارنة غير متاحة'}</span>}</div>
  </article>;
}
