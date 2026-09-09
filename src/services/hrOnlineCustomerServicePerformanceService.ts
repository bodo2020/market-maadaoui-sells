import { supabase } from "@/integrations/supabase/client";

export interface HrOnlineCustomerServicePerformance {
  applicable: boolean;
  period: { from: string; to: string };
  employee: {
    id: string;
    name: string;
    role: string;
    employee_code?: string | null;
    department_name?: string | null;
    job_title_name?: string | null;
  };
  orders: {
    status_transitions: number;
    handled_orders: number;
    confirmed: number;
    preparing: number;
    ready: number;
    shipped: number;
    delivered: number;
    cancelled: number;
    handled_orders_with_returns: number;
    first_response_samples: number;
    avg_first_response_minutes: number | null;
    preparation_samples: number;
    avg_preparation_minutes: number | null;
    sla: {
      enabled: boolean;
      rate: number | null;
      overall_rate: number | null;
      first_response_rate: number | null;
      preparation_rate: number | null;
      evaluated_samples: number;
      first_response_target_minutes: number;
      preparation_target_minutes: number;
      reason: string | null;
    };
  };
  customer_service: {
    created_by_employee: number;
    assigned: number;
    assigned_closed: number;
    assigned_closed_by_employee: number;
    assigned_closed_by_other: number;
    completion_rate: number | null;
    completed_by_employee: number;
    scheduled_due: number;
    completed_late_assigned: number;
    overdue_open: number;
    avg_assigned_lifecycle_minutes: number | null;
    outcomes: Record<string, number>;
  };
  notes: string[];
}

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  params?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

export async function getHrOnlineCustomerServicePerformance(params: {
  employeeId: string;
  branchId: string;
  from: string;
  to: string;
}): Promise<HrOnlineCustomerServicePerformance> {
  const { data, error } = await rpc("get_hr_online_customer_service_performance_v1", {
    p_employee_id: params.employeeId,
    p_branch_id: params.branchId,
    p_from: params.from,
    p_to: params.to,
  });

  if (error) {
    const text = error.message || "";
    if (text.includes("permission_denied")) throw new Error("ليس لديك صلاحية عرض مؤشرات الطلبات وخدمة العملاء للموظف.");
    if (text.includes("employee_out_of_scope")) throw new Error("الموظف خارج نطاق الفرع الحالي.");
    if (text.includes("date_range_too_large")) throw new Error("الفترة القصوى لعرض المؤشرات سنة واحدة.");
    if (text.includes("invalid_date_range")) throw new Error("الفترة الزمنية غير صحيحة.");
    throw new Error(text || "تعذر تحميل مؤشرات الطلبات وخدمة العملاء.");
  }

  return data as HrOnlineCustomerServicePerformance;
}
