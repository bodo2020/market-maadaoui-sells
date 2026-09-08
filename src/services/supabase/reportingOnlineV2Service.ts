import { supabase } from "@/integrations/supabase/client";

const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullableString = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

const nullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export interface ReportingOnlineSummaryV2 {
  order_count: number;
  active_orders: number;
  pending_orders: number;
  delivered_orders: number;
  cancelled_orders: number;
  paid_orders: number;
  pending_payment_orders: number;
  failed_payment_orders: number;
  refunded_orders: number;
  distinct_customers: number;
  linked_customer_orders: number;
  gross_order_value: number;
  active_order_value: number;
  delivered_order_value: number;
  paid_delivered_value: number;
  cancelled_order_value: number;
  shipping_charged: number;
  delivered_shipping_charged: number;
  average_order_value: number;
  average_delivered_order_value: number;
  loyalty_voucher_amount: number;
  loyalty_points_earned: number;
  item_units: number;
  delivery_rate_percent: number;
  cancellation_rate_percent: number;
}

export interface ReportingOnlineStatusV2 {
  status: string;
  orders: number;
  order_value: number;
  shipping_charged: number;
}

export interface ReportingOnlinePaymentStatusV2 {
  payment_status: string;
  orders: number;
  order_value: number;
}

export interface ReportingOnlinePaymentMethodV2 {
  payment_method: string;
  orders: number;
  order_value: number;
  delivered_orders: number;
  delivered_value: number;
}

export interface ReportingOnlineDailyV2 {
  day: string;
  orders: number;
  order_value: number;
  delivered_orders: number;
  cancelled_orders: number;
  shipping_charged: number;
}

export interface ReportingOnlineOrderV2 {
  order_id: string;
  created_at: string;
  updated_at: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  total: number;
  shipping_cost: number;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  shipping_address: string | null;
  distance_km: number | null;
  delivery_person: string | null;
  tracking_number: string | null;
  source_channel: string | null;
  item_count: number;
  loyalty_voucher_amount: number;
  loyalty_points_earned: number;
}

export interface ReportingOnlineV2 {
  version: number;
  branch_id: string;
  from: string;
  to: string;
  summary: ReportingOnlineSummaryV2;
  statuses: ReportingOnlineStatusV2[];
  payment_statuses: ReportingOnlinePaymentStatusV2[];
  payment_methods: ReportingOnlinePaymentMethodV2[];
  daily: ReportingOnlineDailyV2[];
  orders: ReportingOnlineOrderV2[];
  data_quality: {
    source?: string;
    first_order_at?: string | null;
    profit_available?: boolean;
    profit_reason?: string;
    delivery_duration_available?: boolean;
    delivery_duration_reason?: string;
    status_semantics?: string;
  };
}

interface RawOnlineV2 {
  version?: unknown;
  branch_id?: unknown;
  from?: unknown;
  to?: unknown;
  summary?: Record<string, unknown>;
  statuses?: Array<Record<string, unknown>>;
  payment_statuses?: Array<Record<string, unknown>>;
  payment_methods?: Array<Record<string, unknown>>;
  daily?: Array<Record<string, unknown>>;
  orders?: Array<Record<string, unknown>>;
  data_quality?: Record<string, unknown>;
}

export async function fetchReportingOnlineV2(
  branchId: string,
  from: Date,
  to: Date,
  limit = 100,
): Promise<ReportingOnlineV2> {
  const { data, error } = await supabase.rpc("get_reporting_online_v2" as never, {
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_limit: limit,
  } as never);

  if (error) throw error;
  if (!data) throw new Error("REPORTING_ONLINE_EMPTY");

  const raw = data as unknown as RawOnlineV2;
  const s = raw.summary || {};
  const dq = raw.data_quality || {};

  return {
    version: n(raw.version) || 2,
    branch_id: String(raw.branch_id || branchId),
    from: String(raw.from || from.toISOString()),
    to: String(raw.to || to.toISOString()),
    summary: {
      order_count: n(s.order_count), active_orders: n(s.active_orders), pending_orders: n(s.pending_orders),
      delivered_orders: n(s.delivered_orders), cancelled_orders: n(s.cancelled_orders), paid_orders: n(s.paid_orders),
      pending_payment_orders: n(s.pending_payment_orders), failed_payment_orders: n(s.failed_payment_orders), refunded_orders: n(s.refunded_orders),
      distinct_customers: n(s.distinct_customers), linked_customer_orders: n(s.linked_customer_orders), gross_order_value: n(s.gross_order_value),
      active_order_value: n(s.active_order_value), delivered_order_value: n(s.delivered_order_value), paid_delivered_value: n(s.paid_delivered_value),
      cancelled_order_value: n(s.cancelled_order_value), shipping_charged: n(s.shipping_charged), delivered_shipping_charged: n(s.delivered_shipping_charged),
      average_order_value: n(s.average_order_value), average_delivered_order_value: n(s.average_delivered_order_value), loyalty_voucher_amount: n(s.loyalty_voucher_amount),
      loyalty_points_earned: n(s.loyalty_points_earned), item_units: n(s.item_units), delivery_rate_percent: n(s.delivery_rate_percent), cancellation_rate_percent: n(s.cancellation_rate_percent),
    },
    statuses: (raw.statuses || []).map((row) => ({ status: String(row.status || "unknown"), orders: n(row.orders), order_value: n(row.order_value), shipping_charged: n(row.shipping_charged) })),
    payment_statuses: (raw.payment_statuses || []).map((row) => ({ payment_status: String(row.payment_status || "unknown"), orders: n(row.orders), order_value: n(row.order_value) })),
    payment_methods: (raw.payment_methods || []).map((row) => ({ payment_method: String(row.payment_method || "غير محدد"), orders: n(row.orders), order_value: n(row.order_value), delivered_orders: n(row.delivered_orders), delivered_value: n(row.delivered_value) })),
    daily: (raw.daily || []).map((row) => ({ day: String(row.day || ""), orders: n(row.orders), order_value: n(row.order_value), delivered_orders: n(row.delivered_orders), cancelled_orders: n(row.cancelled_orders), shipping_charged: n(row.shipping_charged) })),
    orders: (raw.orders || []).map((row) => ({
      order_id: String(row.order_id || ""), created_at: String(row.created_at || ""), updated_at: String(row.updated_at || ""), status: String(row.status || "unknown"),
      payment_status: String(row.payment_status || "unknown"), payment_method: nullableString(row.payment_method), total: n(row.total), shipping_cost: n(row.shipping_cost),
      customer_id: nullableString(row.customer_id), customer_name: String(row.customer_name || "عميل غير مسجل"), customer_phone: nullableString(row.customer_phone),
      shipping_address: nullableString(row.shipping_address), distance_km: nullableNumber(row.distance_km), delivery_person: nullableString(row.delivery_person),
      tracking_number: nullableString(row.tracking_number), source_channel: nullableString(row.source_channel), item_count: n(row.item_count),
      loyalty_voucher_amount: n(row.loyalty_voucher_amount), loyalty_points_earned: n(row.loyalty_points_earned),
    })),
    data_quality: {
      source: nullableString(dq.source) || undefined,
      first_order_at: nullableString(dq.first_order_at),
      profit_available: dq.profit_available == null ? undefined : Boolean(dq.profit_available),
      profit_reason: nullableString(dq.profit_reason) || undefined,
      delivery_duration_available: dq.delivery_duration_available == null ? undefined : Boolean(dq.delivery_duration_available),
      delivery_duration_reason: nullableString(dq.delivery_duration_reason) || undefined,
      status_semantics: nullableString(dq.status_semantics) || undefined,
    },
  };
}
