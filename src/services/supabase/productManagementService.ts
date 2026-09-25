import { supabase } from "@/integrations/supabase/client";
import { barcodeExists, requireCurrentBranchId } from "@/services/supabase/productEditorService";

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

export type ProductManagementStats = {
  total_products: number;
  in_stock_products: number;
  low_stock_products: number;
  out_of_stock_products: number;
  offer_products: number;
  active_sale_units: number;
  inactive_sale_units: number;
  legacy_bulk_unresolved: number;
  operational_branch_id: string;
  inventory_branch_id: string;
  pricing_branch_id: string;
};

export type LegacyBulkReviewRow = {
  id: string;
  name: string;
  barcode: string | null;
  bulk_barcode: string | null;
  bulk_quantity: number;
  bulk_price: number;
  quantity: number;
  image_url: string | null;
  issue: "missing_barcode" | "barcode_conflict" | "needs_review";
};

export type ProductManagementFilters = {
  search?: string;
  companyId?: string | null;
  categoryId?: string | null;
  page?: number;
  pageSize?: number;
};

export type BarcodeCatalogFilter = "all" | "ready" | "missing" | "scale";

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

function productManagementError(message?: string) {
  if (message?.includes("BRANCH_ACCESS_DENIED")) {
    return new Error("ليس لديك صلاحية إدارة منتجات الفرع الحالي.");
  }
  return new Error(message || "تعذر تحميل بيانات المنتجات.");
}

export async function fetchProductManagementStats(): Promise<ProductManagementStats> {
  const branchId = requireCurrentBranchId();
  const { data, error } = await rpc("get_product_management_stats", {
    p_branch_id: branchId,
  });

  if (error) throw productManagementError(error.message);
  if (!data || typeof data !== "object") throw new Error("تعذر قراءة إحصائيات المنتجات.");
  return data as ProductManagementStats;
}

export async function fetchLegacyBulkReviewQueue(): Promise<LegacyBulkReviewRow[]> {
  const branchId = requireCurrentBranchId();
  const { data, error } = await rpc("get_legacy_bulk_review_queue", {
    p_branch_id: branchId,
  });

  if (error) throw productManagementError(error.message);
  return (Array.isArray(data) ? data : []) as LegacyBulkReviewRow[];
}

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

  if (error) throw productManagementError(error.message);

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


function matchesBarcodeFilter(row: ProductManagementRow, filter: BarcodeCatalogFilter) {
  if (filter === "ready") return Boolean(row.barcode?.trim());
  if (filter === "missing") return !row.barcode?.trim();
  if (filter === "scale") return row.barcode_type === "scale";
  return true;
}

export async function fetchBarcodeManagementPage(input: {
  search?: string;
  filter?: BarcodeCatalogFilter;
  page?: number;
  pageSize?: number;
}) {
  const filter = input.filter || "all";
  if (filter === "all") {
    return fetchProductManagementPage({
      search: input.search,
      page: input.page,
      pageSize: input.pageSize,
    });
  }

  // The product-management RPC currently exposes search/category/company only.
  // Pull its paged result set, then filter before pagination so counts/pages stay correct.
  const allRows = await fetchAllProductManagementRows({ search: input.search });
  const filtered = allRows.filter(row => matchesBarcodeFilter(row, filter));
  const pageSize = Math.min(200, Math.max(10, Number(input.pageSize || 50)));
  const page = Math.max(1, Number(input.page || 1));
  const offset = (page - 1) * pageSize;

  return {
    rows: filtered.slice(offset, offset + pageSize),
    total: filtered.length,
    page,
    pageSize,
  };
}

function ean13Checksum(first12: string) {
  const digits = first12.split("").map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

function candidateInternalBarcode() {
  const time = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 100).toString().padStart(2, "0");
  const first12 = `29${time}${random}`;
  return first12 + ean13Checksum(first12);
}

export async function assignInternalBarcode(row: ProductManagementRow) {
  requireCurrentBranchId();
  if (row.barcode?.trim()) return row.barcode.trim();
  if (row.barcode_type === "scale") {
    throw new Error("منتجات الميزان تحتاج باركود ميزان/PLU ولا يتم إنشاء باركود داخلي عادي لها تلقائيًا.");
  }

  let barcode = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = candidateInternalBarcode();
    if (!(await barcodeExists(candidate, row.record_type === "product" ? row.id : null))) {
      barcode = candidate;
      break;
    }
  }
  if (!barcode) throw new Error("تعذر إنشاء باركود فريد. حاول مرة أخرى.");

  const table = row.record_type === "sale_unit" ? "product_variants" : "products";
  const { data, error } = await supabase
    .from(table)
    .update({ barcode })
    .eq("id", row.id)
    .select("id, barcode")
    .single();

  if (error) {
    if (String(error.message || "").includes("duplicate")) {
      throw new Error("الباركود المولد مستخدم بالفعل. حاول مرة أخرى.");
    }
    throw productManagementError(error.message);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("catalog:changed", { detail: { branchId: requireCurrentBranchId() } }));
  }
  return String((data as { barcode?: string | null } | null)?.barcode || barcode);
}
