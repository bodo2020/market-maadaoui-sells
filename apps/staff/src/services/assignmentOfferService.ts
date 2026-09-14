import { supabase } from "../lib/supabase";

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

function unwrap<T>(result: { data: unknown; error: { message?: string } | null }): T {
  if (result.error) throw new Error(result.error.message || "REQUEST_FAILED");
  return result.data as T;
}

export type PickerAssignmentOffer = {
  offer_id: string;
  order_id: string;
  display_id: string;
  customer_name: string;
  items_total: number;
  predicted_ready_at: string | null;
  recommended_score: number | null;
  expires_at: string;
  seconds_remaining: number;
};

export type PickerAssignmentOfferPayload = {
  mode: "shadow" | "assisted";
  offer_ttl_seconds: number;
  offer: PickerAssignmentOffer | null;
};

export async function getMyPickerAssignmentOffer(branchId: string) {
  return unwrap<PickerAssignmentOfferPayload>(
    await rpc("get_my_picker_assignment_offer_v1", { p_branch_id: branchId }),
  );
}

export async function acceptMyPickerAssignmentOffer(offerId: string) {
  return unwrap<{ ok: boolean; offer_id: string; order_id: string }>(
    await rpc("accept_my_picker_assignment_offer_v1", { p_offer_id: offerId }),
  );
}

export async function declineMyPickerAssignmentOffer(offerId: string, reason = "تخطي من تطبيق الموظفين") {
  return unwrap<{ ok: boolean; offer_id: string; order_id: string; status: string }>(
    await rpc("decline_my_picker_assignment_offer_v1", {
      p_offer_id: offerId,
      p_reason: reason,
    }),
  );
}
