import { supabase } from "@/integrations/supabase/client";
import type { Sale } from "@/types";

type PendingSale = {
  requestId: string;
  fingerprint: string;
  payload: Record<string, unknown>;
  confirmed?: boolean;
};

type RpcResult = {
  data: unknown;
  error: { message?: string; code?: string } | null;
};

function pendingSaleKey(userId: string, branchId: string, checkoutId: string) {
  return `pos-sale-request:${userId}:${branchId}:${checkoutId}`;
}

function friendlySaleError(message?: string) {
  const value = message || "";
  if (value.includes("INSUFFICIENT_STOCK")) return "مخزون الفرع غير كافٍ. راجع الكميات قبل تأكيد البيع.";
  if (value.includes("PRICE_CHANGED")) return "اتغير سعر أو عرض أحد المنتجات. تم إيقاف البيع لحماية الفاتورة؛ حدّث السلة وراجع الإجمالي ثم أكد مرة أخرى.";
  if (value.includes("POS_SHIFT_REQUIRED") || value.includes("SHIFT_NOT_OPEN") || value.includes("POS_SHIFT_CASH_ACCOUNT_MISSING")) {
    return "لا توجد وردية POS مفتوحة لهذا الموظف على الجهاز الحالي.";
  }
  if (value.includes("INVALID_BULK_QUANTITY")) return "كمية الجملة غير صحيحة. أضف عبوة جملة كاملة فقط.";
  if (value.includes("INVALID_QUANTITY")) return "إحدى كميات السلة غير صحيحة. راجع الكمية أو الوزن.";
  if (value.includes("INVALID_PAYMENT_SPLIT")) return "تقسيم الدفع غير صحيح. مجموع النقدي والبطاقة يجب أن يساوي إجمالي الفاتورة.";
  if (value.includes("INVALID_SALE_TOTAL")) return "إجمالي الفاتورة غير متطابق. أعد مراجعة السلة.";
  if (value.includes("BRANCH_ACCESS_DENIED")) return "ليس لديك صلاحية تنفيذ بيع على الفرع الحالي.";
  if (value.includes("PRODUCT_UNAVAILABLE")) return "أحد المنتجات لم يعد متاحًا للبيع. حدّث السلة وحاول مرة أخرى.";
  if (value.includes("BULK_UNAVAILABLE")) return "إعداد الجملة لهذا المنتج لم يعد متاحًا.";
  if (value.includes("REQUEST_CONFLICT")) return "تم العثور على محاولة بيع سابقة مختلفة لنفس السلة. راجع الفاتورة السابقة قبل إعادة المحاولة.";
  if (value.includes("DEVICE_UNAVAILABLE")) return "جهاز الكاشير غير متاح أو تم إلغاء تسجيله.";
  return null;
}

function isDeterministicError(code?: string, message?: string) {
  if (code?.startsWith("22") || code === "42501" || code === "55000") return true;
  return Boolean(friendlySaleError(message));
}

function sleep(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function createSaleAttempt(requestId: string, branchId: string, payload: Record<string, unknown>): Promise<RpcResult> {
  return await (supabase.rpc as any)("create_pos_sale", {
    p_request_id: requestId,
    p_branch_id: branchId,
    p_sale: payload,
  }) as RpcResult;
}

export function clearConfirmedPosSale(userId: string, branchId: string, checkoutId: string) {
  const key = pendingSaleKey(userId, branchId, checkoutId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as PendingSale;
    if (parsed.confirmed) localStorage.removeItem(key);
  } catch {
    // Ignore local cache issues; server idempotency remains authoritative.
  }
}

export async function submitPosSale(
  sale: Omit<Sale, "id" | "created_at" | "updated_at">,
  checkoutId: string,
): Promise<Sale> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("الإنترنت مقطوع حاليًا. السلة محفوظة؛ رجّع الاتصال وحاول بنفس السلة.");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("سجّل الدخول مرة أخرى لإتمام البيع.");

  const branchId = sale.branch_id || localStorage.getItem("currentBranchId");
  if (!branchId) throw new Error("اختار الفرع قبل إتمام البيع.");

  const payload = {
    items: sale.items,
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    profit: sale.profit ?? 0,
    payment_method: sale.payment_method,
    cash_amount: sale.cash_amount ?? 0,
    card_amount: sale.card_amount ?? 0,
    customer_name: sale.customer_name ?? null,
    customer_phone: sale.customer_phone ?? null,
  };

  const fingerprint = JSON.stringify(payload);
  const key = pendingSaleKey(authData.user.id, branchId, checkoutId);
  let pending: PendingSale;

  try {
    const raw = localStorage.getItem(key);
    pending = raw
      ? (JSON.parse(raw) as PendingSale)
      : {
          requestId: crypto.randomUUID(),
          fingerprint,
          payload: { ...payload, invoice_number: sale.invoice_number },
        };
  } catch {
    pending = {
      requestId: crypto.randomUUID(),
      fingerprint,
      payload: { ...payload, invoice_number: sale.invoice_number },
    };
  }

  if (pending.fingerprint !== fingerprint) {
    throw new Error("فيه محاولة حفظ سابقة لنفس السلة. راجع الفاتورة السابقة قبل تغيير بيانات الدفع.");
  }

  try {
    localStorage.setItem(key, JSON.stringify(pending));
  } catch {
    // Server-side request id still protects the transaction for this attempt.
  }

  let result = await createSaleAttempt(pending.requestId, branchId, pending.payload);

  if (result.error && !isDeterministicError(result.error.code, result.error.message)) {
    // A timeout / transient connection error can leave the client unsure whether the
    // transaction committed. Retry exactly once with the SAME request id. The database
    // idempotency contract returns the original sale instead of creating a duplicate.
    if (typeof navigator === "undefined" || navigator.onLine) {
      await sleep(350);
      result = await createSaleAttempt(pending.requestId, branchId, pending.payload);
    }
  } else if (!result.error && !result.data && (typeof navigator === "undefined" || navigator.onLine)) {
    await sleep(350);
    result = await createSaleAttempt(pending.requestId, branchId, pending.payload);
  }

  if (result.error) {
    const friendly = friendlySaleError(result.error.message);
    if (isDeterministicError(result.error.code, result.error.message)) {
      try { localStorage.removeItem(key); } catch { /* noop */ }
    }
    if (friendly) throw new Error(friendly);
    throw new Error("تعذّر تأكيد حفظ البيع بسبب اتصال غير مؤكد. السلة محفوظة؛ أعد المحاولة نفسها ولن تُسجّل الفاتورة مرتين.");
  }

  if (!result.data) {
    throw new Error("لم يصل تأكيد البيع. السلة محفوظة؛ أعد المحاولة نفسها ولن تُسجّل الفاتورة مرتين.");
  }

  try {
    localStorage.setItem(key, JSON.stringify({ ...pending, confirmed: true }));
  } catch {
    // Sale is already committed; do not report failure because local cache could not update.
  }

  return result.data as Sale;
}
