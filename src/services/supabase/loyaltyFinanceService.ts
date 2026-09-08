import { supabase } from "@/integrations/supabase/client";
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import type { PeriodType } from "@/services/supabase/financeService";

export type LoyaltyFinancialSummary = {
  from: string;
  to: string;
  pos: {
    subtotal: number;
    product_discounts: number;
    sales_after_product_discounts: number;
    loyalty_discounts: number;
    net_sales_before_returns: number;
    profit_after_loyalty: number;
    cash_collected: number;
    card_collected: number;
    invoice_count: number;
  };
  online: {
    sales_total: number;
    loyalty_discounts: number;
    net_sales_before_returns: number;
    order_count: number;
  };
  returns: {
    gross_returns: number;
    loyalty_restored: number;
    cash_refunds: number;
    card_refunds: number;
    net_customer_refunds: number;
    profit_impact_before_loyalty_restore: number;
    profit_impact_after_loyalty_restore: number;
    return_count: number;
  };
  totals: {
    gross_sales: number;
    product_discounts: number;
    loyalty_discounts_gross: number;
    loyalty_discounts_net: number;
    sales_after_loyalty_before_returns: number;
    net_sales_after_returns: number;
    pos_profit_after_returns: number;
    actual_tender_before_refunds: number;
  };
  loyalty: {
    points_earned: number;
    points_converted: number;
    coupons_created_value: number;
    coupons_used_value: number;
    coupons_restored_value: number;
    coupons_outstanding_value: number;
  };
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

function getRange(period: PeriodType, startDate?: Date, endDate?: Date) {
  const now = new Date();
  if (period === "custom" && startDate && endDate) {
    return { from: startOfDay(startDate), to: endOfDay(endDate) };
  }
  switch (period) {
    case "day":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "week":
      return {
        from: startOfWeek(now, { weekStartsOn: 6 }),
        to: endOfWeek(now, { weekStartsOn: 6 }),
      };
    case "quarter": {
      const from = startOfMonth(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1));
      const to = endOfMonth(new Date(from.getFullYear(), from.getMonth() + 2, 1));
      return { from, to };
    }
    case "year":
      return { from: startOfYear(now), to: endOfYear(now) };
    case "month":
    default:
      return { from: startOfMonth(now), to: endOfMonth(now) };
  }
}

export async function fetchLoyaltyFinancialSummary(
  period: PeriodType = "month",
  startDate?: Date,
  endDate?: Date,
  branchId?: string,
): Promise<LoyaltyFinancialSummary> {
  const range = getRange(period, startDate, endDate);
  const { data, error } = await rpc("get_loyalty_financial_summary", {
    p_branch_id: branchId || null,
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
  });
  if (error) throw new Error(error.message || "تعذر تحميل ملخص الولاء المالي");
  if (!data || typeof data !== "object") throw new Error("لم يصل ملخص الولاء المالي");
  return data as LoyaltyFinancialSummary;
}
