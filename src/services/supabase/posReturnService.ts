import { supabase } from "@/integrations/supabase/client";
import { getLocalPosDevice } from "@/services/supabase/posDeviceService";
import { invalidatePOSCatalogCache } from "@/services/supabase/posCatalogService";
import { invalidatePosPreflightCache } from "@/services/supabase/posPreflightService";

export type PosReturnPreviewLine = {
  line_index: number;
  product_id: string;
  product_name: string;
  sold_quantity: number;
  returned_quantity: number;
  available_quantity: number;
  line_total: number;
  returned_amount: number;
  remaining_amount: number;
  unit_price: number;
  purchase_price: number;
  is_bulk: boolean;
  weight_based: boolean;
  bulk_quantity: number | null;
};

export type PosReturnPreview = {
  sale_id: string;
  invoice_number: string;
  date: string;
  branch_id: string;
  payment_method: "cash" | "card" | "mixed";
  sale_total: number;
  cash_amount: number;
  card_amount: number;
  returned_total: number;
  returned_cash: number;
  returned_card: number;
  remaining_total: number;
  customer_name: string | null;
  lines: PosReturnPreviewLine[];
};

export type PosQuickReturnResult = {
  id: string;
  sale_id: string;
  branch_id: string;
  shift_id: string;
  device_id: string;
  total_amount: number;
  refund_method: "cash" | "card" | "mixed";
  refund_status: "completed" | "pending_provider" | "failed";
  refund_cash_amount: number;
  refund_card_amount: number;
  invoice_number: string;
  card_refund_id: string | null;
  card_refund_pending: boolean;
  drawer_balance_after: number;
  idempotent: boolean;
};

