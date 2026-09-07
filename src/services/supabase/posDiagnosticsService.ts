import { supabase } from "@/integrations/supabase/client";
import { getLocalPosDevice } from "@/services/supabase/posDeviceService";

export type PosOperationalSeverity = "info" | "warning" | "error" | "critical";

export type PosOperationalEvent = {
  id: string;
  branch_id: string;
  device_id: string | null;
  device_name: string | null;
  device_code: string | null;
  user_id: string | null;
  employee_name: string | null;
  shift_id: string | null;
  event_type: string;
  severity: PosOperationalSeverity;
  message_code: string | null;
  details: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

function safeDetails(details?: Record<string, unknown>) {
  if (!details) return {};
  const blocked = new Set(["device_token", "token", "password", "pin", "access_token", "refresh_token"]);
  return Object.fromEntries(Object.entries(details).filter(([key]) => !blocked.has(key.toLowerCase())));
}

export async function logPosOperationalEvent(
  branchId: string,
  eventType: string,
  severity: PosOperationalSeverity,
  messageCode?: string | null,
  details?: Record<string, unknown>,
) {
  const device = getLocalPosDevice(branchId);
  if (!device) return null;

  const { data, error } = await rpc("log_pos_operational_event", {
    p_device_id: device.device_id,
    p_device_token: device.device_token,
    p_event_type: eventType,
    p_severity: severity,
    p_message_code: messageCode || null,
    p_details: safeDetails(details),
  });
  if (error) return null;
  return data ? String(data) : null;
}

export async function listBranchPosOperationalEvents(
  branchId: string,
  severity?: PosOperationalSeverity | null,
  limit = 80,
): Promise<PosOperationalEvent[]> {
  const { data, error } = await rpc("list_branch_pos_operational_events", {
    p_branch_id: branchId,
    p_limit: limit,
    p_severity: severity || null,
  });
  if (error) throw new Error(error.message || "تعذر تحميل سجل صحة POS");
  return (Array.isArray(data) ? data : []) as PosOperationalEvent[];
}
