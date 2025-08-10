
import { supabase } from "@/integrations/supabase/client";

export interface BranchSalesSummary {
  branch_id: string | null;
  branch_name: string | null;
  sales_count: number;
  total_sales: number;
  total_profit: number;
}

export interface TopProductRow {
  branch_id: string | null;
  branch_name: string | null;
  product_id: string | null;
  product_name: string | null;
  qty_sold: number;
  total_sales: number;
}

function toIsoOrNull(d?: Date | null) {
  if (!d) return null;
  const dd = new Date(d);
  return dd.toISOString();
}

export async function fetchSalesSummaryByBranch(params?: { startDate?: Date | null; endDate?: Date | null }) {
  const { startDate, endDate } = params || {};
  const { data, error } = await supabase.rpc("sales_summary_by_branch", {
    p_start: toIsoOrNull(startDate),
    p_end: toIsoOrNull(endDate),
  });

  if (error) {
    console.error("fetchSalesSummaryByBranch error:", error);
    return [] as BranchSalesSummary[];
  }

  // Normalize numeric types
  return (data || []).map((row: any) => ({
    branch_id: row.branch_id ?? null,
    branch_name: row.branch_name ?? null,
    sales_count: Number(row.sales_count ?? 0),
    total_sales: Number(row.total_sales ?? 0),
    total_profit: Number(row.total_profit ?? 0),
  })) as BranchSalesSummary[];
}

export async function fetchTopProductsByBranch(params: {
  branchId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  limit?: number;
}) {
  const { branchId, startDate, endDate, limit = 10 } = params;
  const { data, error } = await supabase.rpc("top_products_by_branch", {
    p_branch: branchId ?? null,
    p_start: toIsoOrNull(startDate),
    p_end: toIsoOrNull(endDate),
    p_limit: limit,
  });

  if (error) {
    console.error("fetchTopProductsByBranch error:", error);
    return [] as TopProductRow[];
  }

  return (data || []).map((row: any) => ({
    branch_id: row.branch_id ?? null,
    branch_name: row.branch_name ?? null,
    product_id: row.product_id ?? null,
    product_name: row.product_name ?? null,
    qty_sold: Number(row.qty_sold ?? 0),
    total_sales: Number(row.total_sales ?? 0),
  })) as TopProductRow[];
}
