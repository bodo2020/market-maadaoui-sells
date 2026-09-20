import { supabase } from '../lib/supabase';
import { explainRpcError, resolvePeriod, type BusinessFilters, type StaffBranch } from './businessFinance';

export const reportKeys = ['sales', 'profitability', 'products', 'inventory', 'payments', 'returns', 'cashiers', 'branches', 'online', 'customers', 'costs', 'insights', 'transfers'] as const;
export type ReportKey = typeof reportKeys[number];
export type ReportDocument = Record<string, unknown>;

export function isReportKey(value?: string): value is ReportKey {
  return Boolean(value && reportKeys.includes(value as ReportKey));
}

function client() {
  if (!supabase) throw new Error('إعدادات Supabase غير موجودة.');
  return supabase;
}

function payload(filters: BusinessFilters) {
  const range = resolvePeriod(filters);
  return {
    p_branch_id: filters.branchId,
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
  };
}

async function rpc(name: string, params: Record<string, unknown>): Promise<ReportDocument> {
  const { data, error } = await client().rpc(name, params);
  if (error) throw explainRpcError(error.message);
  if (!data || typeof data !== 'object') throw new Error('لم يُرجع محرك التقارير بيانات لهذه الفترة.');
  return data as ReportDocument;
}

export async function fetchDetailedReport(key: ReportKey, filters: BusinessFilters, branches: StaffBranch[]): Promise<ReportDocument> {
  const base = payload(filters);
  if (key === 'sales') return rpc('get_reporting_sales_v2', { ...base, p_channel: 'all', p_cashier_id: null, p_payment_code: null, p_search: null, p_limit: 50, p_offset: 0 });
  if (key === 'profitability') {
    const [profitability, onlineProfit] = await Promise.all([
      rpc('get_reporting_profitability_v2', base),
      fetchOnlineProfit(base, false),
    ]);
    return mergeProfitabilityReport(profitability, onlineProfit);
  }
  if (key === 'products') return rpc('get_reporting_products_v2', { ...base, p_limit: 100 });
  if (key === 'inventory') return rpc('get_reporting_inventory_v2', base);
  if (key === 'payments') return rpc('get_reporting_payments_v2', base);
  if (key === 'returns') return rpc('get_reporting_returns_v2', base);
  if (key === 'cashiers') return rpc('get_reporting_shifts_v2', { ...base, p_limit: 100 });
  if (key === 'online') {
    const [online, onlineProfit] = await Promise.all([
      rpc('get_reporting_online_v2', { ...base, p_limit: 100 }),
      fetchOnlineProfit(base, true),
    ]);
    return mergeOnlineReport(online, onlineProfit);
  }
  if (key === 'customers') return rpc('get_reporting_customers_v2', { ...base, p_limit: 100 });
  if (key === 'costs') return rpc('get_reporting_costs_v2', { ...base, p_limit: 100 });
  if (key === 'insights') return rpc('get_reporting_insights_v2', base);
  if (key === 'transfers') return rpc('get_reporting_inventory_transfers_v2', base);

  // The branch comparison intentionally reuses the same secured overview RPC for every accessible branch.
  const range = resolvePeriod(filters);
  const allowedBranches = branches.filter((branch) => branch.permissions.includes('reports.view'));
  const rows = await Promise.all(allowedBranches.map(async (branch) => {
    const overview = await rpc('get_reporting_overview_v2', {
      p_branch_id: branch.branch_id,
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
    });
    return { branch_id: branch.branch_id, branch_name: branch.branch_name, current: overview.current || {} };
  }));
  return { branches: rows, from: range.from.toISOString(), to: range.to.toISOString() };
}


async function fetchOnlineProfit(params: Record<string, unknown>, optional: boolean): Promise<ReportDocument | null> {
  const { data, error } = await client().rpc('get_reporting_online_profit_v1', params);
  if (error) {
    if (optional && (error.code === '42501' || error.message.includes('REPORTS_PROFIT_DENIED'))) return null;
    throw explainRpcError(error.message);
  }
  if (!data || typeof data !== 'object') return optional ? null : {};
  return data as ReportDocument;
}

function mergeProfitabilityReport(base: ReportDocument, online: ReportDocument | null): ReportDocument {
  if (!online) return base;
  const baseSummary = record(base.summary);
  const onlineSummary = record(online.summary);
  const onlineGrossProfit = nullableNumber(onlineSummary.online_gross_profit);
  const posGrossProfit = nullableNumber(baseSummary.pos_gross_profit);
  const combinedGrossProfit = onlineGrossProfit == null || posGrossProfit == null
    ? null
    : roundMoney(posGrossProfit + onlineGrossProfit);

  const onlineByDate = new Map(rows(online.daily).map((row) => [String(row.date || ''), row]));
  const daily = rows(base.daily).map((row) => {
    const onlineRow = onlineByDate.get(String(row.date || '')) || {};
    const posProfit = nullableNumber(row.gross_profit);
    const onlineProfit = nullableNumber(onlineRow.online_gross_profit);
    return {
      ...row,
      online_net_sales: onlineRow.online_net_sales ?? 0,
      online_cogs: onlineRow.online_cogs ?? (onlineRow.cost_complete === false ? null : 0),
      online_gross_profit: onlineRow.online_gross_profit ?? (onlineRow.cost_complete === false ? null : 0),
      combined_gross_profit: posProfit == null || onlineProfit == null ? null : roundMoney(posProfit + onlineProfit),
    };
  });

  const waterfall = [
    ...rows(base.waterfall),
    { key: 'online_net_sales', label: 'صافي مبيعات الأونلاين', value: numeric(onlineSummary.online_net_sales) },
    { key: 'online_cogs', label: 'تكلفة الأونلاين', value: onlineSummary.online_cogs == null ? null : -numeric(onlineSummary.online_cogs) },
    { key: 'online_gross_profit', label: 'إجمالي ربح الأونلاين', value: onlineGrossProfit },
    { key: 'combined_gross_profit', label: 'إجمالي الربح POS + Online', value: combinedGrossProfit },
  ];

  return {
    ...base,
    summary: { ...baseSummary, ...onlineSummary, combined_gross_profit: combinedGrossProfit },
    daily,
    waterfall,
    online_profit_complete: Boolean(onlineSummary.cost_complete),
    online_profit_quality: online.data_quality || {},
  };
}

function mergeOnlineReport(base: ReportDocument, online: ReportDocument | null): ReportDocument {
  if (!online) return base;
  const baseSummary = record(base.summary);
  const onlineSummary = record(online.summary);
  const profitByDate = new Map(rows(online.daily).map((row) => [String(row.date || ''), row]));
  const daily = rows(base.daily).map((row) => {
    const profit = profitByDate.get(String(row.day || row.date || '')) || {};
    return { ...row, ...profit, day: row.day ?? profit.date };
  });
  return {
    ...base,
    summary: { ...baseSummary, ...onlineSummary },
    daily,
    data_quality: { ...record(base.data_quality), ...record(online.data_quality) },
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
