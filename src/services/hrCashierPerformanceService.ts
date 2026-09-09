import { supabase } from "@/integrations/supabase/client";

export interface HrCashierPerformance {
  applicable: boolean;
  role: string;
  period: { from: string; to: string };
  sales: {
    invoice_count: number;
    sales_total: number;
    average_ticket: number;
    items_sold: number;
    items_per_invoice: number | null;
    discounts: number;
    loyalty_voucher_amount: number;
    merchant_payment_fees: number;
  };
  returns: {
    approved_count: number;
    approved_amount: number;
    return_amount_pct: number | null;
  };
  shifts: {
    count: number;
    closed_count: number;
    absolute_cash_variance: number;
    absolute_opening_variance: number;
    reconciliation_lines: number;
    variance_lines: number;
    absolute_payment_variance: number;
  };
  notes: string[];
}

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  params?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

export async function getHrCashierPerformance(params: {
  employeeId: string;
  branchId: string;
  from: string;
  to: string;
}): Promise<HrCashierPerformance> {
  const { data, error } = await rpc("get_hr_cashier_performance_v1", {
    p_employee_id: params.employeeId,
    p_branch_id: params.branchId,
    p_from: params.from,
    p_to: params.to,
  });
  if (error) {
    const text = error.message || "";
    if (text.includes("permission_denied")) throw new Error("ليس لديك صلاحية عرض مؤشرات الكاشير.");
    if (text.includes("employee_out_of_scope")) throw new Error("الموظف خارج نطاق الفرع الحالي.");
    throw new Error(text || "تعذر تحميل مؤشرات الكاشير.");
  }
  return data as HrCashierPerformance;
}
