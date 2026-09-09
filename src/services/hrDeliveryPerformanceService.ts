import { supabase } from "@/integrations/supabase/client";

export interface HrDeliveryPerformance {
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
  assignments: {
    records: number;
    assigned_in_period: number;
    reassigned_away_in_period: number;
    active_open_orders: number;
  };
  delivery: {
    shipped_orders: number;
    delivered_orders: number;
    cancelled_orders: number;
    delivered_value: number;
    delivered_orders_with_returns: number;
    delivery_duration_samples: number;
    avg_delivery_minutes: number | null;
    pickup_duration_samples: number;
    avg_pickup_minutes: number | null;
  };
  notes: string[];
}

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  params?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

export async function getHrDeliveryPerformance(params: {
  employeeId: string;
  branchId: string;
  from: string;
  to: string;
}): Promise<HrDeliveryPerformance> {
  const { data, error } = await rpc("get_hr_delivery_performance_v1", {
    p_employee_id: params.employeeId,
    p_branch_id: params.branchId,
    p_from: params.from,
    p_to: params.to,
  });

  if (error) {
    const text = error.message || "";
    if (text.includes("permission_denied")) throw new Error("ليس لديك صلاحية عرض أداء التوصيل للموظف.");
    if (text.includes("employee_out_of_scope")) throw new Error("الموظف خارج نطاق الفرع الحالي.");
    if (text.includes("date_range_too_large")) throw new Error("الفترة القصوى لعرض أداء التوصيل سنة واحدة.");
    if (text.includes("invalid_date_range")) throw new Error("الفترة الزمنية غير صحيحة.");
    throw new Error(text || "تعذر تحميل مؤشرات التوصيل.");
  }

  return data as HrDeliveryPerformance;
}
