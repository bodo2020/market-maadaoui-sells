import { supabase } from "@/integrations/supabase/client";

export type WalletFeeTypeV4 = "none" | "percent" | "fixed" | string;
export type WalletOperationTypeV4 = "expense" | "supplier_payment";
export type WalletOperationStatusV4 = "posted" | "voided";

export type FinanceWalletV4 = {
  account_id: string;
  name: string;
  balance: number;
  method_id: string;
  code: string;
  method_name: string;
  method_type: string;
  fee_type: WalletFeeTypeV4;
  fee_value: number;
  fee_bearer: string;
  require_reference: boolean;
};

export type FinanceSupplierV4 = {
  supplier_id: string;
  name: string;
  phone?: string | null;
  branch_balance: number;
  global_balance: number;
};

export type SupplierRepresentativeV1 = {
  id: string;
  branch_id: string;
  supplier_id: string;
  name: string;
  phone?: string | null;
  active: boolean;
  can_receive_payments: boolean;
  payout_method?: string | null;
  payout_destination?: string | null;
  payment_limit?: number | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type OpenSupplierPurchaseV4 = {
  purchase_id: string;
  supplier_id: string;
  invoice_number?: string | null;
  date?: string | null;
  total: number;
  paid: number;
  outstanding: number;
};

export type FinanceWalletOperationV4 = {
  id?: string;
  operation_id?: string;
  request_id: string;
  operation_type: WalletOperationTypeV4;
  account_id?: string;
  account_name?: string;
  payment_account_id?: string;
  principal_amount: number;
  expected_fee_amount: number;
  actual_fee_amount: number;
  fee_saving_amount: number;
  total_debit: number;
  supplier_id?: string | null;
  supplier_name?: string | null;
  representative_id?: string | null;
  representative_name?: string | null;
  purchase_id?: string | null;
  expense_id?: string | null;
  apply_to_supplier: boolean;
  provider_reference?: string | null;
  note?: string | null;
  status: WalletOperationStatusV4;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  balance_before?: number;
  balance_after?: number;
  supplier_branch_balance?: number;
};

export type FinanceWalletWorkspaceV4 = {
  version: number;
  wallets: FinanceWalletV4[];
  suppliers: FinanceSupplierV4[];
  representatives: SupplierRepresentativeV1[];
  open_purchases: OpenSupplierPurchaseV4[];
  recent_operations: FinanceWalletOperationV4[];
  legacy_unassigned_supplier_entries: number;
};

export type SupplierLedgerEntryV1 = {
  id: string;
  branch_id?: string | null;
  supplier_id: string;
  entry_type: string;
  signed_amount: number;
  purchase_id?: string | null;
  wallet_operation_id?: string | null;
  representative_id?: string | null;
  representative_name?: string | null;
  invoice_number?: string | null;
  idempotency_key: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
};

export type SupplierLedgerWorkspaceV1 = {
  supplier: Record<string, unknown>;
  branch_balance?: number | null;
  global_balance: number;
  entries: SupplierLedgerEntryV1[];
};

type RpcError = { message?: string; details?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function walletError(error: RpcError) {
  const message = `${error?.message || ""} ${error?.details || ""}`;
  if (message.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجل الدخول مرة أخرى.");
  if (message.includes("FINANCE_VIEW_DENIED")) return new Error("ليس لديك صلاحية عرض تشغيل المحافظ.");
  if (message.includes("FINANCE_MANAGE_DENIED")) return new Error("ليس لديك صلاحية تنفيذ العمليات المالية.");
  if (message.includes("WALLET_ACCOUNT_NOT_FOUND")) return new Error("المحفظة المختارة غير متاحة لهذا الفرع.");
  if (message.includes("DIGITAL_WALLET_REQUIRED")) return new Error("اختر محفظة إلكترونية صالحة للعملية.");
  if (message.includes("INSUFFICIENT_WALLET_BALANCE")) return new Error("رصيد المحفظة لا يكفي المبلغ والعمولة الفعلية.");
  if (message.includes("INVALID_ACTUAL_FEE")) return new Error("العمولة الفعلية لا يمكن أن تكون سالبة.");
  if (message.includes("INVALID_AMOUNT")) return new Error("أدخل مبلغًا أكبر من صفر.");
  if (message.includes("EXPENSE_TYPE_REQUIRED")) return new Error("اكتب نوع المصروف.");
  if (message.includes("SUPPLIER_NOT_FOUND")) return new Error("المورد غير موجود أو لم يعد متاحًا.");
  if (message.includes("REPRESENTATIVE_NOT_FOUND")) return new Error("المندوب غير موجود أو لا يتبع المورد والفرع المختارين.");
  if (message.includes("REPRESENTATIVE_PAYMENT_NOT_ALLOWED")) return new Error("هذا المندوب غير مصرح له باستلام أموال.");
  if (message.includes("REPRESENTATIVE_PAYMENT_LIMIT_EXCEEDED")) return new Error("المبلغ أكبر من حد الاستلام المسموح لهذا المندوب.");
  if (message.includes("PURCHASE_NOT_FOUND_FOR_SUPPLIER")) return new Error("فاتورة الشراء لا تتبع المورد أو الفرع المختارين.");
  if (message.includes("PURCHASE_HAS_NO_OUTSTANDING")) return new Error("فاتورة الشراء ليس عليها مبلغ مستحق.");
  if (message.includes("PAYMENT_EXCEEDS_PURCHASE_OUTSTANDING")) return new Error("الدفعة أكبر من المتبقي على فاتورة الشراء.");
  if (message.includes("REQUEST_ID_CONFLICT")) return new Error("رقم العملية مستخدم مسبقًا لعملية مختلفة.");
  if (message.includes("REPRESENTATIVE_NAME_REQUIRED")) return new Error("اسم المندوب مطلوب.");
  if (message.includes("INVALID_PAYMENT_LIMIT")) return new Error("حد استلام المندوب غير صحيح.");
  if (message.includes("SUPPLIER_BALANCE_LEDGER_MANAGED")) return new Error("رصيد المورد يُدار تلقائيًا من سجل المورد ولا يقبل التعديل اليدوي.");
  return new Error(error?.message || "تعذر تنفيذ عملية المحافظ.");
}

function num(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function expectedWalletFee(wallet: FinanceWalletV4 | undefined, amount: number) {
  if (!wallet || wallet.fee_bearer !== "business") return 0;
  if (wallet.fee_type === "percent") return Math.round((Math.max(0, amount) * num(wallet.fee_value) / 100) * 100) / 100;
  if (wallet.fee_type === "fixed") return Math.round(num(wallet.fee_value) * 100) / 100;
  return 0;
}

export async function fetchFinanceWalletWorkspaceV4(branchId: string, limit = 100): Promise<FinanceWalletWorkspaceV4> {
  const { data, error } = await rpc("get_finance_wallet_workspace_v4", { p_branch_id: branchId, p_limit: limit });
  if (error) throw walletError(error);
  const value = data as FinanceWalletWorkspaceV4;
  return {
    ...value,
    wallets: Array.isArray(value?.wallets) ? value.wallets : [],
    suppliers: Array.isArray(value?.suppliers) ? value.suppliers : [],
    representatives: Array.isArray(value?.representatives) ? value.representatives : [],
    open_purchases: Array.isArray(value?.open_purchases) ? value.open_purchases : [],
    recent_operations: Array.isArray(value?.recent_operations) ? value.recent_operations : [],
  };
}

export async function createWalletExpenseV4(input: {
  requestId: string;
  branchId: string;
  paymentAccountId: string;
  type: string;
  amount: number;
  description?: string | null;
  actualFee?: number | null;
  providerReference?: string | null;
  date?: string | null;
  receiptUrl?: string | null;
}) {
  const { data, error } = await rpc("create_wallet_expense_v4", {
    p_request_id: input.requestId,
    p_branch_id: input.branchId,
    p_payment_account_id: input.paymentAccountId,
    p_type: input.type.trim(),
    p_amount: input.amount,
    p_description: input.description?.trim() || null,
    p_actual_fee: input.actualFee ?? null,
    p_provider_reference: input.providerReference?.trim() || null,
    p_date: input.date || new Date().toISOString(),
    p_receipt_url: input.receiptUrl?.trim() || null,
  });
  if (error) throw walletError(error);
  return data as FinanceWalletOperationV4 & { expense?: Record<string, unknown> };
}

export async function createSupplierWalletPaymentV4(input: {
  requestId: string;
  branchId: string;
  paymentAccountId: string;
  supplierId: string;
  amount: number;
  representativeId?: string | null;
  purchaseId?: string | null;
  applyToSupplier: boolean;
  actualFee?: number | null;
  providerReference?: string | null;
  note?: string | null;
}) {
  const { data, error } = await rpc("create_supplier_wallet_payment_v4", {
    p_request_id: input.requestId,
    p_branch_id: input.branchId,
    p_payment_account_id: input.paymentAccountId,
    p_supplier_id: input.supplierId,
    p_amount: input.amount,
    p_representative_id: input.representativeId || null,
    p_purchase_id: input.purchaseId || null,
    p_apply_to_supplier: input.applyToSupplier,
    p_actual_fee: input.actualFee ?? null,
    p_provider_reference: input.providerReference?.trim() || null,
    p_note: input.note?.trim() || null,
  });
  if (error) throw walletError(error);
  return data as FinanceWalletOperationV4;
}

export async function saveSupplierRepresentativeV1(input: {
  representativeId?: string | null;
  branchId: string;
  supplierId: string;
  name: string;
  phone?: string | null;
  canReceivePayments: boolean;
  payoutMethod?: string | null;
  payoutDestination?: string | null;
  paymentLimit?: number | null;
  notes?: string | null;
  active: boolean;
}) {
  const { data, error } = await rpc("save_supplier_representative_v1", {
    p_branch_id: input.branchId,
    p_supplier_id: input.supplierId,
    p_name: input.name.trim(),
    p_phone: input.phone?.trim() || null,
    p_can_receive_payments: input.canReceivePayments,
    p_payout_method: input.payoutMethod?.trim() || null,
    p_payout_destination: input.payoutDestination?.trim() || null,
    p_payment_limit: input.paymentLimit ?? null,
    p_notes: input.notes?.trim() || null,
    p_active: input.active,
    p_representative_id: input.representativeId || null,
  });
  if (error) throw walletError(error);
  return data as SupplierRepresentativeV1;
}

export async function voidSupplierWalletPaymentV4(operationId: string, reason: string) {
  const { data, error } = await rpc("void_supplier_wallet_payment_v4", {
    p_operation_id: operationId,
    p_reason: reason.trim() || null,
  });
  if (error) throw walletError(error);
  return data as FinanceWalletOperationV4;
}

export async function fetchSupplierLedgerV1(supplierId: string, branchId?: string | null, limit = 100): Promise<SupplierLedgerWorkspaceV1> {
  const { data, error } = await rpc("get_supplier_ledger_v1", {
    p_supplier_id: supplierId,
    p_branch_id: branchId || null,
    p_limit: limit,
  });
  if (error) throw walletError(error);
  return data as SupplierLedgerWorkspaceV1;
}
