import { supabase } from "@/integrations/supabase/client";

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

export type OrderSubstitutionApprovalDetail = {
  id: string;
  task_id: string | null;
  order_id: string;
  tracking_number: string | null;
  item_id: string;
  original_product_name: string;
  replacement_product_name: string;
  replacement_product_id: string;
  replacement_variant_id: string | null;
  replacement_barcode: string | null;
  replacement_image_url: string | null;
  quantity: number;
  original_unit_price: number;
  replacement_unit_price: number;
  price_delta_total: number;
  financial_state: string;
  status: string;
  proposed_by: string;
  proposed_by_name: string | null;
  proposed_at: string;
  due_at: string | null;
  task_status: string | null;
};

export type OrderSubstitutionFinancialAdjustment = {
  id: string;
  substitution_id: string;
  order_id: string;
  branch_id: string;
  direction: "charge" | "refund" | "neutral";
  signed_amount: number;
  amount: number;
  payment_method: string | null;
  payment_status: string | null;
  order_total_before: number;
  target_order_total: number;
  order_total_after: number;
  settlement_state: string;
  operations_task_id: string | null;
  provider_reference: string | null;
  note: string | null;
  settled_by: string | null;
  settled_at: string | null;
  created_at: string;
  original_product_name: string;
  replacement_product_name: string;
};

function mapError(message?: string) {
  const value = message || "";
  if (value.includes("SUBSTITUTION_APPROVAL_DENIED")) return new Error("ليس لديك صلاحية اعتماد بدائل الطلبات في هذا الفرع.");
  if (value.includes("SUBSTITUTION_DECISION_NOTE_REQUIRED")) return new Error("اكتب ملاحظة واضحة للقرار.");
  if (value.includes("SUBSTITUTE_INSUFFICIENT_STOCK")) return new Error("مخزون المنتج البديل لم يعد كافيًا. اختر بديلًا آخر.");
  if (value.includes("PICKING_NOT_ACTIVE")) return new Error("الطلب لم يعد في مرحلة التجهيز النشطة.");
  if (value.includes("SUBSTITUTION_FINANCE_ACCESS_DENIED")) return new Error("ليس لديك صلاحية تسوية فرق الدفع الإلكتروني.");
  if (value.includes("SUBSTITUTION_PROVIDER_REFERENCE_REQUIRED")) return new Error("اكتب مرجع عملية التحصيل أو الرد من مزود الدفع.");
  if (value.includes("SUBSTITUTION_FINANCE_NOTE_REQUIRED")) return new Error("اكتب ملاحظة التسوية المالية.");
  if (value.includes("SUBSTITUTION_FINANCE_NOT_PENDING")) return new Error("هذه التسوية لم تعد معلقة.");
  return new Error(message || "تعذر تنفيذ العملية.");
}

export async function fetchOrderSubstitutionApproval(branchId: string, substitutionId: string) {
  const { data, error } = await rpc("list_order_substitution_approvals_v1", {
    p_branch_id: branchId,
    p_limit: 150,
  });
  if (error) throw mapError(error.message);
  const response = (data || {}) as { items?: OrderSubstitutionApprovalDetail[] };
  const item = Array.isArray(response.items) ? response.items.find(row => row.id === substitutionId) : undefined;
  if (!item) throw new Error("لم تعد موافقة البديل معلقة أو لم يعد الطلب متاحًا للمراجعة.");
  return item;
}

export async function decideOrderSubstitution(substitutionId: string, decision: "approve" | "reject", note: string) {
  const { data, error } = await rpc("decide_order_fulfillment_substitution_v1", {
    p_substitution_id: substitutionId,
    p_decision: decision,
    p_note: note,
  });
  if (error) throw mapError(error.message);
  return data as { ok: boolean; id: string; status: string; price_delta_total?: number; financial_state?: string };
}

export async function fetchOrderSubstitutionFinancialAdjustment(adjustmentId: string) {
  const { data, error } = await rpc("get_order_substitution_financial_adjustment_v1", {
    p_adjustment_id: adjustmentId,
  });
  if (error) throw mapError(error.message);
  return data as OrderSubstitutionFinancialAdjustment;
}

export async function settleOrderSubstitutionFinancialAdjustment(adjustmentId: string, providerReference: string, note: string) {
  const { data, error } = await rpc("settle_order_substitution_financial_adjustment_v1", {
    p_adjustment_id: adjustmentId,
    p_provider_reference: providerReference,
    p_note: note,
  });
  if (error) throw mapError(error.message);
  return data as {
    ok: boolean;
    id: string;
    settlement_state: string;
    signed_amount: number;
    order_total_after: number;
    payment_ledger_id: string;
    provider_reference: string;
  };
}
