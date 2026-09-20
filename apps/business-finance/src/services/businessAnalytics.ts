import { supabase } from '../lib/supabase';
import {
  explainRpcError,
  fetchOverview,
  resolvePeriod,
  type BusinessFilters,
  type OverviewData,
} from './businessFinance';
import type { ReportDocument } from './reportingDetails';

function client() {
  if (!supabase) throw new Error('إعدادات Supabase غير موجودة.');
  return supabase;
}

async function rpc(name: string, params: Record<string, unknown>): Promise<ReportDocument> {
  const { data, error } = await client().rpc(name, params);
  if (error) throw explainRpcError(error.message);
  if (!data || typeof data !== 'object') throw new Error('لم يُرجع التقرير بيانات لهذه الفترة.');
  return data as ReportDocument;
}

function rangePayload(filters: BusinessFilters) {
  const range = resolvePeriod(filters);
  return {
    p_branch_id: filters.branchId,
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
  };
}

export async function fetchPeakHoursReport(filters: BusinessFilters) {
  return rpc('get_reporting_peak_hours_v1', rangePayload(filters));
}

export async function fetchStaffCoverageReport(filters: BusinessFilters) {
  return rpc('get_reporting_staff_coverage_v1', rangePayload(filters));
}

export async function fetchWasteReport(filters: BusinessFilters) {
  return rpc('get_reporting_waste_v1', { ...rangePayload(filters), p_limit: 100 });
}

export type WorkforceCostsBundle = {
  costs: ReportDocument;
  payroll: ReportDocument | null;
  overview: ReportDocument | null;
  payrollError: string | null;
};

export async function fetchWorkforceCostsReport(
  filters: BusinessFilters,
  payrollMonth: number,
  payrollYear: number,
): Promise<WorkforceCostsBundle> {
  const base = rangePayload(filters);
  const [costsResult, payrollResult, overviewResult] = await Promise.allSettled([
    rpc('get_reporting_costs_v2', { ...base, p_limit: 100 }),
    rpc('get_hr_payroll_workspace_v2', {
      p_branch_id: filters.branchId,
      p_month: payrollMonth,
      p_year: payrollYear,
    }),
    rpc('get_reporting_overview_v2', base),
  ]);

  if (costsResult.status === 'rejected') throw costsResult.reason;

  return {
    costs: costsResult.value,
    payroll: payrollResult.status === 'fulfilled' ? payrollResult.value : null,
    overview: overviewResult.status === 'fulfilled' ? overviewResult.value : null,
    payrollError: payrollResult.status === 'rejected'
      ? (payrollResult.reason instanceof Error ? payrollResult.reason.message : 'لا يمكن عرض تفاصيل المرتبات بهذا الحساب.')
      : null,
  };
}

export type DecisionCenterBundle = {
  overview: OverviewData | null;
  peak: ReportDocument | null;
  coverage: ReportDocument | null;
  waste: ReportDocument | null;
  payroll: ReportDocument | null;
  errors: {
    overview: string | null;
    peak: string | null;
    coverage: string | null;
    waste: string | null;
    payroll: string | null;
  };
};

export async function fetchDecisionCenterReport(
  filters: BusinessFilters,
  payrollMonth: number,
  payrollYear: number,
): Promise<DecisionCenterBundle> {
  const [overviewResult, peakResult, coverageResult, wasteResult, payrollResult] = await Promise.allSettled([
    fetchOverview(filters),
    fetchPeakHoursReport(filters),
    fetchStaffCoverageReport(filters),
    fetchWasteReport(filters),
    rpc('get_hr_payroll_workspace_v2', {
      p_branch_id: filters.branchId,
      p_month: payrollMonth,
      p_year: payrollYear,
    }),
  ]);

  return {
    overview: overviewResult.status === 'fulfilled' ? overviewResult.value : null,
    peak: peakResult.status === 'fulfilled' ? peakResult.value : null,
    coverage: coverageResult.status === 'fulfilled' ? coverageResult.value : null,
    waste: wasteResult.status === 'fulfilled' ? wasteResult.value : null,
    payroll: payrollResult.status === 'fulfilled' ? payrollResult.value : null,
    errors: {
      overview: rejectedMessage(overviewResult),
      peak: rejectedMessage(peakResult),
      coverage: rejectedMessage(coverageResult),
      waste: rejectedMessage(wasteResult),
      payroll: rejectedMessage(payrollResult),
    },
  };
}

function rejectedMessage(result: PromiseSettledResult<unknown>): string | null {
  if (result.status === 'fulfilled') return null;
  return result.reason instanceof Error ? result.reason.message : 'تعذر تحميل هذا الجزء من التحليل.';
}
