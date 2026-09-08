import { supabase } from "@/integrations/supabase/client";
import type { Sale } from "@/types";
import { getLocalPosDevice } from "@/services/supabase/posDeviceService";
import { invalidatePOSCatalogCache } from "@/services/supabase/posCatalogService";
import { invalidatePosPreflightCache } from "@/services/supabase/posPreflightService";
import {
  posLoyaltyContextKey,
  posVoucherContextKey,
  readPOSLoyaltyCustomer,
  readPOSLoyaltyVoucher,
} from "@/components/POS/POSCustomerLoyaltyBridge";

export type ModernPOSPaymentSelection = {
  paymentMethodId: string;
  paymentReference?: string | null;
};

type PendingModernSale = {
  requestId: string;
  fingerprint: string;
  payload: Record<string, unknown>;
  confirmed?: boolean;
};

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };

function key(userId: string, branchId: string, checkoutId: string) {
  return `pos-sale-v2-request:${userId}:${branchId}:${checkoutId}`;
}

function friendly(message?: string) {
  const value = message || "";
  if (value.includes("PAYMENT_METHOD_REQUIRED")) return "اختر وسيلة الدفع قبل تأكيد البيع.";
  if (value.includes("PAYMENT_METHOD_UNAVAILABLE")) return "وسيلة الدفع دي متوقفة أو لم تعد متاحة في الفرع.";
  if (value.includes("PAYMENT_REFERENCE_REQUIRED")) return "اكتب الرقم المرجعي لعملية الدفع قبل التأكيد.";
  if (value.includes("INSUFFICIENT_STOCK")) return "مخزون الفرع غير كافٍ. راجع الكميات قبل تأكيد البيع.";
  if (value.includes("PRICE_CHANGED")) return "اتغير سعر أو عرض في السلة. راجع الإجمالي ثم أكد مرة أخرى.";
  if (value.includes("POS_DEVICE_SHIFT_MISMATCH") || value.includes("SHIFT_NOT_OPEN")) return "لا توجد وردية POS مفتوحة على الجهاز الحالي.";
  if (value.includes("DEVICE_REQUIRED") || value.includes("DEVICE_UNAVAILABLE")) return "جهاز نقطة البيع غير متاح أو غير مسجل للفرع الحالي.";
  if (value.includes("CUSTOMER_NOT_FOUND") || value.includes("CUSTOMER_CODE_MISMATCH")) return "تعذر ربط العميل بالفاتورة. امسح بطاقة العميل مرة أخرى.";
  if (value.includes("LOYALTY_ACCOUNT_SUSPENDED")) return "حساب ولاء العميل موقوف حاليًا.";
  if (value.includes("CUSTOMER_REQUIRED_FOR_VOUCHER")) return "امسح بطاقة العميل أولًا قبل استخدام كوبون الخصم.";
  if (value.includes("VOUCHER_NOT_FOUND")) return "كوبون الخصم غير موجود. امسح الباركود مرة أخرى.";
  if (value.includes("VOUCHER_CUSTOMER_MISMATCH")) return "كوبون الخصم لا يخص العميل المرتبط بالفاتورة.";
  if (value.includes("VOUCHER_UNAVAILABLE")) return "كوبون الخصم مستخدم بالكامل أو غير متاح.";
  if (value.includes("INVALID_VOUCHER_AMOUNT") || value.includes("VOUCHER_AMOUNT_TOO_HIGH")) return "قيمة كوبون الخصم غير صالحة لهذه الفاتورة.";
  if (value.includes("VOUCHER_BALANCE_CHANGED")) return "رصيد كوبون الخصم اتغير. امسحه مرة ثانية قبل التأكيد.";
  if (value.includes("REQUEST_CONFLICT")) return "فيه محاولة بيع سابقة مختلفة لنفس السلة. راجع الفاتورة السابقة قبل إعادة المحاولة.";
  if (value.includes("BRANCH_ACCESS_DENIED")) return "ليس لديك صلاحية تنفيذ بيع على الفرع الحالي.";
  if (value.includes("INVALID_PAYMENT_SPLIT")) return "بيانات التحصيل غير متطابقة مع إجمالي الفاتورة.";
  return null;
}

function deterministic(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  return Boolean(friendly(error.message)) || Boolean(error.code?.startsWith("22")) || error.code === "42501" || error.code === "55000";
}

export function clearConfirmedModernPosSale(userId: string, branchId: string, checkoutId: string) {
  try {
    const storageKey = key(userId, branchId, checkoutId);
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const saved = JSON.parse(raw) as PendingModernSale;
    if (saved.confirmed) localStorage.removeItem(storageKey);
  } catch {
    // Server idempotency remains authoritative.
  }
}

