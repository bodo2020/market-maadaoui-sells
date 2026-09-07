import { supabase } from "@/integrations/supabase/client";
import { requireCurrentBranchId } from "@/services/supabase/productEditorService";
import { invalidatePOSCatalogCache } from "@/services/supabase/posCatalogService";

export type ProductImportMode = "add" | "update" | "upsert";

export type ProductImportRow = {
  row_number: number;
  name?: string;
  barcode?: string;
  parent_barcode?: string;
  description?: string;
  price?: number;
  purchase_price?: number;
  quantity?: number;
  min_stock_level?: number;
  alert_enabled?: boolean;
  offer_price?: number | null;
  is_offer?: boolean;
  barcode_type?: "normal" | "scale" | string;
  unit_of_measure?: string;
  company?: string;
  category?: string;
  subcategory?: string;
  shelf_location?: string;
  expiry_date?: string;
  track_expiry?: boolean;
  image_url?: string;
  variant_type?: string;
  conversion_factor?: number;
  active?: boolean;
  position?: number;
};

export type ProductImportResultRow = {
  row_number: number;
  status: "success" | "error";
  id?: string;
  name?: string;
  barcode?: string;
  message?: string;
};

export type ProductImportResult = {
  total: number;
  success: number;
  failed: number;
  results: ProductImportResultRow[];
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

export function explainImportError(message?: string) {
  const value = message || "";
  if (value.includes("PRODUCT_ALREADY_EXISTS")) return "المنتج موجود بالفعل بهذا الباركود.";
  if (value.includes("PRODUCT_NOT_FOUND")) return "لم يتم العثور على منتج بهذا الباركود للتحديث.";
  if (value.includes("VARIANT_ALREADY_EXISTS")) return "وحدة البيع موجودة بالفعل بهذا الباركود.";
  if (value.includes("VARIANT_NOT_FOUND")) return "لم يتم العثور على وحدة البيع المطلوبة للتحديث.";
  if (value.includes("PARENT_BARCODE_NOT_FOUND")) return "باركود المنتج الأساسي غير موجود.";
  if (value.includes("VARIANT_BARCODE_REQUIRED")) return "وحدة الجملة تحتاج باركودًا مستقلًا.";
  if (value.includes("BARCODE_ALREADY_EXISTS")) return "الباركود مستخدم بالفعل في منتج أو وحدة بيع أخرى.";
  if (value.includes("COMPANY_NOT_FOUND")) return "اسم الشركة غير موجود في النظام.";
  if (value.includes("CATEGORY_NOT_FOUND")) return "اسم القسم الرئيسي غير موجود في النظام.";
  if (value.includes("SUBCATEGORY_NOT_FOUND")) return "اسم القسم الفرعي غير موجود في النظام أو لا يتبع القسم المحدد.";
  if (value.includes("INVALID_VARIANT")) return "راجع اسم وحدة البيع والسعر ومعامل التحويل (> 1).";
  if (value.includes("INVALID_PRODUCT")) return "بيانات المنتج الأساسية أو الأسعار غير صالحة.";
  if (value.includes("INVALID_INVENTORY")) return "الكمية أو الحد الأدنى للمخزون غير صالح.";
  if (value.includes("BRANCH_ACCESS_DENIED")) return "ليس لديك صلاحية الاستيراد للفرع الحالي.";
  return value || "حدث خطأ غير معروف.";
}

export async function importProductRows(
  rows: ProductImportRow[],
  mode: ProductImportMode,
  onProgress?: (completed: number, total: number) => void,
) {
  const branchId = requireCurrentBranchId();
  const aggregate: ProductImportResult = { total: 0, success: 0, failed: 0, results: [] };
  const BATCH_SIZE = 100;

  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const { data, error } = await rpc("import_product_rows", {
      p_branch_id: branchId,
      p_rows: batch,
      p_mode: mode,
    });

    if (error) throw new Error(explainImportError(error.message));
    const result = data as ProductImportResult;
    aggregate.total += Number(result?.total || batch.length);
    aggregate.success += Number(result?.success || 0);
    aggregate.failed += Number(result?.failed || 0);
    aggregate.results.push(...(result?.results || []));
    onProgress?.(Math.min(start + batch.length, rows.length), rows.length);
  }

  invalidatePOSCatalogCache(branchId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("catalog:changed", { detail: { branchId } }));
  }

  aggregate.results = aggregate.results.map(row => ({
    ...row,
    message: row.status === "error" ? explainImportError(row.message) : row.message,
  }));
  return aggregate;
}
