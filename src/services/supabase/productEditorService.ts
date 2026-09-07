import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/types";
import { invalidatePOSCatalogCache } from "@/services/supabase/posCatalogService";

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

export type ProductEditorPayload = Partial<Product> & {
  name: string;
  price: number;
  purchase_price: number;
};

export type ProductInventoryEditor = {
  quantity: number;
  min_stock_level: number;
};

export type ProductAlertEditor = {
  enabled: boolean;
};

export function requireCurrentBranchId() {
  const branchId = typeof window !== "undefined" ? localStorage.getItem("currentBranchId") : null;
  if (!branchId || branchId === "null") {
    throw new Error("اختار الفرع قبل إضافة أو تعديل المنتج.");
  }
  return branchId;
}

function friendlyProductError(message?: string) {
  const value = message || "";
  if (value.includes("BARCODE_ALREADY_EXISTS")) return "الباركود مستخدم بالفعل لمنتج أو وحدة بيع أخرى.";
  if (value.includes("BRANCH_ACCESS_DENIED")) return "ليس لديك صلاحية تعديل المنتجات في الفرع الحالي.";
  if (value.includes("BRANCH_REQUIRED")) return "اختار فرعًا نشطًا قبل الحفظ.";
  if (value.includes("PRODUCT_NOT_FOUND")) return "المنتج غير موجود أو تم حذفه.";
  if (value.includes("INVALID_SUBCATEGORY")) return "القسم الفرعي المحدد غير صالح.";
  if (value.includes("INVALID_BARCODE_TYPE")) return "نوع الباركود غير صالح.";
  if (value.includes("INVALID_INVENTORY")) return "راجع الكمية والحد الأدنى للمخزون.";
  if (value.includes("OFFER_PRICE_REQUIRED")) return "أدخل سعر العرض قبل تفعيل العرض.";
  if (value.includes("INVALID_OFFER_PRICE")) return "سعر العرض غير صالح.";
  if (value.includes("INVALID_PRODUCT")) return "راجع اسم المنتج وأسعار البيع والشراء.";
  return null;
}

export async function saveProductEditor(
  product: ProductEditorPayload,
  inventory: ProductInventoryEditor,
  alert: ProductAlertEditor,
  productId?: string | null,
) {
  const branchId = requireCurrentBranchId();
  const payload = {
    ...product,
    name: product.name.trim(),
    barcode: product.barcode?.trim() || null,
    description: product.description?.trim() || null,
    unit_of_measure: product.unit_of_measure?.trim() || (product.barcode_type === "scale" ? "كجم" : "قطعة"),
    shelf_location: product.shelf_location?.trim() || null,
    expiry_date: product.expiry_date || null,
    image_urls: product.image_urls || [],
    company_id: product.company_id || null,
    main_category_id: product.main_category_id || null,
    subcategory_id: product.subcategory_id || null,
    price: Number(product.price || 0),
    purchase_price: Number(product.purchase_price || 0),
    offer_price: product.is_offer ? Number(product.offer_price || 0) : null,
    is_offer: Boolean(product.is_offer),
    track_expiry: Boolean(product.track_expiry),
    barcode_type: product.barcode_type || "normal",
    base_unit: product.unit_of_measure?.trim() || (product.barcode_type === "scale" ? "كجم" : "قطعة"),
  };

  const { data, error } = await rpc("save_product_editor", {
    p_branch_id: branchId,
    p_product: payload,
    p_inventory: {
      quantity: Number(inventory.quantity || 0),
      min_stock_level: Number(inventory.min_stock_level || 0),
    },
    p_alert: { enabled: Boolean(alert.enabled) },
    p_product_id: productId || null,
  });

  if (error) {
    const friendly = friendlyProductError(error.message);
    throw new Error(friendly || error.message || "تعذر حفظ المنتج.");
  }

  invalidatePOSCatalogCache(branchId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("catalog:changed", { detail: { branchId } }));
  }

  return data as Product;
}

export async function barcodeExists(barcode: string, exceptProductId?: string | null) {
  const clean = barcode.trim();
  if (!clean) return false;

  const [{ data: products, error: productsError }, { data: variants, error: variantsError }] = await Promise.all([
    supabase
      .from("products")
      .select("id")
      .or(`barcode.eq.${clean},bulk_barcode.eq.${clean}`)
      .limit(2),
    supabase
      .from("product_variants")
      .select("id")
      .or(`barcode.eq.${clean},bulk_barcode.eq.${clean}`)
      .limit(1),
  ]);

  if (productsError) throw productsError;
  if (variantsError) throw variantsError;

  const otherProduct = (products || []).some(row => row.id !== exceptProductId);
  return otherProduct || Boolean(variants?.length);
}
