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
    outside_require_live_photo: boolean;
    outside_require_phone_verification: boolean;
    verification_photo_retention_minutes: number;
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
    phone_verified_at?: string | null;
    has_verification_photo?: boolean;
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
  requires_live_photo?: boolean;
  requires_phone_verification?: boolean;
  verification_method?: string;
  photo_cleanup_required?: boolean;
  verification_photo_path?: string | null;
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
  verification_photo_path?: string | null;
  verification_photo_sha256?: string | null;
  verification_photo_captured_at?: string | null;
  phone_verified_at?: string | null;
  phone_verification_method?: string | null;
  verification_photo_deleted_at?: string | null;
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
  verificationPhotoPath?: string | null;
  verificationPhotoSha256?: string | null;
}): Promise<AttendanceActionResult> {
  const device = getLocalTrustedStaffDevice();
  const { data, error } = await rpc("staff_attendance_check_in_v2", {
    p_branch_id: params.branchId,
    p_device_id: device?.device_id || null,
    p_device_token: device?.device_token || null,
    p_attendance_mode: params.mode,
    p_latitude: params.latitude ?? null,
    p_longitude: params.longitude ?? null,
    p_accuracy_m: params.accuracyM ?? null,
    p_exception_reason: params.exceptionReason || null,
    p_verification_photo_path: params.verificationPhotoPath || null,
    p_verification_photo_sha256: params.verificationPhotoSha256 || null,
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

export async function verifyAttendancePhoneByPin(pin: string): Promise<{ ok: boolean; verified_at?: string; error?: string; remaining_attempts?: number; locked_until?: string }> {
  const { data, error } = await rpc("verify_my_staff_app_pin_v1", { p_pin: pin });
  if (error) throw new Error(error.message || "تعذر التحقق من الهاتف");
  return (data || { ok: false, error: "PHONE_VERIFICATION_FAILED" }) as { ok: boolean; verified_at?: string; error?: string; remaining_attempts?: number; locked_until?: string };
}

async function sha256Hex(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function uploadAttendanceVerificationPhoto(params: { branchId: string; employeeId: string; blob: Blob }) {
  const ext = params.blob.type === "image/png" ? "png" : params.blob.type === "image/webp" ? "webp" : "jpg";
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${params.branchId}/${params.employeeId}/${id}.${ext}`;
  const sha256 = await sha256Hex(params.blob);
  const { error } = await supabase.storage.from("hr_attendance_verification").upload(path, params.blob, {
    contentType: params.blob.type || "image/jpeg",
    cacheControl: "0",
    upsert: false,
  });
  if (error) throw new Error(error.message || "تعذر رفع صورة التحقق");
  return { path, sha256 };
}

export async function getAttendanceVerificationPhotoUrl(path: string, expiresIn = 300) {
  const { data, error } = await supabase.storage.from("hr_attendance_verification").createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw new Error(error?.message || "تعذر فتح صورة التحقق");
  return data.signedUrl;
}

export async function removeAttendanceVerificationPhoto(path: string) {
  const { error } = await supabase.storage.from("hr_attendance_verification").remove([path]);
  if (error) throw new Error(error.message || "تعذر حذف صورة التحقق");
}

export async function markAttendanceVerificationPhotoDeleted(exceptionId: string) {
  const { data, error } = await rpc("mark_attendance_verification_photo_deleted_v1", { p_exception_id: exceptionId });
  if (error) throw new Error(error.message || "تعذر توثيق حذف صورة التحقق");
  return data as { ok: boolean; exception_id: string; photo_deleted_at: string };
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
  return data as { ok: boolean; code: string; exception_id: string; decision: string; attendance_session_id?: string | null; verification_photo_path?: string | null; photo_cleanup_required?: boolean };
}

export async function decideAttendanceExceptionAndCleanupPhoto(exceptionId: string, decision: "approved" | "rejected", note?: string) {
  const result = await decideAttendanceException(exceptionId, decision, note);
  if (!result.ok || !result.photo_cleanup_required || !result.verification_photo_path) return { ...result, photo_cleanup_ok: true };
  try {
    await removeAttendanceVerificationPhoto(result.verification_photo_path);
    await markAttendanceVerificationPhotoDeleted(exceptionId);
    return { ...result, photo_cleanup_ok: true };
  } catch (error) {
    console.warn("Attendance verification photo cleanup failed", error);
    return { ...result, photo_cleanup_ok: false };
  }
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
