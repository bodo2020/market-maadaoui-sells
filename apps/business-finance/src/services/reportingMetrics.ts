export type ReportingMetricKey =
  | 'gross_sales'
  | 'net_sales'
  | 'transactions'
  | 'average_ticket'
  | 'items_sold'
  | 'returns'
  | 'pos_net_sales'
  | 'pos_net_cogs'
  | 'pos_gross_profit'
  | 'merchant_payment_fees'
  | 'expenses'
  | 'known_operating_result'
  | 'payment_net_movement';

export type ReportingMetricDefinition = {
  key: ReportingMetricKey;
  label: string;
  shortLabel?: string;
  definition: string;
  formula: string;
  source: string;
  caveat?: string;
};

export const reportingMetricDefinitions: Record<ReportingMetricKey, ReportingMetricDefinition> = {
  gross_sales: {
    key: 'gross_sales',
    label: 'إجمالي المبيعات المسجلة',
    shortLabel: 'إجمالي المبيعات',
    definition: 'إجمالي قيمة فواتير POS مضافًا إليها قيمة الطلبات الأونلاين المسلّمة والمدفوعة داخل الفترة.',
    formula: 'POS invoice totals + delivered & paid online order totals',
    source: 'get_reporting_overview_v2 → current.gross_sales',
    caveat: 'لا يُستخدم وحده لقياس الربحية؛ الخصومات والمرتجعات وتكلفة البضاعة تُعرض في مؤشرات منفصلة.',
  },
  net_sales: {
    key: 'net_sales',
    label: 'صافي المبيعات',
    definition: 'إيراد البيع المحقق داخل الفترة بعد خصم قسائم الولاء ومرتجعات POS المعتمدة، مع إضافة الطلبات الأونلاين المسلّمة والمدفوعة.',
    formula: '(POS sales after loyalty − approved POS customer refunds) + delivered & paid online order total',
    source: 'get_reporting_overview_v2 → current.net_sales',
    caveat: 'إيراد الأونلاين داخل صافي المبيعات، لكن تكلفة وربح الأونلاين لم يكتمل ربطهما بعد.',
  },
  transactions: {
    key: 'transactions',
    label: 'عدد الفواتير والطلبات',
    shortLabel: 'العمليات',
    definition: 'عدد فواتير POS مضافًا إليه عدد الطلبات الأونلاين المسلّمة والمدفوعة داخل الفترة.',
    formula: 'POS invoice count + delivered & paid online order count',
    source: 'get_reporting_overview_v2 → current.transactions',
  },
  average_ticket: {
    key: 'average_ticket',
    label: 'متوسط الفاتورة / الطلب',
    shortLabel: 'متوسط الفاتورة',
    definition: 'متوسط صافي الإيراد لكل عملية بيع محققة في الفترة عبر POS والأونلاين.',
    formula: 'Net Sales ÷ Transactions',
    source: 'get_reporting_overview_v2 → current.average_ticket',
  },
  items_sold: {
    key: 'items_sold',
    label: 'صافي الوحدات/الأوزان المباعة',
    shortLabel: 'الوحدات المباعة',
    definition: 'صافي كميات وأوزان أصناف POS بعد طرح الكميات المرتجعة.',
    formula: 'POS sold units + sold weight − returned measure',
    source: 'get_reporting_overview_v2 → current.items_sold',
    caveat: 'هذا المؤشر حاليًا مبني على عناصر POS ولا يضيف عناصر الأونلاين.',
  },
  returns: {
    key: 'returns',
    label: 'مرتجعات POS المعتمدة',
    shortLabel: 'المرتجعات',
    definition: 'القيمة النقدية المعتمدة لمرتجعات POS الواقعة داخل الفترة.',
    formula: 'approved POS cash refunds + approved POS card refunds',
    source: 'get_reporting_overview_v2 → current.returns',
    caveat: 'تقرير المرتجعات التفصيلي يعرض نطاقًا أوسع، ويجب الرجوع إليه لتحليل المرتجعات حسب المصدر والسبب.',
  },
  pos_net_sales: {
    key: 'pos_net_sales',
    label: 'صافي مبيعات POS',
    definition: 'مبيعات POS بعد قسائم الولاء وطرح مرتجعات POS المعتمدة.',
    formula: 'POS sales after loyalty − approved POS customer refunds',
    source: 'get_reporting_profitability_v2 → summary.pos_net_sales',
  },
  pos_net_cogs: {
    key: 'pos_net_cogs',
    label: 'صافي تكلفة البضاعة المباعة POS',
    shortLabel: 'COGS',
    definition: 'تكلفة عناصر POS باستخدام لقطة سعر الشراء وقت البيع بعد طرح تكلفة العناصر المرتجعة.',
    formula: 'sold item purchase-cost snapshots − returned item cost',
    source: 'get_reporting_profitability_v2 → summary.pos_net_cogs',
    caveat: 'يتطلب صلاحية عرض الربحية.',
  },
  pos_gross_profit: {
    key: 'pos_gross_profit',
    label: 'إجمالي ربح POS',
    definition: 'الربح الإجمالي المحقق من POS بعد تكلفة البضاعة وقبل رسوم الدفع والمصروفات التشغيلية.',
    formula: 'POS Net Sales − POS Net COGS',
    source: 'get_reporting_profitability_v2 → summary.pos_gross_profit',
    caveat: 'لا يتضمن ربح الأونلاين حتى تتوفر تكلفة عناصر الأونلاين بصورة موثوقة.',
  },
  merchant_payment_fees: {
    key: 'merchant_payment_fees',
    label: 'رسوم وسائل الدفع على المتجر',
    shortLabel: 'رسوم الدفع',
    definition: 'إجمالي الرسوم التي يتحملها المتجر والمثبتة على فواتير POS داخل الفترة.',
    formula: 'Σ merchant_payment_fee_amount',
    source: 'get_reporting_overview_v2 → current.merchant_payment_fees',
    caveat: 'رسوم العميل منفصلة ولا تُخصم من ربح المتجر بهذا المؤشر.',
  },
  expenses: {
    key: 'expenses',
    label: 'المصروفات التشغيلية المعتمدة',
    shortLabel: 'المصروفات',
    definition: 'إجمالي المصروفات النشطة المسجلة للفرع داخل الفترة.',
    formula: 'Σ active branch expenses in period',
    source: 'get_reporting_overview_v2 → current.expenses',
    caveat: 'تظهر القيمة وفق صلاحية العرض المالي للحساب.',
  },
  known_operating_result: {
    key: 'known_operating_result',
    label: 'النتيجة التشغيلية المعروفة',
    shortLabel: 'النتيجة التشغيلية',
    definition: 'النتيجة التشغيلية القابلة للحساب بصورة موثوقة من بيانات POS والتكاليف والرسوم والمصروفات المتاحة حاليًا.',
    formula: 'POS Net Sales − POS Net COGS − Merchant Payment Fees − Active Expenses',
    source: 'get_reporting_profitability_v2 → summary.known_operating_result',
    caveat: 'لا تُسمى صافي ربح شامل لأنها تستبعد ربح الأونلاين إلى أن تكتمل تكلفة عناصر الأونلاين.',
  },
  payment_net_movement: {
    key: 'payment_net_movement',
    label: 'صافي حركة التحصيل',
    definition: 'صافي ما تحرك خلال الفترة عبر وسيلة الدفع بعد الرسوم المسجلة والمرتجعات المكتملة.',
    formula: 'Gross Collected − Payment Fees − Completed Refunds',
    source: 'get_reporting_payments_v2 → summary.net_period_movement',
    caveat: 'يختلف عن رصيد الحساب الحي وغير المسوّى؛ تلك الأرصدة تعتمد على Payment Ledger وصلاحية المالية.',
  },
};

export const coreReportingMetricKeys: ReportingMetricKey[] = [
  'net_sales',
  'pos_gross_profit',
  'known_operating_result',
  'average_ticket',
  'returns',
  'merchant_payment_fees',
];

export function getReportingMetric(key: ReportingMetricKey): ReportingMetricDefinition {
  return reportingMetricDefinitions[key];
}

export function metricLabel(key: ReportingMetricKey, compact = false): string {
  const metric = getReportingMetric(key);
  return compact && metric.shortLabel ? metric.shortLabel : metric.label;
}
