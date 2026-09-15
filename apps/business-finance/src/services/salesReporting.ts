import { supabase } from '../lib/supabase';
import { explainRpcError, resolvePeriod, type BusinessFilters } from './businessFinance';
import type { ReportDocument } from './reportingDetails';

export type SalesChannel = 'all' | 'pos' | 'online';

export type SalesReportFilters = BusinessFilters & {
  channel: SalesChannel;
  cashierId?: string | null;
  paymentCode?: string | null;
  search?: string;
  limit?: number;
  offset?: number;
};

export async function fetchAdvancedSalesReport(filters: SalesReportFilters): Promise<ReportDocument> {
  if (!supabase) throw new Error('إعدادات Supabase غير موجودة.');

  const range = resolvePeriod(filters);
  const { data, error } = await supabase.rpc('get_reporting_sales_v2', {
    p_branch_id: filters.branchId,
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_channel: filters.channel,
    p_cashier_id: filters.cashierId || null,
    p_payment_code: filters.paymentCode || null,
    p_search: filters.search?.trim() || null,
    p_limit: Math.min(Math.max(filters.limit ?? 50, 1), 200),
    p_offset: Math.max(filters.offset ?? 0, 0),
  });

  if (error) throw explainRpcError(error.message);
  if (!data || typeof data !== 'object') throw new Error('لم يُرجع تقرير المبيعات بيانات لهذه الفترة.');
  return data as ReportDocument;
}
