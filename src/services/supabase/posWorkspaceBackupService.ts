import { supabase } from "@/integrations/supabase/client";
import type { POSTab } from "@/types";

export type PosWorkspaceBackup = {
  tabs: POSTab[];
  active_tab_id: string | null;
  device_id: string | null;
  updated_at: string;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

export async function getMyPosWorkspace(branchId: string): Promise<PosWorkspaceBackup | null> {
  const { data, error } = await rpc("get_my_pos_workspace", { p_branch_id: branchId });
  if (error) throw new Error(error.message || "تعذر استرجاع نسخة السلات الاحتياطية");
  if (!data || typeof data !== "object") return null;
  const row = data as PosWorkspaceBackup;
  if (!Array.isArray(row.tabs)) return null;
  return row;
}

export async function saveMyPosWorkspace(
  branchId: string,
  deviceId: string | null,
  tabs: POSTab[],
  activeTabId: string | null,
) {
  const { error } = await rpc("save_my_pos_workspace", {
    p_branch_id: branchId,
    p_device_id: deviceId,
    p_tabs: tabs,
    p_active_tab_id: activeTabId,
  });
  if (error) throw new Error(error.message || "تعذر حفظ نسخة السلات الاحتياطية");
}

export async function clearMyPosWorkspace(branchId: string) {
  const { error } = await rpc("clear_my_pos_workspace", { p_branch_id: branchId });
  if (error) throw new Error(error.message || "تعذر حذف نسخة السلات الاحتياطية");
}
