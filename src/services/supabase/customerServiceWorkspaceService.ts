import { supabase } from "@/integrations/supabase/client";

export type CustomerServiceSearchResult = {
  order_id: string;
  tracking_number: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  order_status: string;
  payment_status: string;
  payment_method: string | null;
  total: number;
  branch_id: string;
  branch_name: string | null;
  merchant_id: string | null;
  merchant_name: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerServiceTimelineEvent = {
  event_type: string;
  title: string;
  detail: string | null;
  status: string | null;
  occurred_at: string;
  metadata: Record<string, unknown>;
};

export type CustomerServiceCase = {
  order: {
    id: string;
    tracking_number: string | null;
    status: string;
    total: number;
    shipping_cost: number;
    shipping_address: string | null;
    payment_method: string | null;
    payment_status: string;
    return_status: string | null;
    notes: string | null;
    source_channel: string | null;
    items: Array<Record<string, unknown>>;
    created_at: string;
    updated_at: string;
    order_group_id: string | null;
  };
  customer: {
    id: string | null;
    name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    phone_verified: boolean;
    notes: string | null;
  };
  store: {
    branch_id: string;
    branch_name: string | null;
    branch_phone: string | null;
    merchant_id: string | null;
    merchant_name: string | null;
    merchant_phone: string | null;
  };
  delivery: {
    assignment: null | {
      id: string;
      state: string;
      assigned_at: string;
      accepted_at: string | null;
      picked_up_at: string | null;
      departed_at: string | null;
      arrived_at: string | null;
      delivered_at: string | null;
      failed_at: string | null;
      failure_reason: string | null;
      cash_collected: number;
      rider_wait_seconds: number | null;
    };
    driver: null | { id: string; name: string | null; phone: string | null };
    route: null | { id: string; status: string; distance_km: number | null; estimated_minutes: number | null; created_at: string; updated_at: string };
    stop: null | { status: string; eta: string | null; arrived_at: string | null; completed_at: string | null; address: string | null };
    proof: null | { delivered_at: string; verification_method: string; pin_verified: boolean; location_status: string; collected_amount: number; payment_reference: string | null };
  };
  issues: Array<{ id: string; issue_type: string; note: string | null; status: string; reported_at: string; resolved_at: string | null; resolution_note: string | null }>;
  tasks: Array<{ id: string; type: string; title: string; description: string | null; status: string; priority: string; amount: number | null; due_at: string | null; created_at: string }>;
  returns: Array<{ id: string; reason: string | null; status: string; admin_notes: string | null; created_at: string }>;
  refunds: Array<{ id: string; amount: number; status: string; payment_method: string; provider_reference: string | null; created_at: string }>;
  substitutions: Array<{ id: string; original_product_name: string; replacement_product_name: string; status: string; financial_state: string; price_delta_total: number; proposed_at: string }>;
  timeline: CustomerServiceTimelineEvent[];
  permissions: { can_manage_order: boolean; can_manage_customer: boolean; can_manage_delivery: boolean };
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

const messageFor = (message?: string) => {
  if (message?.includes("CUSTOMER_SERVICE_ACCESS_DENIED")) return "ليس لديك صلاحية عرض هذه الحالة.";
  if (message?.includes("CUSTOMER_SERVICE_QUERY_TOO_SHORT")) return "اكتب حرفين أو رقمين على الأقل للبحث.";
  if (message?.includes("CUSTOMER_SERVICE_ORDER_NOT_FOUND")) return "الطلب غير موجود.";
  return message || "تعذر تحميل مساحة خدمة العملاء.";
};

export async function searchCustomerServiceCases(query: string, branchId?: string | null) {
  const { data, error } = await rpc("get_customer_service_search_v1", {
    p_query: query.trim(),
    p_branch_id: branchId || null,
    p_limit: 30,
  });
  if (error) throw new Error(messageFor(error.message));
  const payload = data as { count?: number; results?: CustomerServiceSearchResult[] } | null;
  return { count: Number(payload?.count || 0), results: payload?.results || [] };
}

export async function fetchCustomerServiceCase(orderId: string) {
  const { data, error } = await rpc("get_customer_service_case_v1", { p_order_id: orderId });
  if (error) throw new Error(messageFor(error.message));
  if (!data || typeof data !== "object") throw new Error("لم تصل بيانات الحالة.");
  return data as CustomerServiceCase;
}
