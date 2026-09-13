import { supabase } from '../lib/supabase';

export type PeriodKey = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export type BusinessFilters = {
  period: PeriodKey;
  branchId: string;
  from?: string;
  to?: string;
};

export type StaffBranch = {
  branch_id: string;
  branch_name: string;
  branch_code: string;
  role_code: string;
  role_name_ar: string;
  is_primary: boolean;
  pos_enabled: boolean;
  permissions: string[];
};

export type StaffIdentity = {
  user_id: string;
  name: string;
  username: string;
  active: boolean;
  is_super_admin: boolean;
};

export type TrendValue = { value: number | null; changePercent: number | null };

export type ProfitBreakdown = {
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  cogs: number | null;
  grossProfit: number | null;
  paymentFees: number;
  expenses: number;
  operatingResult: number | null;
  onlineProfitComplete: boolean;
};

export type OverviewData = {
  netSales: TrendValue;
  grossProfit: TrendValue;
  netProfit: TrendValue;
  invoices: TrendValue;
  averageBasket: number;
  unitsSold: number;
  returns: number;
  expenses: number;
  channels: Array<{ key: string; label: string; amount: number }>;
  payments: Array<{ key: string; label: string; amount: number; fee: number }>;
  timeline: Array<{ label: string; amount: number }>;
  profit: ProfitBreakdown;
  branchName: string;
  generatedAt: string;
};

export type FinanceAccount = {
  id: string;
  name: string;
  kind: 'cash' | 'bank' | 'card' | 'wallet' | 'other';
  balance: number;
  pending: number | null;
  accountType: string;
  active: boolean;
};

export type CashFlowItem = {
  id: string;
  label: string;
  amount: number;
  direction: 'in' | 'out';
  occurredAt: string;
  sourceType?: string | null;
  accountName?: string | null;
};

export type FinanceWorkspace = {
  accounts: FinanceAccount[];
  cashflow: CashFlowItem[];
  summary: {
    liquidFunds: number;
    operationalCash: number;
    inTransit: number;
    attentionCount: number;
  };
  generatedAt: string;
};

type ReportingMetrics = {
  transactions?: unknown;
  net_sales?: unknown;
  pos_net_sales?: unknown;
  online_net_sales?: unknown;
  average_ticket?: unknown;
  items_sold?: unknown;
  returns?: unknown;
  expenses?: unknown;
  gross_sales?: unknown;
  product_discounts?: unknown;
  loyalty_discounts?: unknown;
  merchant_payment_fees?: unknown;
  pos_net_cogs?: unknown;
  pos_gross_profit?: unknown;
  known_operating_result?: unknown;
  online_profit_complete?: unknown;
};

type ReportingOverview = {
  branch_name?: string;
  current?: ReportingMetrics;
  previous?: ReportingMetrics;
  daily?: Array<{ date?: string; net_sales?: unknown }>;
};

type ReportingPayments = {
  methods?: Array<{
    code?: string;
    name?: string;
    active?: boolean;
    gross_collected?: unknown;
    refunds?: unknown;
    payment_fees?: unknown;
    net_period_movement?: unknown;
  }>;
};

type TreasuryAccount = {
  account_id?: string;
  account_type?: string;
  provider_code?: string;
  name?: string;
  active?: boolean;
  balance?: unknown;
};

type TreasuryMovement = {
  id?: string;
  description?: string | null;
  account_name?: string | null;
  entry_type?: string;
  signed_amount?: unknown;
  created_at?: string;
};

type FinanceControlCenter = {
  summary?: {
    liquid_funds_total?: unknown;
    operational_cash_total?: unknown;
    in_transit_amount?: unknown;
    attention_count?: unknown;
  };
  treasury?: {
    cash_accounts?: TreasuryAccount[];
    payment_accounts?: TreasuryAccount[];
    recent_movements?: TreasuryMovement[];
  };
  generated_at?: string;
};

export class ReportingEngineUnavailableError extends Error {
  constructor(message = 'محرك التقارير المالي غير متاح على الـBackend الحالي.') {
    super(message);
    this.name = 'ReportingEngineUnavailableError';
  }
}

