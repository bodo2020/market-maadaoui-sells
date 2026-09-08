import { supabase } from "@/integrations/supabase/client";

const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const nn = (value: unknown): number | null => value == null || value === "" ? null : n(value);
const s = (value: unknown): string | null => value == null || value === "" ? null : String(value);

export interface ReportingCostsV2 {
  version: number;
  branch_id: string;
  from: string;
  to: string;
  permissions: { can_view_costs: boolean };
  summary: {
    expense_records: number; active_expense_records: number; voided_expense_records: number;
    active_expense_amount: number | null; voided_expense_amount: number | null;
    salary_paid_records: number; salary_paid_amount: number | null; salary_pending_records: number; salary_pending_amount: number | null;
    purchase_count: number; purchase_total: number | null; purchase_paid_total: number | null; purchase_outstanding_created: number | null;
    suppliers_with_branch_history: number; lifetime_supplier_outstanding: number | null; operating_cash_out_in_period: number | null;
  };
  expense_types: Array<{ type: string; records: number; amount: number | null }>;
  suppliers: Array<{ supplier_id: string; supplier_name: string; phone: string | null; period_purchase_count: number; period_purchase_total: number | null; period_paid_total: number | null; period_outstanding_created: number | null; lifetime_purchase_count: number; lifetime_purchase_total: number | null; lifetime_paid: number | null; lifetime_outstanding: number | null; last_purchase_at: string | null }>;
  expenses: Array<{ expense_id: string; type: string | null; description: string | null; date: string; status: string; payment_method: string | null; amount: number | null; receipt_url: string | null }>;
  purchases: Array<{ purchase_id: string; supplier_id: string | null; supplier_name: string; invoice_number: string | null; date: string; total: number | null; paid: number | null; outstanding: number | null; description: string | null }>;
  salaries: Array<{ salary_id: string; employee_id: string; employee_name: string; month: number; year: number; status: string; payment_date: string | null; amount: number | null; notes: string | null }>;
  data_quality: { supplier_master_branch_scoped?: boolean; supplier_balance_used?: boolean; supplier_balance_reason?: string; purchase_cost_source?: string; salary_cashflow_semantics?: string; expense_semantics?: string };
}

export async function fetchReportingCostsV2(branchId: string, from: Date, to: Date, limit = 100): Promise<ReportingCostsV2> {
  const { data, error } = await supabase.rpc("get_reporting_costs_v2" as never, { p_branch_id: branchId, p_from: from.toISOString(), p_to: to.toISOString(), p_limit: limit } as never);
  if (error) throw error;
  if (!data) throw new Error("REPORTING_COSTS_EMPTY");
  const raw = data as unknown as Record<string, any>;
  const x = raw.summary || {};
  return {
    version: n(raw.version) || 2, branch_id: String(raw.branch_id || branchId), from: String(raw.from || from.toISOString()), to: String(raw.to || to.toISOString()),
    permissions: { can_view_costs: Boolean(raw.permissions?.can_view_costs) },
    summary: {
      expense_records:n(x.expense_records), active_expense_records:n(x.active_expense_records), voided_expense_records:n(x.voided_expense_records), active_expense_amount:nn(x.active_expense_amount), voided_expense_amount:nn(x.voided_expense_amount),
      salary_paid_records:n(x.salary_paid_records), salary_paid_amount:nn(x.salary_paid_amount), salary_pending_records:n(x.salary_pending_records), salary_pending_amount:nn(x.salary_pending_amount),
      purchase_count:n(x.purchase_count), purchase_total:nn(x.purchase_total), purchase_paid_total:nn(x.purchase_paid_total), purchase_outstanding_created:nn(x.purchase_outstanding_created), suppliers_with_branch_history:n(x.suppliers_with_branch_history), lifetime_supplier_outstanding:nn(x.lifetime_supplier_outstanding), operating_cash_out_in_period:nn(x.operating_cash_out_in_period),
    },
    expense_types:(raw.expense_types||[]).map((r:Record<string,unknown>)=>({type:String(r.type||"غير مصنف"),records:n(r.records),amount:nn(r.amount)})),
    suppliers:(raw.suppliers||[]).map((r:Record<string,unknown>)=>({supplier_id:String(r.supplier_id||""),supplier_name:String(r.supplier_name||"مورد"),phone:s(r.phone),period_purchase_count:n(r.period_purchase_count),period_purchase_total:nn(r.period_purchase_total),period_paid_total:nn(r.period_paid_total),period_outstanding_created:nn(r.period_outstanding_created),lifetime_purchase_count:n(r.lifetime_purchase_count),lifetime_purchase_total:nn(r.lifetime_purchase_total),lifetime_paid:nn(r.lifetime_paid),lifetime_outstanding:nn(r.lifetime_outstanding),last_purchase_at:s(r.last_purchase_at)})),
    expenses:(raw.expenses||[]).map((r:Record<string,unknown>)=>({expense_id:String(r.expense_id||""),type:s(r.type),description:s(r.description),date:String(r.date||""),status:String(r.status||""),payment_method:s(r.payment_method),amount:nn(r.amount),receipt_url:s(r.receipt_url)})),
    purchases:(raw.purchases||[]).map((r:Record<string,unknown>)=>({purchase_id:String(r.purchase_id||""),supplier_id:s(r.supplier_id),supplier_name:String(r.supplier_name||"مورد غير محدد"),invoice_number:s(r.invoice_number),date:String(r.date||""),total:nn(r.total),paid:nn(r.paid),outstanding:nn(r.outstanding),description:s(r.description)})),
    salaries:(raw.salaries||[]).map((r:Record<string,unknown>)=>({salary_id:String(r.salary_id||""),employee_id:String(r.employee_id||""),employee_name:String(r.employee_name||"موظف"),month:n(r.month),year:n(r.year),status:String(r.status||""),payment_date:s(r.payment_date),amount:nn(r.amount),notes:s(r.notes)})),
    data_quality: raw.data_quality || {},
  };
}