export async function submitModernPosSale(
  sale: Omit<Sale, "id" | "created_at" | "updated_at">,
  checkoutId: string,
  selection: ModernPOSPaymentSelection,
): Promise<Sale & Record<string, unknown>> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("الإنترنت مقطوع حاليًا. السلة محفوظة؛ رجّع الاتصال وحاول مرة ثانية.");

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("سجّل الدخول مرة أخرى لإتمام البيع.");

  const branchId = sale.branch_id || localStorage.getItem("currentBranchId");
  if (!branchId) throw new Error("اختار الفرع قبل إتمام البيع.");
  if (!selection.paymentMethodId) throw new Error("اختر وسيلة الدفع قبل تأكيد البيع.");

  const device = getLocalPosDevice(branchId);
  if (!device) throw new Error("هذا المتصفح غير مسجل كجهاز POS للفرع الحالي.");

  const customer = readPOSLoyaltyCustomer(branchId, checkoutId);
  const voucher = readPOSLoyaltyVoucher(branchId, checkoutId);
  if (voucher && !customer) throw new Error("امسح بطاقة العميل أولًا قبل استخدام كوبون الخصم.");
  if (voucher?.customer_id && customer?.customer_id && voucher.customer_id !== customer.customer_id) throw new Error("كوبون الخصم لا يخص العميل المرتبط بالفاتورة.");

  const voucherAmount = voucher
    ? Math.max(0, Math.min(Number(voucher.remaining_value_egp || 0), Number(sale.total || 0)))
    : 0;

  const payload: Record<string, unknown> = {
    items: sale.items,
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    profit: sale.profit ?? 0,
    payment_method_id: selection.paymentMethodId,
    payment_reference: selection.paymentReference?.trim() || null,
    customer_id: customer?.customer_id || null,
    customer_barcode: customer?.barcode_token || null,
    customer_name: customer?.name || null,
    customer_phone: customer?.phone || null,
    voucher_code: voucher?.voucher_code || voucher?.barcode_token || null,
    voucher_amount: voucherAmount,
    device_id: device.device_id,
    device_token: device.device_token,
    invoice_number: sale.invoice_number,
  };

  const fingerprint = JSON.stringify(payload);
  const storageKey = key(authData.user.id, branchId, checkoutId);
  let pending: PendingModernSale;
  try {
    const raw = localStorage.getItem(storageKey);
    pending = raw ? JSON.parse(raw) as PendingModernSale : { requestId: crypto.randomUUID(), fingerprint, payload };
  } catch {
    pending = { requestId: crypto.randomUUID(), fingerprint, payload };
  }

  if (pending.fingerprint !== fingerprint) {
    throw new Error("فيه محاولة حفظ سابقة لنفس السلة. أكمل نفس بيانات العميل والكوبون والدفع أو ابدأ عملية بيع جديدة.");
  }
  try { localStorage.setItem(storageKey, JSON.stringify(pending)); } catch { /* noop */ }

  const call = async () => await (supabase.rpc as any)("create_pos_sale_v2", {
    p_request_id: pending.requestId,
    p_branch_id: branchId,
    p_sale: pending.payload,
  }) as RpcResult;

  let result = await call();
  if (result.error && !deterministic(result.error) && (typeof navigator === "undefined" || navigator.onLine)) {
    await new Promise(resolve => window.setTimeout(resolve, 350));
    result = await call();
  }

  if (result.error) {
    if (deterministic(result.error)) {
      try { localStorage.removeItem(storageKey); } catch { /* noop */ }
    }
    throw new Error(friendly(result.error.message) || "تعذر تأكيد حفظ البيع بسبب اتصال غير مؤكد. أعد المحاولة نفسها ولن تتكرر الفاتورة.");
  }
  if (!result.data) throw new Error("لم يصل تأكيد البيع. أعد نفس المحاولة ولن تُسجّل الفاتورة مرتين.");

  const confirmed = result.data as Sale & Record<string, unknown>;
  try {
    localStorage.setItem(storageKey, JSON.stringify({ ...pending, confirmed: true }));
    localStorage.removeItem(posLoyaltyContextKey(branchId, checkoutId));
    localStorage.removeItem(posVoucherContextKey(branchId, checkoutId));
  } catch {
    // Sale is already committed.
  }

  invalidatePOSCatalogCache(branchId);
  invalidatePosPreflightCache(branchId);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("pos:sale-completed", { detail: confirmed }));
  return confirmed;
}
