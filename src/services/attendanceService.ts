import { supabase } from "@/integrations/supabase/client";
import { getLocalTrustedStaffDevice } from "@/services/staffDeviceService";

export type AttendanceMode = "onsite" | "remote" | "field";

export type AttendanceSnapshot = {
  employee: { user_id: string; work_mode: "onsite" | "remote" | "hybrid" | "field"; primary_branch_id: string | null };
  branch_id: string;
  policy: {
    geofence_radius_m: number;
    max_location_accuracy_m: number;
    require_trusted_device: boolean;
    allow_outside_exception: boolean;
    require_location_for_field: boolean;
  };
  schedule: null | {
    shift_template_id: string;
    name_ar: string;
    scheduled_start_at: string;
    scheduled_end_at: string;
    late_grace_minutes: number;
    early_departure_grace_minutes: number;
    break_minutes: number;
  };
  approved_leave: null | {
    id: string;
    request_id: string;
    leave_type: "annual" | "casual" | "sick" | "unpaid" | "other";
    start_date: string;
    end_date: string;
    partial_day: "none" | "first_half" | "second_half";
    approved_at: string;
    coverage: "full_day" | "partial_day";
  };
  active_session: null | {
    id: string;
    branch_id: string;
    branch_name: string;
    work_date: string;
    work_mode: string;
    attendance_mode: AttendanceMode;
    status: string;
    check_in_at: string;
    check_in_location_status: string;
    late_minutes: number;
    scheduled_start_at: string | null;
    scheduled_end_at: string | null;
  };
  pending_exception: null | {
    id: string;
    requested_at: string;
    distance_m: number | null;
    reason: string;
    status: string;
  };
  recent_sessions: Array<{
    id: string;
    branch_id: string;
    branch_name: string;
    work_date: string;
    attendance_mode: AttendanceMode;
    status: string;
    check_in_at: string;
    check_out_at: string | null;
    worked_minutes: number | null;
    late_minutes: number;
    early_departure_minutes: number;
    check_in_location_status: string;
  }>;
  generated_at: string;
};

export type AttendanceActionResult = {
  ok: boolean;
  code: string;
  session_id?: string;
  attendance_mode?: AttendanceMode;
  check_in_at?: string;
  check_out_at?: string;
  distance_m?: number;
  radius_m?: number;
  accuracy_m?: number;
  max_accuracy_m?: number;
  late_minutes?: number;
  worked_minutes?: number;
  early_departure_minutes?: number;
  exception_allowed?: boolean;
  exception_id?: string;
  task_id?: string;
  schedule?: AttendanceSnapshot["schedule"];
};

export type AttendanceException = {
  id: string;
  user_id: string;
  employee_name: string;
  branch_id: string;
  branch_name: string;
  attendance_mode: AttendanceMode;
  requested_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  distance_m: number | null;
  reason: string;
  status: string;
  reviewer_user_id: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  operations_task_id: string | null;
  attendance_session_id: string | null;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

export async function getMyAttendance(branchId?: string | null): Promise<AttendanceSnapshot> {
  const { data, error } = await rpc("get_my_attendance_v1", { p_branch_id: branchId || null });
  if (error) throw new Error(error.message || "تعذر تحميل حالة الحضور");
  return data as AttendanceSnapshot;
}

export async function checkInAttendance(params: {
  branchId: string;
  mode: AttendanceMode;
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
  exceptionReason?: string | null;
}): Promise<AttendanceActionResult> {
  const device = getLocalTrustedStaffDevice();
  const { data, error } = await rpc("staff_attendance_check_in_v1", {
    p_branch_id: params.branchId,
    p_device_id: device?.device_id || null,
    p_device_token: device?.device_token || null,
    p_attendance_mode: params.mode,
    p_latitude: params.latitude ?? null,
    p_longitude: params.longitude ?? null,
    p_accuracy_m: params.accuracyM ?? null,
    p_exception_reason: params.exceptionReason || null,
  });
  if (error) throw new Error(error.message || "تعذر تسجيل الحضور");
  return data as AttendanceActionResult;
}

export async function checkOutAttendance(params: {
  sessionId: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
}): Promise<AttendanceActionResult> {
  const device = getLocalTrustedStaffDevice();
  const { data, error } = await rpc("staff_attendance_check_out_v1", {
    p_session_id: params.sessionId,
    p_device_id: device?.device_id || null,
    p_device_token: device?.device_token || null,
    p_latitude: params.latitude ?? null,
    p_longitude: params.longitude ?? null,
    p_accuracy_m: params.accuracyM ?? null,
  });
  if (error) throw new Error(error.message || "تعذر تسجيل الانصراف");
  return data as AttendanceActionResult;
}

export async function getAttendanceException(exceptionId: string): Promise<AttendanceException | null> {
  const { data, error } = await rpc("get_attendance_exception_v1", { p_exception_id: exceptionId });
  if (error) throw new Error(error.message || "تعذر تحميل طلب الاستثناء");
  return (data || null) as AttendanceException | null;
}

export async function decideAttendanceException(exceptionId: string, decision: "approved" | "rejected", note?: string) {
  const { data, error } = await rpc("decide_attendance_exception_v1", {
    p_exception_id: exceptionId,
    p_decision: decision,
    p_note: note || null,
  });
  if (error) throw new Error(error.message || "تعذر تسجيل قرار الحضور");
  return data as { ok: boolean; code: string; exception_id: string; decision: string; attendance_session_id?: string | null };
}

export function getBrowserLocation(): Promise<{ latitude: number; longitude: number; accuracyM: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("المتصفح لا يدعم تحديد الموقع"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyM: position.coords.accuracy }),
      error => {
        const message = error.code === error.PERMISSION_DENIED
          ? "اسمح للموقع باستخدام GPS لتسجيل الحضور"
          : error.code === error.TIMEOUT
            ? "تعذر تحديد الموقع في الوقت المناسب"
            : "تعذر الحصول على موقع الجهاز";
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}
