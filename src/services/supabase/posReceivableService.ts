import { supabase } from "@/integrations/supabase/client";
import { getLocalPosDevice } from "@/services/supabase/posDeviceService";

export type POSReceivablePartyKind = "customer" | "employee";

export type POSReceivablePaymentSplit = {
  paymentMethodId: string;
  baseAmount: number;
  reference?: string | null;
};

export type POSReceivableCollectionResult = {
  id: string;
  request_id: string;
  party_kind: POSReceivablePartyKind;
  party_id: string;
  amount: number;
  amount_charged: number;
  customer_fee_amount: number;
  merchant_fee_amount: number;
  balance_before: number;
  balance_after: number;
  credit_available: number;
  payment_breakdown: Array<Record<string, unknown>>;
  shift_id: string;
  created_at: string;
  idempotent: boolean;
};

type PendingCollection = {
  requestId: string;
  fingerprint: string;
  confirmed?: boolean;
};

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };

function storageKey(userId: string, branchId: string, kind: POSReceivablePartyKind, partyId: string) {
  return `pos-receivable-v2:${userId}:${branchId}:${kind}:${partyId}`;
}

function friendly(message?: string) {
  const value = message || "";
  if (value.includes("NO_RECEIVABLE_BALANCE")) return "لا يوجد رصيد سابق مستحق على الحساب.";
  if (value.includes("RECEIVABLE_PAYMENT_EXCEEDS_BALANCE")) return "مبلغ السداد أكبر من الرصيد المستحق الحالي.";
  if (value.includes("CUSTOMER_RECEIVABLE_NOT_FOUND")) return "حساب مديونية العميل غير موجود لهذا الفرع.";
  if (value.includes("EMPLOYEE_WALLET_NOT_ACTIVE")) return "حساب الموظف غير نشط حاليًا.";
  if (value.includes("EMPLOYEE_BRANCH_MISMATCH")) return "الموظف غير مرتبط بالفرع الحالي.";
  if (value.includes("PAYMENT_METHOD_UNAVAILABLE")) return "إحدى وسائل الدفع لم تعد متاحة.";
  if (value.includes("PAYMENT_REFERENCE_REQUIRED")) return "اكتب الرقم المرجعي لوسيلة الدفع المطلوبة.";
  if (value.includes("DUPLICATE_PAYMENT_METHOD")) return "لا يمكن استخدام نفس وسيلة الدفع مرتين في نفس السداد.";
  if (value.includes("CREDIT_CANNOT_PAY_RECEIVABLE")) return "لا يمكن سداد مديونية سابقة بوسيلة آجل أخرى.";
  if (value.includes("INVALID_PAYMENT_SPLIT") || value.includes("PAYMENT_SPLITS_REQUIRED")) return "راجع توزيع مبلغ السداد على وسائل الدفع.";
  if (value.includes("SHIFT_NOT_OPEN")) return "لا توجد وردية POS مفتوحة على الجهاز الحالي.";
  if (value.includes("DEVICE") || value.includes("POS_USE_DENIED")) return "الجهاز أو صلاحية نقطة البيع غير متاحة حاليًا.";
  if (value.includes("RECEIVABLE_REQUEST_CONFLICT")) return "توجد محاولة سداد سابقة مختلفة لنفس الحساب. راجع آخر عملية قبل الإعادة.";
  return null;
}

function deterministic(error: RpcResult["error"]) {
  if (!error) return false;
  return Boolean(friendly(error.message)) || Boolean(error.code?.startsWith("22")) || error.code === "42501" || error.code === "55000";
}

export async function collectPOSReceivable(params: {
  branchId: string;
  partyKind: POSReceivablePartyKind;
  partyId: string;
  amount: number;
  splits: POSReceivablePaymentSplit[];
}): Promise<POSReceivableCollectionResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("الإنترنت مقطوع. لم يتم تسجيل السداد؛ رجّع الاتصال وحاول مرة أخرى.");
  const amount = Number(Number(params.amount || 0).toFixed(2));
  if (amount <= 0) throw new Error("اكتب مبلغ سداد صحيح.");
  const splits = params.splits
    .map(row => ({
      payment_method_id: row.paymentMethodId,
      base_amount: Number(Number(row.baseAmount || 0).toFixed(2)),
      reference: row.reference?.trim() || null,
    }))
    .filter(row => row.base_amount > 0);
  const splitTotal = Number(splits.reduce((sum, row) => sum + row.base_amount, 0).toFixed(2));
  if (!splits.length || Math.abs(splitTotal - amount) > 0.009) throw new Error("مجموع وسائل الدفع لازم يساوي مبلغ السداد بالضبط.");

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("سجّل الدخول مرة أخرى لإتمام السداد.");
  const device = getLocalPosDevice(params.branchId);
  if (!device) throw new Error("هذا المتصفح غير مسجل كجهاز POS للفرع الحالي.");

  const fingerprint = JSON.stringify({ partyKind: params.partyKind, partyId: params.partyId, amount, splits });
  const key = storageKey(authData.user.id, params.branchId, params.partyKind, params.partyId);
  let pending: PendingCollection;
  try {
    const raw = localStorage.getItem(key);
    pending = raw ? JSON.parse(raw) as PendingCollection : { requestId: crypto.randomUUID(), fingerprint };
  } catch {
    pending = { requestId: crypto.randomUUID(), fingerprint };
  }
  if (pending.fingerprint !== fingerprint) pending = { requestId: pending.confirmed ? crypto.randomUUID() : (pending.requestId || crypto.randomUUID()), fingerprint };
  try { localStorage.setItem(key, JSON.stringify(pending)); } catch { /* server idempotency is authoritative */ }

  const call = async () => await (supabase.rpc as any)("collect_pos_receivable_v2", {
    p_request_id: pending.requestId,
    p_branch_id: params.branchId,
    p_device_id: device.device_id,
    p_device_token: device.device_token,
    p_party_kind: params.partyKind,
    p_party_id: params.partyId,
    p_amount: amount,
    p_payment_splits: splits,
  }) as RpcResult;

  let result = await call();
  if (result.error && !deterministic(result.error) && (typeof navigator === "undefined" || navigator.onLine)) {
    await new Promise(resolve => window.setTimeout(resolve, 350));
    result = await call();
  }
  if (result.error) {
    if (deterministic(result.error)) {
      try { localStorage.removeItem(key); } catch { /* noop */ }
    }
    throw new Error(friendly(result.error.message) || "تعذر تأكيد السداد بسبب اتصال غير مؤكد. أعد نفس المحاولة؛ لن تتكرر العملية.");
  }
  if (!result.data || typeof result.data !== "object") throw new Error("لم يصل تأكيد السداد. أعد نفس المحاولة ولن تتكرر العملية.");

  const confirmed = result.data as POSReceivableCollectionResult;
  try { localStorage.removeItem(key); } catch { /* noop */ }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pos:receivable-collected", { detail: confirmed }));
    window.dispatchEvent(new CustomEvent("pos:cash-changed", { detail: confirmed }));
  }
  return confirmed;
}
