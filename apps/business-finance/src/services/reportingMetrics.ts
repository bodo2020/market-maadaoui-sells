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
  | 'online_net_sales'
  | 'online_cogs'
  | 'online_gross_profit'
  | 'combined_gross_profit'
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
  online_net_sales: {
    key: 'online_net_sales',
    label: 'صافي مبيعات الأونلاين',
    definition: 'قيمة المنتجات في الطلبات الأونلاين المسلّمة والمدفوعة بعد فصل رسوم التوصيل عن إيراد البضاعة.',
    formula: 'Delivered & paid online order total − shipping charged',
    source: 'get_reporting_online_profit_v1 → summary.online_net_sales',
  },
  online_cogs: {
    key: 'online_cogs',
    label: 'تكلفة مبيعات الأونلاين',
    definition: 'تكلفة أصناف الطلبات الأونلاين المحققة، من Snapshot لسعر الشراء عند تحقق الطلب. البيانات التاريخية السابقة للتطوير معلمة كمُعاد بنائها.',
    formula: 'Σ online item purchase-cost snapshots',
    source: 'get_reporting_online_profit_v1 → summary.online_cogs',
    caveat: 'إذا وُجد بند بلا تكلفة موثقة، لا يعرض النظام رقم ربح تخميني للفترة.',
  },
  online_gross_profit: {
    key: 'online_gross_profit',
    label: 'إجمالي ربح الأونلاين',
    definition: 'ربح البضاعة في الطلبات الأونلاين بعد خصم تكلفة الأصناف وقبل تكلفة التوصيل ورسوم الدفع التشغيلية.',
    formula: 'Online Net Sales − Online COGS',
    source: 'get_reporting_online_profit_v1 → summary.online_gross_profit',
    caveat: 'رسوم التوصيل وتكلفته تعرض منفصلة؛ هذا المؤشر هو Gross Profit للبضاعة وليس صافي ربح التوصيل.',
  },
  combined_gross_profit: {
    key: 'combined_gross_profit',
    label: 'إجمالي الربح POS + Online',
    definition: 'مجموع إجمالي ربح نقطة البيع وإجمالي ربح البضاعة في الأونلاين عندما تكون تكلفة القناتين مكتملة.',
    formula: 'POS Gross Profit + Online Gross Profit',
    source: 'Business app reporting merge',
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
    definition: 'النتيجة التشغيلية المعروفة لقناة POS بعد التكلفة ورسوم الدفع والمصروفات المسجلة.',
    formula: 'POS Net Sales − POS Net COGS − Merchant Payment Fees − Active Expenses',
    source: 'get_reporting_profitability_v2 → summary.known_operating_result',
    caveat: 'تظل منفصلة عن Gross Profit الأونلاين لأن رسوم الدفع وتكلفة التوصيل للأونلاين ليست جزءًا من هذه الصيغة.',
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
  'online_gross_profit',
  'combined_gross_profit',
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
