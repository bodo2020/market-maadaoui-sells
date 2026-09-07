import { supabase } from "@/integrations/supabase/client";
import { requireCurrentBranchId } from "@/services/supabase/productEditorService";

export type ProductManagementRow = {
  row_key: string;
  record_type: "product" | "sale_unit";
  id: string;
  base_product_id: string;
  variant_id: string | null;
  name: string;
  barcode: string | null;
  barcode_type: string;
  image_urls: string[];
  price: number;
  purchase_price: number;
  offer_price: number | null;
  is_offer: boolean;
  quantity: number;
  base_quantity: number;
  min_stock_level: number;
  company_id: string | null;
  main_category_id: string | null;
  subcategory_id: string | null;
  unit_of_measure: string | null;
  has_variants: boolean;
  is_linked_sale_unit: boolean;
  active: boolean;
  conversion_factor: number;
  variant_type: string | null;
  parent_name: string | null;
  stock_status: "in" | "low" | "out";
  total_count: number;
};

export type ProductManagementFilters = {
  search?: string;
  companyId?: string | null;
  categoryId?: string | null;
  page?: number;
  pageSize?: number;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

export async function fetchProductManagementPage(filters: ProductManagementFilters = {}) {
  const branchId = requireCurrentBranchId();
  const pageSize = Math.min(200, Math.max(10, Number(filters.pageSize || 50)));
  const page = Math.max(1, Number(filters.page || 1));

  const { data, error } = await rpc("get_product_management_catalog", {
    p_branch_id: branchId,
    p_search: filters.search?.trim() || null,
    p_company_id: filters.companyId || null,
    p_category_id: filters.categoryId || null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });

  if (error) {
    if (error.message?.includes("BRANCH_ACCESS_DENIED")) {
      throw new Error("ليس لديك صلاحية إدارة منتجات الفرع الحالي.");
    }
    throw new Error(error.message || "تعذر تحميل المنتجات.");
  }

  const rows = (Array.isArray(data) ? data : []) as ProductManagementRow[];
  return {
    rows,
    total: Number(rows[0]?.total_count || 0),
    page,
    pageSize,
  };
}

export async function fetchAllProductManagementRows(filters: Omit<ProductManagementFilters, "page" | "pageSize"> = {}) {
  const rows: ProductManagementRow[] = [];
  let page = 1;
  const pageSize = 200;

  while (true) {
    const result = await fetchProductManagementPage({ ...filters, page, pageSize });
    rows.push(...result.rows);
    if (rows.length >= result.total || result.rows.length < pageSize) break;
    page += 1;
    if (page > 50) break;
  }

  return rows;
}
