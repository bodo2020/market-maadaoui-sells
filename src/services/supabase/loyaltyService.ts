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

export function isCustomerLoyaltyBarcode(value: string) {
  return /^299\d{10}$/.test(value.trim());
}
