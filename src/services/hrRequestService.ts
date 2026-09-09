import { supabase } from "@/integrations/supabase/client";

export type HrRequestType = "leave" | "salary_advance" | "attendance_correction";
export type HrRequestStatus = "pending" | "in_review" | "approved" | "rejected" | "cancelled" | "fulfilled";
export type HrLeaveType = "annual" | "casual" | "sick" | "unpaid" | "other";
export type HrAttendanceCorrectionType = "missed_check_in" | "missed_check_out" | "time_correction" | "other";

export type HrLeavePayload = {
  leave_type: HrLeaveType;
  start_date: string;
  end_date: string;
  partial_day?: "none" | "first_half" | "second_half";
};

export type HrSalaryAdvancePayload = {
  amount: number;
  repayment_months: number;
};

export type HrAttendanceCorrectionPayload = {
  attendance_date: string;
  correction_type: HrAttendanceCorrectionType;
  requested_check_in?: string | null;
  requested_check_out?: string | null;
  attendance_session_id?: string | null;
};

export type HrRequestPayload = HrLeavePayload | HrSalaryAdvancePayload | HrAttendanceCorrectionPayload;

export type HrRequest = {
  id: string;
  branch_id: string;
  branch_name: string;
  request_type: HrRequestType;
  status: HrRequestStatus;
  reason: string;
  payload: Record<string, unknown>;
  approved_payload?: Record<string, unknown> | null;
  requested_at: string;
  reviewed_at?: string | null;
  decision_note?: string | null;
  cancelled_at?: string | null;
  fulfilled_at?: string | null;
};

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function hrRequestError(message?: string) {
  const value = message || "";
  if (value.includes("Could not find the function") || value.includes("PGRST202")) {
    return new Error("خدمة طلبات الموارد البشرية لم يتم تفعيلها على الخادم بعد.");
  }
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجّل الدخول مرة أخرى.");
  if (value.includes("HR_BRANCH_ACCESS_DENIED")) return new Error("الفرع الحالي خارج نطاق صلاحيتك.");
  if (value.includes("HR_ACTIVE_STAFF_REQUIRED")) return new Error("الحساب الحالي غير مؤهل لإرسال طلبات الموظفين.");
  if (value.includes("HR_REASON_REQUIRED")) return new Error("اكتب سببًا واضحًا للطلب.");
  if (value.includes("HR_PENDING_REQUEST_EXISTS")) return new Error("لديك طلب معلق من نفس النوع. انتظر مراجعته أو ألغِه أولًا.");
  if (value.includes("HR_INVALID_LEAVE_DATES")) return new Error("راجع تاريخ بداية ونهاية الإجازة.");
  if (value.includes("HR_INVALID_LEAVE_TYPE")) return new Error("نوع الإجازة غير صحيح.");
  if (value.includes("HR_INVALID_ADVANCE_AMOUNT")) return new Error("قيمة السلفة يجب أن تكون أكبر من صفر.");
  if (value.includes("HR_INVALID_REPAYMENT_MONTHS")) return new Error("مدة سداد السلفة يجب أن تكون من شهر إلى 12 شهرًا.");
  if (value.includes("HR_ATTENDANCE_DATE_REQUIRED")) return new Error("حدد يوم الحضور المطلوب تصحيحه.");
  if (value.includes("HR_INVALID_CORRECTION_TYPE")) return new Error("نوع تصحيح الحضور غير صحيح.");
  if (value.includes("HR_REQUEST_NOT_CANCELLABLE")) return new Error("هذا الطلب لم يعد قابلًا للإلغاء.");
  return new Error(message || "تعذر تنفيذ طلب الموارد البشرية.");
}

export async function getMyHrRequests(branchId?: string | null, limit = 50): Promise<HrRequest[]> {
  const { data, error } = await rpc("get_my_hr_requests_v1", {
    p_branch_id: branchId || null,
    p_limit: limit,
  });
  if (error) throw hrRequestError(error.message);
  const items = (data as { items?: unknown[] } | null)?.items;
  return Array.isArray(items) ? items as HrRequest[] : [];
}

export async function submitMyHrRequest(
  branchId: string,
  requestType: HrRequestType,
  payload: HrRequestPayload,
  reason: string,
): Promise<{ ok: boolean; request_id: string; review_task_id: string; status: HrRequestStatus }> {
  const { data, error } = await rpc("submit_my_hr_request_v1", {
    p_branch_id: branchId,
    p_request_type: requestType,
    p_payload: payload as unknown as Record<string, unknown>,
    p_reason: reason.trim(),
  });
  if (error) throw hrRequestError(error.message);
  return data as { ok: boolean; request_id: string; review_task_id: string; status: HrRequestStatus };
}

export async function cancelMyHrRequest(requestId: string): Promise<{ ok: boolean; request_id: string; status: HrRequestStatus }> {
  const { data, error } = await rpc("cancel_my_hr_request_v1", { p_request_id: requestId });
  if (error) throw hrRequestError(error.message);
  return data as { ok: boolean; request_id: string; status: HrRequestStatus };
}
