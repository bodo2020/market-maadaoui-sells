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

type CairoParts = { year: number; month: number; day: number };

const cairoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function makeCairoCustomRange(fromDate: string, toDate: string) {
  if (!fromDate || !toDate) throw new Error('اختر تاريخ البداية والنهاية.');
  const fromParts = parseCivilDate(fromDate);
  const toParts = parseCivilDate(toDate);
  const from = cairoMidnight(fromParts);
  const to = cairoMidnight(shiftCivilDate(toParts, 1));
  if (to <= from) throw new Error('تاريخ النهاية يجب ألا يسبق تاريخ البداية.');
  return { from: from.toISOString(), to: to.toISOString() };
}

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

export async function fetchAllAdvancedSalesRows(filters: SalesReportFilters): Promise<Record<string, unknown>[]> {
  const pageSize = 200;
  let offset = 0;
  const allRows: Record<string, unknown>[] = [];

  while (true) {
    const report = await fetchAdvancedSalesReport({ ...filters, limit: pageSize, offset });
    const pageRows = Array.isArray(report.rows)
      ? report.rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)))
      : [];
    allRows.push(...pageRows);

    const pagination = report.pagination && typeof report.pagination === 'object' && !Array.isArray(report.pagination)
      ? report.pagination as Record<string, unknown>
      : {};
    if (!Boolean(pagination.has_more) || pageRows.length === 0) break;
    offset += pageSize;
  }

  return allRows;
}

function parseCivilDate(value: string): CairoParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('صيغة التاريخ غير صحيحة.');
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function partsAt(date: Date) {
  return Object.fromEntries(cairoFormatter.formatToParts(date).map((part) => [part.type, part.value]));
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

function cairoMidnight(parts: CairoParts) {
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
