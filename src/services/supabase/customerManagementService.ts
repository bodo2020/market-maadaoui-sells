import { supabase } from "@/integrations/supabase/client";

export type CustomerSegment =
  | "vip"
  | "loyal"
  | "promising"
  | "new"
  | "at_risk"
  | "lost"
  | "inactive"
  | "active";

export type CustomerManagementRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  phone_verified: boolean | null;
  created_at: string;
  membership_number: string | null;
  barcode_token: string | null;
  points_balance: number;
  lifetime_points_earned: number;
  lifetime_points_redeemed: number;
  loyalty_status: string;
  store_sales_count: number;
  online_orders_count: number;
  purchase_count: number;
  gross_sales: number;
  loyalty_discount: number;
  net_spent: number;
  store_profit: number;
  last_purchase_at: string | null;
  avg_order_value: number;
  preferred_channel: "store" | "online" | "mixed" | "none";
  outstanding_coupon_value: number;
  active_coupon_count: number;
  segment: CustomerSegment;
};

export type CustomerManagementSummary = {
  total_customers: number;
  active_30d: number;
  new_30d: number;
  at_risk: number;
  vip: number;
  total_net_sales: number;
  average_customer_value: number;
  points_outstanding: number;
  coupons_outstanding_value: number;
};

export type CustomerManagementCatalog = {
  rows: CustomerManagementRow[];
  total: number;
  limit: number;
  offset: number;
  summary: CustomerManagementSummary;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

export async function fetchCustomerManagementCatalog(params: {
  branchId?: string | null;
  search?: string;
  segment?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<CustomerManagementCatalog> {
  const { data, error } = await rpc("get_customer_management_catalog", {
    p_branch_id: params.branchId || null,
    p_search: params.search?.trim() || null,
    p_segment: params.segment && params.segment !== "all" ? params.segment : null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });

  if (error) {
    if (error.message?.includes("CUSTOMER_ACCESS_DENIED")) {
      throw new Error("ليس لديك صلاحية عرض قسم العملاء على الفرع الحالي.");
    }
    throw new Error(error.message || "تعذر تحميل بيانات العملاء.");
  }

  const payload = (data && typeof data === "object" ? data : {}) as Partial<CustomerManagementCatalog>;
  return {
    rows: Array.isArray(payload.rows) ? payload.rows : [],
    total: Number(payload.total || 0),
    limit: Number(payload.limit || params.limit || 50),
    offset: Number(payload.offset || params.offset || 0),
    summary: {
      total_customers: Number(payload.summary?.total_customers || 0),
      active_30d: Number(payload.summary?.active_30d || 0),
      new_30d: Number(payload.summary?.new_30d || 0),
      at_risk: Number(payload.summary?.at_risk || 0),
      vip: Number(payload.summary?.vip || 0),
      total_net_sales: Number(payload.summary?.total_net_sales || 0),
      average_customer_value: Number(payload.summary?.average_customer_value || 0),
      points_outstanding: Number(payload.summary?.points_outstanding || 0),
      coupons_outstanding_value: Number(payload.summary?.coupons_outstanding_value || 0),
    },
  };
}
