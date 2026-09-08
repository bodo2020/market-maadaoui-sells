import { supabase } from "@/integrations/supabase/client";

export type StaffCustomerLoyaltyProfile = {
  customer: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    phone_verified: boolean | null;
    created_at: string;
  };
  loyalty: {
    membership_number: string;
    barcode_token: string;
    points_balance: number;
    lifetime_points_earned: number;
    lifetime_points_redeemed: number;
    status: "active" | "suspended";
    points_per_egp: number;
    redemption_points: number;
    redemption_value_egp: number;
    redeemable_credit_egp: number;
  };
  stats: {
    store_sales_count: number;
    online_orders_count: number;
    store_sales_total: number;
    online_orders_total: number;
  };
  ledger: Array<{
    id: string;
    entry_type: "earn" | "redeem" | "reversal" | "adjustment" | "bonus";
    points_delta: number;
    value_egp: number | null;
    source_type: string;
    source_id: string | null;
    branch_id: string | null;
    branch_name: string | null;
    reference: string | null;
    created_at: string;
  }>;
  purchases: Array<{
    id: string;
    source_channel: "store" | "online";
    reference: string | null;
    status: string;
    total: number;
    payment_method: string | null;
    payment_status?: string | null;
    branch_id: string | null;
    branch_name: string | null;
    loyalty_points_earned: number;
    created_at: string;
    item_count: number;
  }>;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

export async function fetchStaffCustomerLoyaltyProfile(customerId: string, branchId?: string | null) {
  const { data, error } = await rpc("get_staff_customer_loyalty_profile", {
    p_customer_id: customerId,
    p_branch_id: branchId || null,
  });
  if (error) throw error;
  return data as StaffCustomerLoyaltyProfile;
}
