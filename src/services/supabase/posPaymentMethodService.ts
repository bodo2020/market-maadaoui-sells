import { supabase } from "@/integrations/supabase/client";

export type POSPaymentMethodType = "cash" | "card" | "digital_wallet" | "bank_transfer" | "other";
export type POSPaymentFeeType = "none" | "percent" | "fixed";
export type POSPaymentFeeBearer = "customer" | "business";

export type POSPaymentMethod = {
  id: string;
  branch_id: string;
  code: string;
  name: string;
  method_type: POSPaymentMethodType;
  active: boolean;
  sort_order: number;
  fee_type: POSPaymentFeeType;
  fee_value: number;
  fee_bearer: POSPaymentFeeBearer;
  require_reference: boolean;
  settlement_account_id?: string | null;
  metadata?: Record<string, unknown>;
  updated_at?: string;
};

export type POSPaymentMethodDraft = Omit<POSPaymentMethod, "id" | "branch_id"> & {
  id?: string;
};

export type POSPaymentMethodDeleteResult = {
  id: string;
  code: string;
  name: string;
  action: "deleted" | "archived";
  used_in_history: boolean;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

function paymentMethodError(message?: string) {
  const value = message || "";
  if (value.includes("PAYMENT_METHOD_ACCESS_DENIED")) return new Error("ليس لديك صلاحية عرض وسائل الدفع في هذا الفرع.");
  if (value.includes("PAYMENT_METHOD_MANAGE_DENIED")) return new Error("ليس لديك صلاحية إدارة وسائل الدفع في هذا الفرع.");
  if (value.includes("PAYMENT_METHOD_NOT_FOUND")) return new Error("وسيلة الدفع غير موجودة أو لا تخص الفرع الحالي.");
  if (value.includes("PAYMENT_METHOD_STALE")) return new Error("إعدادات وسيلة الدفع اتغيرت بعد ما فتحت نافذة التعديل. حدّث القائمة وافتح الوسيلة من جديد قبل الحفظ حتى لا تستبدل إعدادات أحدث.");
  if (value.includes("PAYMENT_METHOD_CODE_EXISTS")) return new Error("كود وسيلة الدفع مستخدم بالفعل في هذا الفرع.");
  if (value.includes("CASH_PAYMENT_METHOD_PROTECTED")) return new Error("وسيلة الدفع النقدي أساسية ولا يمكن حذفها. يمكنك إيقافها من الإعدادات عند الحاجة.");
  if (value.includes("INVALID_PAYMENT_METHOD_CODE")) return new Error("كود وسيلة الدفع يجب أن يكون حروفًا إنجليزية أو أرقامًا وشرطة سفلية فقط.");
  if (value.includes("INVALID_PAYMENT_METHOD_NAME")) return new Error("اكتب اسمًا واضحًا لوسيلة الدفع.");
  if (value.includes("INVALID_PAYMENT_METHOD_TYPE")) return new Error("نوع وسيلة الدفع غير صحيح.");
  if (value.includes("INVALID_PAYMENT_FEE")) return new Error("راجع نوع وقيمة رسوم وسيلة الدفع.");
  return new Error(message || "تعذر تنفيذ العملية على وسائل الدفع.");
}

function normalize(row: POSPaymentMethod): POSPaymentMethod {
  return {
    ...row,
    active: Boolean(row.active),
    sort_order: Number(row.sort_order || 0),
    fee_value: Number(row.fee_value || 0),
    require_reference: Boolean(row.require_reference),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
}

export async function fetchPOSPaymentMethods(branchId: string): Promise<POSPaymentMethod[]> {
  const { data, error } = await rpc("get_pos_payment_methods", { p_branch_id: branchId });
  if (error) throw paymentMethodError(error.message);
  return ((data || []) as POSPaymentMethod[]).map(normalize);
}

export async function savePOSPaymentMethod(branchId: string, method: POSPaymentMethodDraft): Promise<POSPaymentMethod> {
  const { data, error } = await rpc("save_pos_payment_method", {
    p_branch_id: branchId,
    p_method: method,
  });
  if (error) throw paymentMethodError(error.message);
  return normalize(data as POSPaymentMethod);
}

export async function deletePOSPaymentMethod(branchId: string, methodId: string): Promise<POSPaymentMethodDeleteResult> {
  const { data, error } = await rpc("delete_pos_payment_method", {
    p_branch_id: branchId,
    p_method_id: methodId,
  });
  if (error) throw paymentMethodError(error.message);
  return data as POSPaymentMethodDeleteResult;
}

export function calculatePOSPaymentFee(method: POSPaymentMethod | null | undefined, baseAmount: number) {
  const base = Math.max(0, Number(baseAmount || 0));
  if (!method || method.fee_type === "none" || Number(method.fee_value || 0) <= 0) {
    return { fee: 0, customerFee: 0, merchantFee: 0, amountCharged: base, estimatedNetSettlement: base };
  }
  const rawFee = method.fee_type === "percent"
    ? base * Number(method.fee_value || 0) / 100
    : Number(method.fee_value || 0);
  const fee = Number(Math.max(0, rawFee).toFixed(2));
  const customerFee = method.fee_bearer === "customer" ? fee : 0;
  const merchantFee = method.fee_bearer === "business" ? fee : 0;
  const amountCharged = Number((base + customerFee).toFixed(2));
  return {
    fee,
    customerFee,
    merchantFee,
    amountCharged,
    estimatedNetSettlement: Number((amountCharged - fee).toFixed(2)),
  };
}

export function paymentMethodTypeLabel(type: POSPaymentMethodType) {
  if (type === "cash") return "نقدي";
  if (type === "card") return "بطاقة بنكية";
  if (type === "digital_wallet") return "محفظة رقمية";
  if (type === "bank_transfer") return "تحويل بنكي";
  return "وسيلة أخرى";
}
