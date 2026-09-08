import { supabase } from "@/integrations/supabase/client";
import type { CustomerManagementRow } from "@/services/supabase/customerManagementService";

export type Customer360Profile = {
  customer: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    phone_verified: boolean;
    created_at: string;
  };
  loyalty: {
    status: string;
    barcode_token: string;
    points_balance: number;
    points_per_egp: number;
    membership_number: string;
    redemption_points: number;
    redemption_value_egp: number;
    redeemable_credit_egp: number;
    lifetime_points_earned: number;
    lifetime_points_redeemed: number;
  };
  stats: {
    store_sales_count: number;
    store_sales_total: number;
    online_orders_count: number;
    online_orders_total: number;
  };
  management: CustomerManagementRow;
  engagement: {
    returns_count: number;
    last_return_at: string | null;
    vouchers_count: number;
    addresses_count: number;
    cart_updated_at: string | null;
    favorites_count: number;
    cart_items_count: number;
    customer_age_days: number;
    days_since_last_purchase: number | null;
  };
  purchases: Array<{
    id: string;
    total: number;
    status: string;
    branch_id: string | null;
    reference: string | null;
    created_at: string;
    item_count: number;
    branch_name: string | null;
    payment_method: string;
    payment_status?: string;
    source_channel: "store" | "online";
    loyalty_points_earned: number;
  }>;
  ledger: Array<{
    id: string;
    entry_type: string;
    points_delta: number;
    value_egp: number;
    source_type: string;
    reference: string | null;
    branch_name: string | null;
    created_at: string;
  }>;
  vouchers: Array<{
    id: string;
    status: string;
    voucher_code: string;
    barcode_token: string;
    initial_value_egp: number;
    remaining_value_egp: number;
    points_spent: number;
    expires_at: string | null;
    last_used_at: string | null;
    created_at: string;
  }>;
  addresses: Array<{
    id: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    is_default: boolean;
    is_deliverable: boolean;
    distance_km: number | null;
    road_distance_km: number | null;
    road_duration_minutes: number | null;
    assigned_branch_id: string | null;
    assigned_branch_name: string | null;
    created_at: string;
    updated_at: string;
  }>;
  favorites: Array<{
    id: string;
    product_id: string;
    variant_id: string | null;
    product_name: string | null;
    variant_name: string | null;
    product_image: string | null;
    variant_image: string | null;
    created_at: string;
  }>;
  cart: Array<{
    id: string;
    product_id: string;
    quantity: number;
    metadata: Record<string, unknown> | null;
    product_name: string | null;
    product_image: string | null;
    unit_price: number;
    created_at: string;
    updated_at: string;
  }>;
  returns: Array<{
    id: string;
    source: string;
    sale_id: string | null;
    order_id: string | null;
    branch_name: string | null;
    total_amount: number;
    refund_cash_amount: number;
    refund_card_amount: number;
    refund_loyalty_amount: number;
    reason: string | null;
    status: string;
    refund_status: string;
    item_count: number;
    created_at: string;
  }>;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

export async function fetchCustomer360(customerId: string, branchId?: string | null): Promise<Customer360Profile> {
  const { data, error } = await rpc("get_customer_360_overview", {
    p_customer_id: customerId,
    p_branch_id: branchId || null,
  });
  if (error) {
    if (error.message?.includes("CUSTOMER_ACCESS_DENIED")) throw new Error("ليس لديك صلاحية عرض بيانات هذا العميل.");
    if (error.message?.includes("CUSTOMER_NOT_FOUND")) throw new Error("العميل غير موجود.");
    throw new Error(error.message || "تعذر تحميل ملف العميل.");
  }
  if (!data || typeof data !== "object") throw new Error("لم تصل بيانات ملف العميل.");
  return data as Customer360Profile;
}
