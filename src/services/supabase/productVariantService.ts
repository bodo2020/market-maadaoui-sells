import { supabase } from "@/integrations/supabase/client";
import { ProductVariant } from "@/types";

// إنشاء صنف جديد
export async function createProductVariant(variant: Omit<ProductVariant, "id" | "created_at" | "updated_at">) {
  const { data, error } = await supabase
    .from("product_variants")
    .insert(variant)
    .select()
    .single();

  if (error) {
    console.error("Error creating product variant:", error);
    throw error;
  }

  return data;
}

// جلب أصناف منتج معين
export async function fetchProductVariants(parentProductId: string): Promise<ProductVariant[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("*")
    .eq("parent_product_id", parentProductId)
    .eq("active", true)
    .order("position", { ascending: true });

  if (error) {
    console.error("Error fetching product variants:", error);
    throw error;
  }

  return data || [];
}

// تحديث صنف
export async function updateProductVariant(id: string, updates: Partial<Omit<ProductVariant, "created_at" | "updated_at">>) {
  const { data, error } = await supabase
    .from("product_variants")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating product variant:", error);
    throw error;
  }

  return data;
}

// حذف صنف
export async function deleteProductVariant(id: string) {
  const { error } = await supabase
    .from("product_variants")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting product variant:", error);
    throw error;
  }
}

// البحث عن صنف بالباركود
export async function fetchVariantByBarcode(barcode: string): Promise<ProductVariant | null> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("*")
    .eq("barcode", barcode)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    console.error("Error fetching variant by barcode:", error);
    throw error;
  }

  return data;
}

// إنشاء عدة أصناف في نفس الوقت
export async function createMultipleVariants(variants: Omit<ProductVariant, "id" | "created_at" | "updated_at">[]) {
  const { data, error } = await supabase
    .from("product_variants")
    .insert(variants)
    .select();

  if (error) {
    console.error("Error creating multiple variants:", error);
    throw error;
  }

  return data;
}

// تحديث ترتيب الأصناف
export async function updateVariantsOrder(variantUpdates: { id: string; position: number }[]) {
  const promises = variantUpdates.map(({ id, position }) =>
    supabase
      .from("product_variants")
      .update({ position })
      .eq("id", id)
  );

  const results = await Promise.all(promises);
  
  for (const result of results) {
    if (result.error) {
      console.error("Error updating variant order:", result.error);
      throw result.error;
    }
  }
}