function assertClient() {
  if (!supabase) throw new Error('إعدادات Supabase غير موجودة. أضف متغيرات البيئة أولًا.');
  return supabase;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function changePercent(current: unknown, previous: unknown): number | null {
  const currentNumber = toNumber(current);
  const previousNumber = toNumber(previous);
  if (previousNumber === 0) return currentNumber === 0 ? 0 : null;
  return ((currentNumber - previousNumber) / Math.abs(previousNumber)) * 100;
}

function isMissingFunction(message: string) {
  const value = message.toLowerCase();
  return value.includes('function') && (value.includes('does not exist') || value.includes('could not find'));
}

function explainRpcError(message?: string) {
  const value = message || '';
  if (isMissingFunction(value)) return new ReportingEngineUnavailableError();
  if (value.includes('AUTH_REQUIRED')) return new Error('انتهت جلسة تسجيل الدخول. سجل الدخول مرة أخرى.');
  if (value.includes('REPORTS_VIEW_DENIED')) return new Error('ليس لديك صلاحية عرض التقارير لهذا الفرع.');
  if (value.includes('FINANCE_VIEW_DENIED')) return new Error('ليس لديك صلاحية عرض النظام المالي لهذا الفرع.');
  if (value.includes('BRANCH_ACCESS_DENIED') || value.includes('BRANCH_REQUIRED')) return new Error('الفرع المختار غير متاح لحسابك.');
  return new Error(value || 'تعذر تحميل البيانات من الخادم.');
}

type CairoParts = { year: number; month: number; day: number };
const cairoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function partsAt(date: Date) {
  return Object.fromEntries(cairoDateFormatter.formatToParts(date).map((part) => [part.type, part.value]));
}

function cairoDay(date: Date): CairoParts {
  const parts = partsAt(date);
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

function cairoOffsetAt(date: Date) {
  const parts = partsAt(date);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

function cairoMidnight(parts: CairoParts): Date {
  let instant = Date.UTC(parts.year, parts.month - 1, parts.day);
  for (let iteration = 0; iteration < 2; iteration += 1) {
    instant = Date.UTC(parts.year, parts.month - 1, parts.day) - cairoOffsetAt(new Date(instant));
  }
  return new Date(instant);
}

function shiftCivilDate(parts: CairoParts, days: number): CairoParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function resolvePeriod(filters: Pick<BusinessFilters, 'period' | 'from' | 'to'>) {
  if (filters.period === 'custom' && filters.from && filters.to) {
    return { from: new Date(filters.from), to: new Date(filters.to) };
  }

  const today = cairoDay(new Date());
  let start = today;
  let end = shiftCivilDate(today, 1);

  if (filters.period === 'yesterday') {
    start = shiftCivilDate(today, -1);
    end = today;
  } else if (filters.period === 'week') {
    const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
    start = shiftCivilDate(today, -((weekday + 1) % 7));
  } else if (filters.period === 'month') {
    start = { ...today, day: 1 };
  }

  return { from: cairoMidnight(start), to: cairoMidnight(end) };
}

export async function fetchBusinessAccess(): Promise<{ identity: StaffIdentity; branches: StaffBranch[] }> {
  const client = assertClient();
  const [identityResult, branchesResult] = await Promise.all([
    client.rpc('get_my_staff_identity'),
    client.rpc('get_my_staff_branches'),
  ]);

  if (identityResult.error) throw explainRpcError(identityResult.error.message);
  if (branchesResult.error) throw explainRpcError(branchesResult.error.message);

  const identity = identityResult.data as unknown as StaffIdentity;
  const branches = (Array.isArray(branchesResult.data) ? branchesResult.data : []) as unknown as StaffBranch[];
  const allowed = branches.filter((branch) =>
    branch.permissions?.includes('reports.view') ||
    branch.permissions?.includes('finance.view') ||
    branch.permissions?.includes('finance.manage'),
  );

  if (!identity?.user_id || identity.active === false) throw new Error('هذا الحساب غير متاح حاليًا.');
  if (!allowed.length) throw new Error('لا توجد فروع تملك فيها صلاحية التقارير أو المالية.');
  return { identity, branches: allowed };
}

export async function fetchOverview(filters: BusinessFilters): Promise<OverviewData> {
  const client = assertClient();
  const range = resolvePeriod(filters);
  const payload = {
    p_branch_id: filters.branchId,
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
  };

  const [overviewResult, paymentsResult] = await Promise.all([
    client.rpc('get_reporting_overview_v2', payload),
    client.rpc('get_reporting_payments_v2', payload),
  ]);

  if (overviewResult.error) throw explainRpcError(overviewResult.error.message);
  if (paymentsResult.error) throw explainRpcError(paymentsResult.error.message);

  const overview = (overviewResult.data || {}) as unknown as ReportingOverview;
  const paymentReport = (paymentsResult.data || {}) as unknown as ReportingPayments;
  const current = overview.current || {};
  const previous = overview.previous || {};
  const grossProfit = toNullableNumber(current.pos_gross_profit);
  const operatingResult = toNullableNumber(current.known_operating_result);
  const discounts = toNumber(current.product_discounts) + toNumber(current.loyalty_discounts);

  return {
    netSales: {
      value: toNumber(current.net_sales),
      changePercent: changePercent(current.net_sales, previous.net_sales),
    },
    grossProfit: {
      value: grossProfit,
      changePercent: grossProfit === null ? null : changePercent(grossProfit, previous.pos_gross_profit),
    },
    netProfit: {
      value: operatingResult,
      changePercent: operatingResult === null ? null : changePercent(operatingResult, previous.known_operating_result),
    },
    invoices: {
      value: toNumber(current.transactions),
      changePercent: changePercent(current.transactions, previous.transactions),
    },
    averageBasket: toNumber(current.average_ticket),
    unitsSold: toNumber(current.items_sold),
    returns: toNumber(current.returns),
    expenses: toNumber(current.expenses),
    channels: [
      { key: 'pos', label: 'نقطة البيع', amount: toNumber(current.pos_net_sales) },
      { key: 'online', label: 'الطلبات الأونلاين', amount: toNumber(current.online_net_sales) },
    ],
    payments: (paymentReport.methods || [])
      .filter((method) => method.active || toNumber(method.gross_collected) !== 0 || toNumber(method.refunds) !== 0)
      .map((method) => ({
        key: method.code || 'other',
        label: method.name || 'وسيلة دفع',
        amount: toNumber(method.net_period_movement),
        fee: toNumber(method.payment_fees),
      }))
      .sort((a, b) => b.amount - a.amount),
    timeline: (overview.daily || []).map((point) => ({
      label: point.date ? new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' }).format(new Date(`${point.date}T12:00:00Z`)) : '—',
      amount: toNumber(point.net_sales),
    })),
    profit: {
      grossSales: toNumber(current.gross_sales),
      discounts,
      returns: toNumber(current.returns),
      netSales: toNumber(current.net_sales),
      cogs: toNullableNumber(current.pos_net_cogs),
      grossProfit,
      paymentFees: toNumber(current.merchant_payment_fees),
      expenses: toNumber(current.expenses),
      operatingResult,
      onlineProfitComplete: Boolean(current.online_profit_complete),
    },
    branchName: overview.branch_name || '',
    generatedAt: new Date().toISOString(),
  };
}

function paymentKind(account: TreasuryAccount): FinanceAccount['kind'] {
  const provider = (account.provider_code || '').toLowerCase();
  if (account.account_type === 'bank') return 'bank';
  if (provider.includes('card')) return 'card';
  if (provider.includes('wallet') || provider.includes('instapay') || provider.includes('vodafone')) return 'wallet';
  return 'other';
}

export async function fetchFinanceWorkspace(filters: BusinessFilters): Promise<FinanceWorkspace> {
  const { data, error } = await assertClient().rpc('get_finance_control_center_v2', {
    p_branch_id: filters.branchId,
    p_limit: 200,
  });
  if (error) throw explainRpcError(error.message);

  const workspace = (data || {}) as unknown as FinanceControlCenter;
  const treasury = workspace.treasury || {};
  const range = resolvePeriod(filters);
  const accounts: FinanceAccount[] = [
    ...(treasury.cash_accounts || []).map((account) => ({
      id: account.account_id || crypto.randomUUID(),
      name: account.name || 'حساب نقدي',
      kind: 'cash' as const,
      balance: toNumber(account.balance),
      pending: null,
      accountType: account.account_type || 'cash',
      active: account.active !== false,
    })),
    ...(treasury.payment_accounts || []).map((account) => ({
      id: account.account_id || crypto.randomUUID(),
      name: account.name || 'حساب دفع',
      kind: paymentKind(account),
      balance: toNumber(account.balance),
      pending: null,
      accountType: account.account_type || 'payment',
      active: account.active !== false,
    })),
  ].filter((account) => account.active || Math.abs(account.balance) > 0.005);

  const cashflow = (treasury.recent_movements || [])
    .filter((movement) => {
      const date = new Date(movement.created_at || 0);
      return date >= range.from && date < range.to;
    })
    .map((movement) => {
      const amount = toNumber(movement.signed_amount);
      return {
        id: movement.id || crypto.randomUUID(),
        label: movement.description || movement.entry_type || 'حركة مالية',
        amount,
        direction: amount >= 0 ? 'in' as const : 'out' as const,
        occurredAt: movement.created_at || workspace.generated_at || new Date().toISOString(),
        sourceType: movement.entry_type || null,
        accountName: movement.account_name || null,
      };
    });

  return {
    accounts,
    cashflow,
    summary: {
      liquidFunds: toNumber(workspace.summary?.liquid_funds_total),
      operationalCash: toNumber(workspace.summary?.operational_cash_total),
      inTransit: toNumber(workspace.summary?.in_transit_amount),
      attentionCount: toNumber(workspace.summary?.attention_count),
    },
    generatedAt: workspace.generated_at || new Date().toISOString(),
  };
}
