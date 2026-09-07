import { supabase } from "@/integrations/supabase/client";

export type BranchPendingPosCardRefund = {
  id: string;
  return_id: string;
  sale_id: string;
  invoice_number: string;
  amount: number;
  status: "pending";
  created_at: string;
  employee_name: string | null;
  device_name: string | null;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

export async function listBranchPendingPosCardRefunds(branchId: string): Promise<BranchPendingPosCardRefund[]> {
  const { data, error } = await rpc("list_branch_pending_pos_card_refunds", { p_branch_id: branchId });
  if (error) {
    if (error.message?.includes("REFUND_PERMISSION_DENIED")) return [];
    throw new Error(error.message || "تعذر تحميل ردود البطاقة المعلقة");
  }
  return (Array.isArray(data) ? data : []) as BranchPendingPosCardRefund[];
}
