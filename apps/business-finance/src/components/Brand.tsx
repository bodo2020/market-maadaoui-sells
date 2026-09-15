type Props = { centered?: boolean; compact?: boolean };

export default function Brand({ centered = false, compact = false }: Props) {
  return <div className={`brand${centered ? ' brand--center' : ''}${compact ? ' brand--compact' : ''}`}>
    <img className="brand__logo" src="/elmadawy-logo.png" alt="ماركت المعداوي" />
    {!compact && <div><strong>المعداوي</strong><span>للأعمال</span></div>}
  </div>;
}
