import { supabase } from "@/integrations/supabase/client";
export type CheckoutSnapshot = {
  checkout_version?: number;
  customer_snapshot?: { name?: string; phone?: string };
  shipping_snapshot?: { address?: string; latitude?: number; longitude?: number; governorate?: string; city?: string; area?: string; neighborhood?: string };
};
export const readCheckoutSnapshot = (value: unknown) => (value || {}) as CheckoutSnapshot;
export async function getCheckoutSnapshot(orderId: string) {
  const { data, error } = await supabase.from('online_orders').select('*').eq('id', orderId).single();
  if (error) throw error; // A failed lookup must never cause another stock deduction.
  return readCheckoutSnapshot(data);
}
