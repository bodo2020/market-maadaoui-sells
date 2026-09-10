import { supabase } from "@/integrations/supabase/client";

export type FinanceAccountStaff = { user_id: string; name: string; role?: string | null };

export type FinanceManagedAccount = {
  account_id: string;
  account_type: "branch_safe" | "bank";
  provider_code?: string | null;
  name: string;
  currency: string;
  active: boolean;
  balance: number;
  custodian_user_id?: string | null;
  custodian_user_name?: string | null;
};

export type FinanceAccountsAdminV2 = {
  version: number;
  branch_id: string;
  branch_safes: FinanceManagedAccount[];
  bank_accounts: FinanceManagedAccount[];
  eligible_staff: FinanceAccountStaff[];
  generated_at: string;
};

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function financeAccountError(message?: string) {
  const value = message || "";
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجل الدخول مرة أخرى.");
  if (value.includes("FINANCE_BRANCH_ACCESS_DENIED")) return new Error("ليس لديك وصول لهذا الفرع.");
  if (value.includes("FINANCE_MANAGE_DENIED")) return new Error("ليس لديك صلاحية إدارة الحسابات المالية.");
  if (value.includes("FINANCE_BANK_NAME_REQUIRED")) return new Error("اكتب اسمًا واضحًا للحساب البنكي.");
  if (value.includes("FINANCE_BANK_NAME_EXISTS")) return new Error("يوجد حساب بنكي نشط بنفس الاسم في هذا الفرع.");
  if (value.includes("FINANCE_BANK_NOT_FOUND")) return new Error("الحساب البنكي لم يعد موجودًا.");
  if (value.includes("FINANCE_BANK_HAS_BALANCE")) return new Error("لا يمكن إيقاف حساب بنكي عليه رصيد. صفّر/حوّل الرصيد أولًا.");
  if (value.includes("FINANCE_BANK_HAS_OPEN_TRANSFERS")) return new Error("لا يمكن إيقاف الحساب وفيه تحويل مالي مفتوح أو قيد النقل.");
  if (value.includes("FINANCE_CUSTODIAN_INVALID")) return new Error("مسؤول العهدة المختار ليس موظفًا نشطًا في الفرع.");
  if (value.includes("FINANCE_ACCOUNT_UNAVAILABLE")) return new Error("الخزنة أو الحساب غير متاح.");
  return new Error(message || "تعذر تحديث الحساب المالي.");
}

export async function fetchFinanceAccountsAdminV2(branchId: string): Promise<FinanceAccountsAdminV2> {
  const { data, error } = await rpc("get_finance_accounts_admin_v2", { p_branch_id: branchId });
  if (error) throw financeAccountError(error.message);
  return data as FinanceAccountsAdminV2;
}

export async function createFinanceBankAccountV2(input: { branchId: string; name: string; custodianUserId?: string | null }) {
  const { data, error } = await rpc("create_finance_bank_account_v2", {
    p_branch_id: input.branchId,
    p_name: input.name.trim(),
    p_custodian_user_id: input.custodianUserId || null,
  });
  if (error) throw financeAccountError(error.message);
  return data as { ok: boolean; account_id: string; name: string; custodian_user_id?: string | null; custodian_user_name?: string | null; balance: number };
}

export async function updateFinanceBankAccountV2(input: { accountId: string; name: string; custodianUserId?: string | null; active: boolean }) {
  const { data, error } = await rpc("update_finance_bank_account_v2", {
    p_account_id: input.accountId,
    p_name: input.name.trim(),
    p_custodian_user_id: input.custodianUserId || null,
    p_active: input.active,
  });
  if (error) throw financeAccountError(error.message);
  return data as { ok: boolean; account_id: string; name: string; active: boolean; custodian_user_id?: string | null; custodian_user_name?: string | null; balance: number };
}

export async function setFinanceManagedAccountCustodian(input: { branchId: string; accountId: string; accountKind: "cash" | "payment"; userId?: string | null }) {
  const { data, error } = await rpc("set_finance_account_custodian_v1", {
    p_branch_id: input.branchId,
    p_account_kind: input.accountKind,
    p_account_id: input.accountId,
    p_user_id: input.userId || null,
  });
  if (error) throw financeAccountError(error.message);
  return data as { ok: boolean; account_id: string; account_name: string; custodian_user_id?: string | null; custodian_user_name?: string | null };
}
