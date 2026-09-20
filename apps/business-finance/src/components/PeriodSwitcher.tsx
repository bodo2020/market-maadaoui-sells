import type { PeriodKey } from '../services/businessFinance';

const periods: Array<{ key: PeriodKey; label: string }> = [
  { key: 'today', label: 'اليوم' },
  { key: 'yesterday', label: 'أمس' },
  { key: 'week', label: 'الأسبوع' },
  { key: 'month', label: 'الشهر' },
];

export default function PeriodSwitcher({ period, onChange }: { period: PeriodKey; onChange: (period: PeriodKey) => void }) {
  return <div className="period-switcher">{periods.map((item) => <button type="button" key={item.key} className={period === item.key ? 'active' : ''} onClick={() => onChange(item.key)}>{item.label}</button>)}</div>;
}
