import { supabase } from "@/integrations/supabase/client";

export type POSLoyaltyCustomer = {
  customer_id: string;
  name: string | null;
  phone: string | null;
  membership_number: string;
  barcode_token: string;
  points_balance: number;
  lifetime_points_earned: number;
  redeemable_credit_egp: number;
  redemption_points: number;
  redemption_value_egp: number;
};

export type POSLoyaltyVoucher = {
  id: string;
  customer_id: string;
  customer_name: string | null;
  membership_number: string | null;
  voucher_code: string;
  barcode_token: string;
  initial_value_egp: number;
  remaining_value_egp: number;
  status: "active" | "redeemed" | "cancelled";
  expires_at: string | null;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

export async function lookupPOSLoyaltyCustomer(code: string, branchId: string): Promise<POSLoyaltyCustomer | null> {
  const clean = code.trim();
  if (!clean || !branchId) return null;
  const { data, error } = await rpc("lookup_customer_loyalty", {
    p_code: clean,
    p_branch_id: branchId,
  });
  if (error) {
    if (error.message?.includes("CUSTOMER_NOT_FOUND")) return null;
    throw error;
  }
  return data as POSLoyaltyCustomer;
}

export async function lookupPOSLoyaltyVoucher(code: string, branchId: string, customerId: string): Promise<POSLoyaltyVoucher | null> {
  const clean = code.trim();
  if (!clean || !branchId || !customerId) return null;
  const { data, error } = await rpc("lookup_loyalty_voucher", {
    p_code: clean,
    p_branch_id: branchId,
    p_customer_id: customerId,
  });
  if (error) {
    if (error.message?.includes("VOUCHER_NOT_FOUND")) return null;
    if (error.message?.includes("VOUCHER_CUSTOMER_MISMATCH")) throw new Error("الفاوچر لا يخص العميل المرتبط بالفاتورة.");
    if (error.message?.includes("VOUCHER_UNAVAILABLE")) throw new Error("الفاوچر مستخدم بالكامل أو غير متاح.");
    throw error;
  }
  return data as POSLoyaltyVoucher;
}

export function isCustomerLoyaltyBarcode(value: string) {
  return /^299\d{10}$/.test(value.trim());
}

export function isLoyaltyVoucherBarcode(value: string) {
  return /^298\d{10}$/.test(value.trim());
}
