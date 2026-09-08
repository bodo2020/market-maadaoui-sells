import { supabase } from "@/integrations/supabase/client";

const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const s = (value: unknown): string | null => value == null || value === "" ? null : String(value);

export interface ReportingCustomersSummaryV2 {
  known_customers_in_period: number;
  realized_customers_in_period: number;
  new_realized_customers: number;
  returning_realized_customers: number;
  pos_transactions: number;
  pos_linked_transactions: number;
  pos_anonymous_transactions: number;
  pos_value: number;
  pos_linked_value: number;
  pos_anonymous_value: number;
  pos_identity_coverage_percent: number;
  online_orders: number;
  online_linked_orders: number;
  online_anonymous_orders: number;
  online_gross_value: number;
  online_linked_gross_value: number;
  online_identity_coverage_percent: number;
  online_delivered_value: number;
  online_linked_delivered_value: number;
  approved_returns: number;
  linked_returns: number;
  approved_return_value: number;
  linked_return_value: number;
  known_realized_value: number;
  anonymous_realized_value: number;
  overall_identity_coverage_percent: number;
}

export interface ReportingCustomerV2 {
  customer_id: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  management_status: string | null;
  customer_created_at: string;
  pos_invoices: number;
  pos_sales: number;
  online_orders: number;
  delivered_online_orders: number;
  online_gross_value: number;
  online_delivered_value: number;
  open_online_value: number;
  returns: number;
  return_value: number;
  period_realized_value: number;
  first_purchase_at: string | null;
  last_purchase_at: string | null;
  last_activity_at: string | null;
  customer_stage: "prospect" | "new" | "returning" | "engaged" | string;
  lifetime_realized_value: number;
  membership_number: string | null;
  points_balance: number;
  lifetime_points_earned: number;
  lifetime_points_redeemed: number;
}

export interface ReportingCustomersV2 {
  version: number;
  branch_id: string;
  from: string;
  to: string;
  summary: ReportingCustomersSummaryV2;
  loyalty: { accounts: number; active_accounts: number; points_balance: number; lifetime_points_earned: number; lifetime_points_redeemed: number };
  crm: { created_in_period: number; completed_in_period: number; pending_now: number; overdue_now: number };
  customers: ReportingCustomerV2[];
  data_quality: {
    identity_rule?: string;
    first_linked_activity_at?: string | null;
    pos_customer_linking_available?: boolean;
    customer_master_branch_scoped?: boolean;
    customer_master_note?: string;
    lifetime_value_scope?: string;
    anonymous_commerce_included_in_customer_rows?: boolean;
  };
}

export async function fetchReportingCustomersV2(branchId: string, from: Date, to: Date, limit = 100): Promise<ReportingCustomersV2> {
  const { data, error } = await supabase.rpc("get_reporting_customers_v2" as never, {
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_limit: limit,
  } as never);
  if (error) throw error;
  if (!data) throw new Error("REPORTING_CUSTOMERS_EMPTY");

  const raw = data as unknown as Record<string, any>;
  const x = raw.summary || {};
  const loyalty = raw.loyalty || {};
  const crm = raw.crm || {};
  const dq = raw.data_quality || {};
  return {
    version: n(raw.version) || 2,
    branch_id: String(raw.branch_id || branchId),
    from: String(raw.from || from.toISOString()),
    to: String(raw.to || to.toISOString()),
    summary: {
      known_customers_in_period: n(x.known_customers_in_period), realized_customers_in_period: n(x.realized_customers_in_period),
      new_realized_customers: n(x.new_realized_customers), returning_realized_customers: n(x.returning_realized_customers),
      pos_transactions: n(x.pos_transactions), pos_linked_transactions: n(x.pos_linked_transactions), pos_anonymous_transactions: n(x.pos_anonymous_transactions),
      pos_value: n(x.pos_value), pos_linked_value: n(x.pos_linked_value), pos_anonymous_value: n(x.pos_anonymous_value), pos_identity_coverage_percent: n(x.pos_identity_coverage_percent),
      online_orders: n(x.online_orders), online_linked_orders: n(x.online_linked_orders), online_anonymous_orders: n(x.online_anonymous_orders),
      online_gross_value: n(x.online_gross_value), online_linked_gross_value: n(x.online_linked_gross_value), online_identity_coverage_percent: n(x.online_identity_coverage_percent),
      online_delivered_value: n(x.online_delivered_value), online_linked_delivered_value: n(x.online_linked_delivered_value),
      approved_returns: n(x.approved_returns), linked_returns: n(x.linked_returns), approved_return_value: n(x.approved_return_value), linked_return_value: n(x.linked_return_value),
      known_realized_value: n(x.known_realized_value), anonymous_realized_value: n(x.anonymous_realized_value), overall_identity_coverage_percent: n(x.overall_identity_coverage_percent),
    },
    loyalty: { accounts: n(loyalty.accounts), active_accounts: n(loyalty.active_accounts), points_balance: n(loyalty.points_balance), lifetime_points_earned: n(loyalty.lifetime_points_earned), lifetime_points_redeemed: n(loyalty.lifetime_points_redeemed) },
    crm: { created_in_period: n(crm.created_in_period), completed_in_period: n(crm.completed_in_period), pending_now: n(crm.pending_now), overdue_now: n(crm.overdue_now) },
    customers: (raw.customers || []).map((row: Record<string, unknown>) => ({
      customer_id: String(row.customer_id || ""), customer_name: String(row.customer_name || "عميل"), phone: s(row.phone), email: s(row.email), management_status: s(row.management_status), customer_created_at: String(row.customer_created_at || ""),
      pos_invoices: n(row.pos_invoices), pos_sales: n(row.pos_sales), online_orders: n(row.online_orders), delivered_online_orders: n(row.delivered_online_orders), online_gross_value: n(row.online_gross_value), online_delivered_value: n(row.online_delivered_value), open_online_value: n(row.open_online_value),
      returns: n(row.returns), return_value: n(row.return_value), period_realized_value: n(row.period_realized_value), first_purchase_at: s(row.first_purchase_at), last_purchase_at: s(row.last_purchase_at), last_activity_at: s(row.last_activity_at), customer_stage: String(row.customer_stage || "engaged"), lifetime_realized_value: n(row.lifetime_realized_value),
      membership_number: s(row.membership_number), points_balance: n(row.points_balance), lifetime_points_earned: n(row.lifetime_points_earned), lifetime_points_redeemed: n(row.lifetime_points_redeemed),
    })),
    data_quality: {
      identity_rule: s(dq.identity_rule) || undefined,
      first_linked_activity_at: s(dq.first_linked_activity_at),
      pos_customer_linking_available: dq.pos_customer_linking_available == null ? undefined : Boolean(dq.pos_customer_linking_available),
      customer_master_branch_scoped: dq.customer_master_branch_scoped == null ? undefined : Boolean(dq.customer_master_branch_scoped),
      customer_master_note: s(dq.customer_master_note) || undefined,
      lifetime_value_scope: s(dq.lifetime_value_scope) || undefined,
      anonymous_commerce_included_in_customer_rows: dq.anonymous_commerce_included_in_customer_rows == null ? undefined : Boolean(dq.anonymous_commerce_included_in_customer_rows),
    },
  };
}
