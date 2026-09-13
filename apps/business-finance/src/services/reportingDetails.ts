import { supabase } from '../lib/supabase';
import { explainRpcError, resolvePeriod, type BusinessFilters, type StaffBranch } from './businessFinance';

export const reportKeys = ['sales', 'profitability', 'products', 'inventory', 'payments', 'returns', 'cashiers', 'branches', 'online'] as const;
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
  if (key === 'profitability') return rpc('get_reporting_profitability_v2', base);
  if (key === 'products') return rpc('get_reporting_products_v2', { ...base, p_limit: 100 });
  if (key === 'inventory') return rpc('get_reporting_inventory_v2', base);
  if (key === 'payments') return rpc('get_reporting_payments_v2', base);
  if (key === 'returns') return rpc('get_reporting_returns_v2', base);
  if (key === 'cashiers') return rpc('get_reporting_shifts_v2', { ...base, p_limit: 100 });
  if (key === 'online') return rpc('get_reporting_online_v2', { ...base, p_limit: 100 });

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
