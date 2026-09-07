import { supabase } from "@/integrations/supabase/client";

export type ManagedPosShift = {
  id: string;
  user_id: string;
  employee_name: string;
  device_id: string;
  device_name: string;
  device_code: string;
  branch_id: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  cash_difference: number | null;
  closing_notes: string | null;
  sales_count: number;
  sales_total: number;
  cash_sales_total: number;
  card_sales_total: number;
  drawer_balance: number;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

export async function listBranchPosShifts(branchId: string, status?: "open" | "closed" | null): Promise<ManagedPosShift[]> {
  const { data, error } = await rpc("list_branch_pos_shifts", {
    p_branch_id: branchId,
    p_status: status || null,
    p_limit: 50,
  });
  if (error) throw new Error(error.message || "تعذر تحميل ورديات POS");
  return (Array.isArray(data) ? data : []) as ManagedPosShift[];
}

export async function managerClosePosShift(shiftId: string, closingCash: number, notes: string): Promise<ManagedPosShift> {
  const { data, error } = await rpc("manager_close_pos_shift", {
    p_shift_id: shiftId,
    p_closing_cash: closingCash,
    p_notes: notes.trim(),
  });
  if (error) {
    if (error.message === "CLOSING_REASON_REQUIRED") throw new Error("اكتب سبب الإغلاق الإداري.");
    if (error.message === "INVALID_CLOSING_CASH") throw new Error("النقد المعدود غير صحيح.");
    if (error.message === "SHIFT_NOT_OPEN") throw new Error("الوردية اتقفلت بالفعل أو لم تعد متاحة.");
    if (error.message === "PERMISSION_DENIED") throw new Error("ليس لديك صلاحية إدارة ورديات POS.");
    throw new Error(error.message || "تعذر إغلاق الوردية");
  }
  if (!data || typeof data !== "object") throw new Error("لم يصل تأكيد إغلاق الوردية.");
  return data as ManagedPosShift;
}
