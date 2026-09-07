import { supabase } from "@/integrations/supabase/client";
import { invalidatePOSCatalogCache } from "@/services/supabase/posCatalogService";

export type ProductVariant = {
  id: string;
  parent_product_id: string;
  name: string;
  variant_type: string;
  price: number;
  purchase_price: number;
  conversion_factor: number;
  barcode: string | null;
  bulk_barcode: string | null;
  image_url: string | null;
  active: boolean;
  position: number;
  created_at?: string;
  updated_at?: string;
};

export type ProductVariantInput = {
  name: string;
  variant_type: string;
  price: number;
  purchase_price: number;
  conversion_factor: number;
  barcode?: string | null;
  bulk_barcode?: string | null;
  image_url?: string | null;
  active?: boolean;
  position?: number;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

function currentBranchId() {
  const branchId = typeof window !== "undefined" ? localStorage.getItem("currentBranchId") : null;
  if (!branchId || branchId === "null") throw new Error("اختار الفرع قبل تعديل وحدات البيع.");
  return branchId;
}

function friendlyVariantError(message?: string) {
  const value = message || "";
  if (value.includes("BARCODE_ALREADY_EXISTS")) return "الباركود مستخدم بالفعل لمنتج أو وحدة بيع أخرى.";
  if (value.includes("VARIANT_BARCODE_REQUIRED")) return "أدخل باركود لوحدة البيع.";
  if (value.includes("INVALID_VARIANT")) return "راجع اسم وحدة البيع والسعر ومعامل التحويل. معامل التحويل لازم يكون أكبر من 1.";
  if (value.includes("PARENT_PRODUCT_NOT_FOUND")) return "المنتج الأساسي غير موجود.";
  if (value.includes("VARIANT_NOT_FOUND")) return "وحدة البيع غير موجودة أو تم حذفها.";
  if (value.includes("BRANCH_ACCESS_DENIED")) return "ليس لديك صلاحية تعديل المنتجات في الفرع الحالي.";
  return null;
}

function notifyCatalogChanged(branchId: string) {
  invalidatePOSCatalogCache(branchId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("catalog:changed", { detail: { branchId } }));
  }
}

export async function fetchProductVariants(parentProductId: string, includeInactive = true) {
  let query = supabase
    .from("product_variants")
    .select("*")
    .eq("parent_product_id", parentProductId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (!includeInactive) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ProductVariant[];
}

export async function saveProductVariant(
  parentProductId: string,
  input: ProductVariantInput,
  variantId?: string | null,
) {
  const branchId = currentBranchId();
  const payload: ProductVariantInput = {
    ...input,
    name: input.name.trim(),
    variant_type: input.variant_type.trim() || "جملة",
    barcode: input.barcode?.trim() || null,
    bulk_barcode: input.bulk_barcode?.trim() || null,
    image_url: input.image_url || null,
    price: Number(input.price),
    purchase_price: Number(input.purchase_price || 0),
    conversion_factor: Number(input.conversion_factor),
    active: input.active ?? true,
    position: Number(input.position || 0),
  };

  const { data, error } = await rpc("save_product_variant", {
    p_branch_id: branchId,
    p_parent_product_id: parentProductId,
    p_variant: payload,
    p_variant_id: variantId || null,
  });

  if (error) {
    const friendly = friendlyVariantError(error.message);
    throw new Error(friendly || error.message || "تعذر حفظ وحدة البيع.");
  }

  notifyCatalogChanged(branchId);
  return data as ProductVariant;
}

export async function setProductVariantActive(variantId: string, active: boolean) {
  const branchId = currentBranchId();
  const { data, error } = await rpc("set_product_variant_active", {
    p_branch_id: branchId,
    p_variant_id: variantId,
    p_active: active,
  });

  if (error) {
    const friendly = friendlyVariantError(error.message);
    throw new Error(friendly || error.message || "تعذر تغيير حالة وحدة البيع.");
  }

  notifyCatalogChanged(branchId);
  return data as ProductVariant;
}