type PendingReturn = {
  requestId: string;
  fingerprint: string;
  createdAt: number;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

function pendingKey(userId: string, branchId: string, saleId: string) {
  return `pos-return-request:${userId}:${branchId}:${saleId}`;
}

function sleep(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function friendlyReturnError(message?: string) {
  const value = message || "";
  if (value.startsWith("INSUFFICIENT_DRAWER_CASH|")) {
    const balance = value.split("|")[1] || "0.00";
    return `رصيد درج الكاشير غير كافٍ لرد الجزء النقدي. الرصيد الحالي ${balance} ج.م.`;
  }
  if (value.startsWith("RETURN_QUANTITY_EXCEEDED|")) {
    const [, product, available] = value.split("|");
    return `${product || "المنتج"}: الكمية المتاحة للإرجاع حاليًا ${available || "0"}.`;
  }
  if (value.includes("POS_SALE_NOT_FOUND")) return "الفاتورة غير متاحة كفاتورة POS قابلة للإرجاع.";
  if (value.includes("REFUND_PERMISSION_DENIED")) return "ليس لديك صلاحية تنفيذ مرتجع على هذا الفرع.";
  if (value.includes("POS_SHIFT_REQUIRED")) return "لازم تكون وردية الكاشير مفتوحة على نفس الجهاز لتنفيذ المرتجع.";
  if (value.includes("DEVICE_UNAVAILABLE")) return "جهاز POS غير متاح أو لم يعد مسجلًا على الفرع.";
  if (value.includes("INVALID_RETURN_ITEM")) return "إحدى كميات المرتجع غير صحيحة.";
  if (value.includes("DUPLICATE_RETURN_LINE")) return "تم تكرار نفس الصنف داخل طلب المرتجع.";
  if (value.includes("RETURN_AMOUNT_EXCEEDED")) return "قيمة المرتجعات تجاوزت قيمة الفاتورة الأصلية.";
  if (value.includes("RETURN_AMOUNT_INVALID")) return "قيمة المرتجع غير صحيحة.";
  if (value.includes("RETURN_REQUEST_CONFLICT")) return "يوجد طلب مرتجع سابق مختلف لنفس المحاولة. راجع المرتجعات قبل إعادة التنفيذ.";
  if (value.includes("PROVIDER_REFERENCE_REQUIRED")) return "اكتب مرجع عملية رد البطاقة من جهاز/مزود الدفع.";
  if (value.includes("REFUND_NOT_PENDING")) return "رد البطاقة لم يعد في حالة انتظار.";
  if (value.includes("REFUND_NOT_FOUND")) return "عملية رد البطاقة غير موجودة.";
  return null;
}

function deterministic(error?: { code?: string; message?: string } | null) {
  if (!error) return false;
  return Boolean(error.code?.startsWith("22") || error.code === "42501" || error.code === "55000" || friendlyReturnError(error.message));
}

export async function getPosSaleReturnPreview(saleId: string): Promise<PosReturnPreview> {
  const { data, error } = await rpc("get_pos_sale_return_preview", { p_sale_id: saleId });
  if (error) throw new Error(friendlyReturnError(error.message) || error.message || "تعذر تحميل بيانات المرتجع");
  if (!data || typeof data !== "object") throw new Error("لم تصل بيانات الفاتورة للمرتجع.");
  return data as PosReturnPreview;
}

export async function submitPosQuickReturn(
  preview: PosReturnPreview,
  items: Array<{ line_index: number; quantity: number; reason?: string | null }>,
  reason: string,
): Promise<PosQuickReturnResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("الإنترنت مقطوع. لم يتم تنفيذ المرتجع؛ رجّع الاتصال وحاول مرة أخرى.");
  }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("سجّل الدخول مرة أخرى لتنفيذ المرتجع.");

  const device = getLocalPosDevice(preview.branch_id);
  if (!device) throw new Error("هذا المتصفح غير مسجل كجهاز POS للفرع الحالي.");

  const cleanReason = reason.trim();
  if (cleanReason.length < 3) throw new Error("اكتب سبب المرتجع بوضوح.");
  if (!items.length) throw new Error("اختار صنفًا واحدًا على الأقل للإرجاع.");

  const normalizedItems = items
    .map(item => ({
      line_index: Number(item.line_index),
      quantity: Number(Number(item.quantity).toFixed(3)),
      reason: item.reason?.trim() || null,
    }))
    .sort((a, b) => a.line_index - b.line_index);

  const fingerprint = JSON.stringify({ saleId: preview.sale_id, items: normalizedItems, reason: cleanReason });
  const key = pendingKey(authData.user.id, preview.branch_id, preview.sale_id);
  let pending: PendingReturn | null = null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) pending = JSON.parse(raw) as PendingReturn;
  } catch {
    pending = null;
  }

  if (pending && pending.fingerprint !== fingerprint) {
    throw new Error("فيه محاولة مرتجع سابقة غير مؤكدة لنفس الفاتورة. أعد نفس الاختيارات أو راجع سجل المرتجعات أولًا.");
  }
  if (!pending) pending = { requestId: crypto.randomUUID(), fingerprint, createdAt: Date.now() };
  try { localStorage.setItem(key, JSON.stringify(pending)); } catch { /* server idempotency still protects the request */ }

  const args = {
    p_request_id: pending.requestId,
    p_sale_id: preview.sale_id,
    p_device_id: device.device_id,
    p_device_token: device.device_token,
    p_items: normalizedItems,
    p_reason: cleanReason,
  };

  let result = await rpc("create_pos_sale_return", args);
  if (result.error && !deterministic(result.error) && (typeof navigator === "undefined" || navigator.onLine)) {
    await sleep(350);
    result = await rpc("create_pos_sale_return", args);
  }

  if (result.error) {
    if (deterministic(result.error)) {
      try { localStorage.removeItem(key); } catch { /* noop */ }
    }
    throw new Error(friendlyReturnError(result.error.message) || "تعذّر تأكيد المرتجع بسبب اتصال غير مؤكد. أعد نفس المحاولة؛ لن يتكرر المرتجع.");
  }
  if (!result.data || typeof result.data !== "object") {
    throw new Error("لم يصل تأكيد المرتجع. أعد نفس المحاولة؛ Request ID يمنع التكرار.");
  }

  try { localStorage.removeItem(key); } catch { /* noop */ }
  invalidatePOSCatalogCache(preview.branch_id);
  invalidatePosPreflightCache(preview.branch_id);
  const confirmed = result.data as PosQuickReturnResult;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pos:return-completed", { detail: confirmed }));
    window.dispatchEvent(new CustomEvent("pos:cash-changed", { detail: confirmed }));
  }
  return confirmed;
}

export async function confirmPosCardRefund(refundId: string, providerReference: string) {
  const reference = providerReference.trim();
  if (reference.length < 3) throw new Error("اكتب مرجع رد البطاقة من جهاز/مزود الدفع.");
  const { data, error } = await rpc("confirm_pos_card_refund", {
    p_refund_id: refundId,
    p_provider_reference: reference,
  });
  if (error) throw new Error(friendlyReturnError(error.message) || error.message || "تعذر تأكيد رد البطاقة");
  if (!data || typeof data !== "object") throw new Error("لم يصل تأكيد رد البطاقة.");
  return data as Record<string, unknown>;
}
