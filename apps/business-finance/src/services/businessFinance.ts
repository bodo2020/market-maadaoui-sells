import { supabase } from '../lib/supabase';

export type PeriodKey = 'today' | 'yesterday' | 'week' | 'month' | 'custom';
export type BusinessFilters = { period: PeriodKey; from?: string; to?: string; branchId?: string | null };
export type TrendValue = { value: number | null; changePercent: number | null };
export type OverviewData = {
  netSales: TrendValue; grossProfit: TrendValue; netProfit: TrendValue; invoices: TrendValue;
  averageBasket: number | null; unitsSold: number | null; returns: number | null; expenses: number | null;
  channels: Array<{ key: string; label: string; amount: number }>;
  payments: Array<{ key: string; label: string; amount: number; fee: number | null }>;
  timeline: Array<{ label: string; amount: number }>;
  generatedAt: string | null;
};
export type FinanceAccount = { id: string; name: string; kind: 'cash' | 'bank' | 'card' | 'wallet' | 'other'; balance: number | null; pending: number | null };
export type CashFlowItem = { id: string; label: string; amount: number; direction: 'in' | 'out'; occurredAt: string; sourceType?: string | null };

export class ReportingEngineUnavailableError extends Error {
  constructor(message = 'محرك التقارير المالي غير متاح على الـBackend الحالي.') { super(message); this.name = 'ReportingEngineUnavailableError'; }
}

function assertClient() {
  if (!supabase) throw new Error('إعدادات Supabase غير موجودة. أضف متغيرات البيئة أولًا.');
  return supabase;
}
function rpcPayload(filters: BusinessFilters) { return { p_period: filters.period, p_from: filters.from ?? null, p_to: filters.to ?? null, p_branch_id: filters.branchId ?? null }; }
function isMissingFunction(message: string) { const value = message.toLowerCase(); return value.includes('function') && (value.includes('does not exist') || value.includes('could not find')); }

export async function fetchOverview(filters: BusinessFilters): Promise<OverviewData> {
  const { data, error } = await assertClient().rpc('get_business_finance_overview', rpcPayload(filters));
  if (error) { if (isMissingFunction(error.message)) throw new ReportingEngineUnavailableError(); throw error; }
  return data as unknown as OverviewData;
}
export async function fetchFinanceAccounts(filters: BusinessFilters): Promise<FinanceAccount[]> {
  const { data, error } = await assertClient().rpc('get_business_finance_accounts', rpcPayload(filters));
  if (error) { if (isMissingFunction(error.message)) throw new ReportingEngineUnavailableError(); throw error; }
  return (data ?? []) as unknown as FinanceAccount[];
}
export async function fetchCashFlow(filters: BusinessFilters): Promise<CashFlowItem[]> {
  const { data, error } = await assertClient().rpc('get_business_finance_cashflow', rpcPayload(filters));
  if (error) { if (isMissingFunction(error.message)) throw new ReportingEngineUnavailableError(); throw error; }
  return (data ?? []) as unknown as CashFlowItem[];
}
