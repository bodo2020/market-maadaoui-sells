import { supabase } from "@/integrations/supabase/client";

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

export type GrowthITAccountBranch = {
  branch_id: string | null;
  branch_name: string | null;
  role: string | null;
  active: boolean;
  is_primary: boolean;
  pos_enabled: boolean;
};

export type GrowthITAccount = {
  id: string;
  name: string | null;
  username: string | null;
  role: string | null;
  active: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
  auth_email: string | null;
  branches: GrowthITAccountBranch[];
};

export type GrowthITPosDrawer = {
  device_id: string;
  branch_id: string | null;
  branch_name: string | null;
  device_code: string | null;
  device_name: string;
  device_active: boolean;
  last_seen_at: string | null;
  revoked_at: string | null;
  online: boolean;
  shift_id: string | null;
  cashier_user_id: string | null;
  cashier_name: string | null;
  cashier_username: string | null;
  opened_at: string | null;
  shift_status: string | null;
  drawer_account_id: string | null;
  drawer_account_name: string | null;
  drawer_balance: number | null;
};

export type GrowthITSuperAdminCenter = {
  is_super_admin: boolean;
  accounts: GrowthITAccount[];
  pos_drawers: GrowthITPosDrawer[];
  generated_at: string;
};

export type ShiftReconciliationMethod = {
  code: string;
  name: string;
  method_type?: string | null;
  expected_amount: number;
  expected_source?: string | null;
  sale_count?: number | null;
};

export type ShiftReconciliationPreview = {
  version?: number;
  status: string;
  shift_id: string;
  branch_id: string;
  device_id: string;
  cashier_id: string;
  opened_at: string;
  generated_at: string;
  methods: ShiftReconciliationMethod[];
};

export async function fetchGrowthITSuperAdminCenter(): Promise<GrowthITSuperAdminCenter> {
  const { data, error } = await rpc("get_growth_it_super_admin_v1");
  if (error) throw new Error(error.message || "تعذر تحميل حسابات الموظفين والورديات");
  const raw = (data || {}) as Partial<GrowthITSuperAdminCenter>;
  return {
    is_super_admin: raw.is_super_admin === true,
    accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
    pos_drawers: Array.isArray(raw.pos_drawers) ? raw.pos_drawers : [],
    generated_at: raw.generated_at || new Date().toISOString(),
  };
}

export async function resetGrowthITStaffPassword(input: {
  targetUserId: string;
  newPassword: string;
  reason?: string | null;
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke("admin-reset-staff-password", {
    body: {
      target_user_id: input.targetUserId,
      new_password: input.newPassword,
      reason: input.reason?.trim() || null,
    },
  });
  if (error) throw new Error(error.message || "تعذر تجديد كلمة المرور");
  const result = (data || {}) as { ok?: boolean; error?: string };
  if (result.ok !== true) throw new Error(result.error || "تعذر تجديد كلمة المرور");
}

export async function fetchManagerShiftReconciliationPreview(shiftId: string): Promise<ShiftReconciliationPreview> {
  const { data, error } = await rpc("get_manager_pos_shift_reconciliation_preview", {
    p_shift_id: shiftId,
  });
  if (error) throw new Error(error.message || "تعذر تحميل تسوية الوردية");
  return data as ShiftReconciliationPreview;
}

export async function closeManagerPosShiftV2(input: {
  shiftId: string;
  reconciliation: Array<{ code: string; counted_amount: number; variance_reason: string | null }>;
  notes: string;
}): Promise<void> {
  const { error } = await rpc("manager_close_pos_shift_v2", {
    p_shift_id: input.shiftId,
    p_reconciliation: input.reconciliation,
    p_notes: input.notes.trim(),
  });
  if (error) throw new Error(error.message || "تعذر إنهاء الوردية");
}
