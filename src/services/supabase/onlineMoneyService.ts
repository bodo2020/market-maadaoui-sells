import { supabase } from "@/integrations/supabase/client";

export type OnlinePaymentAccount = {
  account_id: string;
  account_type: "gateway_clearing" | "bank";
  provider_code: string;
  name: string;
  balance: number;
};

export type OnlineMoneyOverview = {
  branch_id: string;
  online_cash_account_id: string | null;
  online_cash_balance: number;
  safe_account_id: string | null;
  safe_balance: number;
  payment_accounts: OnlinePaymentAccount[];
};

export type PendingOnlineRefund = {
  refund_id: string;
  return_id: string;
  order_id: string;
  payment_method: string;
  amount: number;
  status: "pending";
  provider_reference: string | null;
  created_at: string;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

function moneyError(message?: string) {
  if (!message) return "تعذر تحديث تسويات الأونلاين";
  switch (message) {
    case "AUTH_REQUIRED": return "سجّل الدخول مرة أخرى.";
    case "ONLINE_MONEY_VIEW_DENIED": return "ليس لديك صلاحية عرض تسويات الأونلاين لهذا الفرع.";
    case "ONLINE_CASH_SETTLE_DENIED": return "ليس لديك صلاحية توريد تحصيل الأونلاين.";
    case "ONLINE_DIGITAL_SETTLE_DENIED": return "ليس لديك صلاحية تسجيل التسويات الإلكترونية.";
    case "INSUFFICIENT_ONLINE_CASH": return "المبلغ أكبر من تحصيل الأونلاين غير المورد.";
    case "INSUFFICIENT_CLEARING_BALANCE": return "قيمة التسوية أكبر من الرصيد المعلق لدى مزود الدفع.";
    case "INVALID_PAYMENT_METHOD": return "طريقة الدفع غير صحيحة.";
    case "INVALID_AMOUNT": return "قيمة العملية غير صحيحة.";
    case "INVALID_FEE": return "العمولة لا يمكن أن تكون أكبر من إجمالي التسوية.";
    case "REFUND_NOT_FOUND": return "عملية رد المبلغ غير موجودة.";
    case "REFUND_NOT_PENDING": return "عملية رد المبلغ لم تعد في انتظار التأكيد.";
    default: return message;
  }
}

export async function getOnlineMoneyOverview(branchId: string): Promise<OnlineMoneyOverview> {
  const { data, error } = await rpc("get_online_money_overview", { p_branch_id: branchId });
  if (error || !data || typeof data !== "object") throw new Error(moneyError(error?.message));
  const row = data as any;
  return {
    branch_id: row.branch_id,
    online_cash_account_id: row.online_cash_account_id ?? null,
    online_cash_balance: Number(row.online_cash_balance || 0),
    safe_account_id: row.safe_account_id ?? null,
    safe_balance: Number(row.safe_balance || 0),
    payment_accounts: Array.isArray(row.payment_accounts)
      ? row.payment_accounts.map((account: any) => ({ ...account, balance: Number(account.balance || 0) }))
      : [],
  };
}

export async function getPendingOnlineRefunds(branchId: string): Promise<PendingOnlineRefund[]> {
  const { data, error } = await rpc("get_pending_online_refunds", { p_branch_id: branchId });
  if (error) throw new Error(moneyError(error.message));
  return Array.isArray(data)
    ? data.map((row: any) => ({ ...row, amount: Number(row.amount || 0) })) as PendingOnlineRefund[]
    : [];
}

export async function depositOnlineCashToSafe(branchId: string, amount: number, note?: string) {
  const { data, error } = await rpc("deposit_online_cash_to_safe", {
    p_branch_id: branchId,
    p_amount: amount,
    p_note: note?.trim() || null,
  });
  if (error || !data) throw new Error(moneyError(error?.message));
  return data as { transfer_id: string; online_cash_balance: number; safe_balance: number };
}

export async function recordOnlineGatewaySettlement(input: {
  branchId: string;
  paymentMethod: "wallet" | "card" | "bank_transfer";
  gross: number;
  fee: number;
  providerReference?: string;
  note?: string;
}) {
  const { data, error } = await rpc("record_online_gateway_settlement", {
    p_branch_id: input.branchId,
    p_payment_method: input.paymentMethod,
    p_gross: input.gross,
    p_fee: input.fee,
    p_provider_reference: input.providerReference?.trim() || null,
    p_note: input.note?.trim() || null,
  });
  if (error || !data) throw new Error(moneyError(error?.message));
  return data as {
    settlement_id: string;
    gross_amount: number;
    fee_amount: number;
    net_amount: number;
    clearing_balance: number;
    bank_balance: number;
  };
}

export async function confirmOnlineRefund(refundId: string, providerReference?: string) {
  const { data, error } = await rpc("confirm_online_refund", {
    p_refund_id: refundId,
    p_provider_reference: providerReference?.trim() || null,
  });
  if (error || !data) throw new Error(moneyError(error?.message));
  return data;
}
