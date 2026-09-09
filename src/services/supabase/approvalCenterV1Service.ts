import { supabase } from "@/integrations/supabase/client";

export type ApprovalScope = "pending" | "mine" | "overdue" | "completed" | "all";

export type ApprovalCenterSummary = {
  pending: number;
  mine: number;
  overdue: number;
  critical: number;
  inventory: number;
  finance: number;
  transfers: number;
  completed_today: number;
};

export type ApprovalItem = {
  id: string;
  branch_id: string;
  task_type: string;
  source_kind: string;
  source_id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  amount: number;
  claimed_by?: string | null;
  claimed_by_name?: string | null;
  claimed_at?: string | null;
  started_at?: string | null;
  completed_by?: string | null;
  completed_by_name?: string | null;
  completed_at?: string | null;
  due_at?: string | null;
  failure_reason?: string | null;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown> | null;
  is_mine: boolean;
  can_claim: boolean;
  can_decide: boolean;
  is_overdue: boolean;
  decision?: string | null;
  resolution_note?: string | null;
  action_url?: string | null;
};

export type ApprovalCenterResponse = {
  version: number;
  branch_id: string;
  scope: ApprovalScope;
  generated_at: string;
  summary: ApprovalCenterSummary;
  items: ApprovalItem[];
};

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function approvalError(message?: string) {
  const value = message || "";
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجّل الدخول مرة أخرى.");
  if (value.includes("APPROVAL_BRANCH_ACCESS_DENIED")) return new Error("الفرع الحالي خارج نطاق صلاحيتك.");
  if (value.includes("INVALID_APPROVAL_SCOPE")) return new Error("فلتر الموافقات غير صحيح.");
  return new Error(message || "تعذر تحميل مركز الموافقات.");
}

export async function fetchApprovalCenterV1(branchId: string, scope: ApprovalScope = "pending", limit = 100): Promise<ApprovalCenterResponse> {
  const { data, error } = await rpc("get_approval_center_v1", {
    p_branch_id: branchId,
    p_scope: scope,
    p_limit: limit,
  });
  if (error) throw approvalError(error.message);
  const raw = (data || {}) as Partial<ApprovalCenterResponse>;
  return {
    version: Number(raw.version || 1),
    branch_id: String(raw.branch_id || branchId),
    scope: (raw.scope || scope) as ApprovalScope,
    generated_at: String(raw.generated_at || new Date().toISOString()),
    summary: {
      pending: Number(raw.summary?.pending || 0),
      mine: Number(raw.summary?.mine || 0),
      overdue: Number(raw.summary?.overdue || 0),
      critical: Number(raw.summary?.critical || 0),
      inventory: Number(raw.summary?.inventory || 0),
      finance: Number(raw.summary?.finance || 0),
      transfers: Number(raw.summary?.transfers || 0),
      completed_today: Number(raw.summary?.completed_today || 0),
    },
    items: Array.isArray(raw.items) ? raw.items : [],
  };
}
