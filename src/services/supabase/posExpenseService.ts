import { supabase } from "@/integrations/supabase/client";
import type { LocalPosDevice } from "@/services/supabase/posDeviceService";

export type PosExpenseCategory = {
  id: string;
  code: string;
  name_ar: string;
  group_name_ar: string;
  accounting_treatment: "opex" | "capex" | "prepaid" | "employee_advance";
  approval_required: boolean;
  auto_approve_limit: number;
  receipt_required_above: number;
};

export type PosExpenseDocument = {
  id: string;
  document_number: string;
  category_id: string;
  category_name: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  description: string;
  beneficiary_name: string | null;
  status: "pending_approval" | "approved" | "partially_paid" | "paid" | "rejected";
  receipt_url: string | null;
  created_at: string;
  approved_at: string | null;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

function message(value?: string) {
  const code = String(value || "").toUpperCase();
  if (code.includes("SHIFT_NOT_OPEN")) return "لازم تكون فيه وردية مفتوحة قبل طلب أو صرف مصروف.";
  if (code.includes("EXPENSE_REQUEST_DENIED")) return "حسابك غير مسموح له بطلب مصروف من الوردية.";
  if (code.includes("EXPENSE_RECEIPT_REQUIRED")) return "البند المختار يتطلب إثبات/إيصال قبل إرسال الطلب.";
  if (code.includes("EXPENSE_NOT_PAYABLE")) return "المصروف لم يُعتمد بعد أو لم يعد جاهزًا للصرف.";
  if (code.includes("POS_EXPENSE_NOT_OWNED")) return "يمكنك صرف طلبات المصروف التي أنشأتها في ورديتك الحالية فقط.";
  if (code.includes("INSUFFICIENT_DRAWER_CASH")) return "النقد المتوقع في الدرج لا يكفي لصرف المصروف.";
  if (code.includes("EXPENSE_ALREADY_PAID")) return "المصروف تم صرفه بالفعل.";
  if (code.includes("EMPLOYEE_ADVANCE_USE_DEDICATED_FLOW")) return "العهد والسلف لا تُصرف من مسار مصروفات الكاشير العادي.";
  return value || "تعذر تنفيذ عملية المصروف.";
}

export async function getPosExpenseCategories(device: LocalPosDevice): Promise<PosExpenseCategory[]> {
  const { data, error } = await rpc("get_pos_expense_categories_v2", {
    p_device_id: device.device_id,
    p_device_token: device.device_token,
  });
  if (error || !data || typeof data !== "object") throw new Error(message(error?.message));
  const items = (data as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: String(row.id || ""),
      code: String(row.code || ""),
      name_ar: String(row.name_ar || "بند مصروف"),
      group_name_ar: String(row.group_name_ar || "مصروفات"),
      accounting_treatment: String(row.accounting_treatment || "opex") as PosExpenseCategory["accounting_treatment"],
      approval_required: row.approval_required === true,
      auto_approve_limit: Number(row.auto_approve_limit || 0),
      receipt_required_above: Number(row.receipt_required_above || 0),
    };
  });
}

export async function getMyPosExpenses(device: LocalPosDevice): Promise<{ shift_id: string | null; items: PosExpenseDocument[] }> {
  const { data, error } = await rpc("get_my_pos_expenses_v2", {
    p_device_id: device.device_id,
    p_device_token: device.device_token,
  });
  if (error || !data || typeof data !== "object") throw new Error(message(error?.message));
  const row = data as Record<string, unknown>;
  const items = Array.isArray(row.items) ? row.items : [];
  return {
    shift_id: row.shift_id ? String(row.shift_id) : null,
    items: items.map((item) => {
      const value = item as Record<string, unknown>;
      return {
        id: String(value.id || ""),
        document_number: String(value.document_number || ""),
        category_id: String(value.category_id || ""),
        category_name: String(value.category_name || "بند مصروف"),
        amount: Number(value.amount || 0),
        paid_amount: Number(value.paid_amount || 0),
        remaining_amount: Number(value.remaining_amount || 0),
        description: String(value.description || ""),
        beneficiary_name: value.beneficiary_name ? String(value.beneficiary_name) : null,
        status: String(value.status || "pending_approval") as PosExpenseDocument["status"],
        receipt_url: value.receipt_url ? String(value.receipt_url) : null,
        created_at: String(value.created_at || ""),
        approved_at: value.approved_at ? String(value.approved_at) : null,
      };
    }),
  };
}

export async function requestPosExpense(device: LocalPosDevice, input: {
  categoryId: string;
  amount: number;
  description: string;
  beneficiaryName?: string;
  receiptUrl?: string;
}) {
  const { data, error } = await rpc("request_pos_expense_v2", {
    p_request_id: crypto.randomUUID(),
    p_device_id: device.device_id,
    p_device_token: device.device_token,
    p_category_id: input.categoryId,
    p_amount: input.amount,
    p_description: input.description.trim(),
    p_beneficiary_name: input.beneficiaryName?.trim() || null,
    p_receipt_url: input.receiptUrl?.trim() || null,
  });
  if (error || !data) throw new Error(message(error?.message));
  return data as Record<string, unknown>;
}

export async function payMyPosExpense(device: LocalPosDevice, documentId: string) {
  const { data, error } = await rpc("pay_my_pos_expense_v2", {
    p_request_id: crypto.randomUUID(),
    p_document_id: documentId,
    p_device_id: device.device_id,
    p_device_token: device.device_token,
  });
  if (error || !data) throw new Error(message(error?.message));
  return data as Record<string, unknown>;
}
