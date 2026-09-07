import { supabase } from "@/integrations/supabase/client";
import { requireCurrentBranchId } from "@/services/supabase/productEditorService";

export type ProductDetailsProduct = {
  id: string;
  name: string;
  barcode: string | null;
  description: string | null;
  image_urls: string[];
  quantity: number;
  min_stock_level: number;
  max_stock_level: number | null;
  price: number;
  purchase_price: number;
  offer_price: number | null;
  is_offer: boolean;
  inventory_value: number;
  margin_value: number;
  margin_percent: number;
  barcode_type: string | null;
  unit_of_measure: string | null;
  shelf_location: string | null;
  expiry_date: string | null;
  track_expiry: boolean;
  company_id: string | null;
  company_name: string | null;
  main_category_id: string | null;
  main_category_name: string | null;
  subcategory_id: string | null;
  subcategory_name: string | null;
  has_variants: boolean;
  has_custom_pricing: boolean;
  operational_branch_id: string;
  inventory_branch_id: string;
  pricing_branch_id: string;
  created_at: string;
  updated_at: string | null;
};

export type ProductDetailsVariant = {
  id: string;
  parent_product_id: string;
  name: string;
  variant_type: string | null;
  price: number;
  purchase_price: number;
  effective_purchase_price: number;
  conversion_factor: number;
  barcode: string | null;
  bulk_barcode: string | null;
  image_url: string | null;
  active: boolean;
  position: number;
  available_packages: number;
  stock_units: number;
  created_at: string;
  updated_at: string | null;
};

export type ProductDetailsBatch = {
  id: string;
  batch_number: string | null;
  expiry_date: string | null;
  quantity: number;
  shelf_location: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  notes: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  created_at: string;
  updated_at: string | null;
};

export type ProductDetailsPurchase = {
  id: string;
  purchase_id: string;
  quantity: number;
  price: number;
  sale_price: number | null;
  total: number;
  batch_number: string | null;
  expiry_date: string | null;
  shelf_location: string | null;
  notes: string | null;
  invoice_number: string | null;
  purchase_date: string;
  supplier_id: string | null;
  supplier_name: string | null;
  created_at: string;
};

export type ProductDetailsSnapshot = {
  product: ProductDetailsProduct;
  variants: ProductDetailsVariant[];
  batches: ProductDetailsBatch[];
  recent_purchases: ProductDetailsPurchase[];
  source_context: {
    operational_branch_id: string;
    inventory_branch_id: string;
    pricing_branch_id: string;
  };
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

function friendlyError(message?: string) {
  const value = message || "";
  if (value.includes("BRANCH_ACCESS_DENIED")) return "ليس لديك صلاحية عرض تفاصيل منتجات الفرع الحالي.";
  if (value.includes("PRODUCT_NOT_FOUND")) return "المنتج غير موجود أو تم حذفه.";
  return value || "تعذر تحميل تفاصيل المنتج.";
}

export async function fetchProductDetailsPro(productId: string): Promise<ProductDetailsSnapshot> {
  const branchId = requireCurrentBranchId();
  const { data, error } = await rpc("get_product_details_pro", {
    p_branch_id: branchId,
    p_product_id: productId,
  });

  if (error) throw new Error(friendlyError(error.message));
  if (!data || typeof data !== "object") throw new Error("بيانات المنتج غير مكتملة.");

  const snapshot = data as ProductDetailsSnapshot;
  if (!snapshot.product?.id) throw new Error("بيانات المنتج غير مكتملة.");

  return {
    ...snapshot,
    variants: Array.isArray(snapshot.variants) ? snapshot.variants : [],
    batches: Array.isArray(snapshot.batches) ? snapshot.batches : [],
    recent_purchases: Array.isArray(snapshot.recent_purchases) ? snapshot.recent_purchases : [],
  };
}
