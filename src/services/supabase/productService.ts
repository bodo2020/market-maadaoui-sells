
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types";

export async function fetchProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("name");

  if (error) {
    console.error("Error fetching products:", error);
    throw error;
  }

  return data as Product[];
}

export async function fetchProductById(id: string) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching product:", error);
    throw error;
  }

  return data as Product;
}

export async function fetchProductByBarcode(barcode: string) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("barcode", barcode)
    .maybeSingle();

  if (error) {
    console.error("Error fetching product by barcode:", error);
    throw error;
  }

  return data as Product | null;
}

export async function createProduct(product: Omit<Product, "id" | "created_at" | "updated_at">) {
  const { data, error } = await supabase
    .from("products")
    .insert([product])
    .select();

  if (error) {
    console.error("Error creating product:", error);
    throw error;
  }

  return data[0] as Product;
}

export async function updateProduct(id: string, product: Partial<Omit<Product, "id" | "created_at" | "updated_at">>) {
  // الخطوة 1: تأكد من أن main_category_id و subcategory_id ليسا undefined وإذا كانا، اجعلهما null
  const productUpdate = {
    ...product,
    updated_at: new Date().toISOString(),
    
    // معالجة خاصة للمفاتيح الخارجية للتأكد من تحويل undefined إلى null
    main_category_id: product.main_category_id === undefined ? null : product.main_category_id,
    subcategory_id: product.subcategory_id === undefined ? null : product.subcategory_id,
    company_id: product.company_id === undefined ? null : product.company_id,
    
    // معالجة خاصة لسعر العرض وحالة المنتج في العروض
    offer_price: product.offer_price ?? null,
    is_offer: product.is_offer ?? false
  };
  
  console.log("Sending update to Supabase:", productUpdate);
  
  // الخطوة 2: التأكد من أن subcategory_id يتوافق مع main_category_id
  if (productUpdate.subcategory_id && productUpdate.main_category_id) {
    try {
      // التحقق من أن القسم الفرعي ينتمي للقسم الرئيسي
      const { data, error } = await supabase
        .from("subcategories")
        .select("*")
        .eq("id", productUpdate.subcategory_id)
        .eq("category_id", productUpdate.main_category_id)
        .single();
      
      if (error || !data) {
        console.warn("Subcategory doesn't belong to specified main category. Resetting subcategory_id to null.");
        productUpdate.subcategory_id = null;
      }
    } catch (error) {
      console.error("Error checking subcategory relation:", error);
      // في حالة وجود خطأ، نترك القيم كما هي ونستمر
    }
  }
  
  try {
    const { data, error } = await supabase
      .from("products")
      .update(productUpdate)
      .eq("id", id)
      .select();

    if (error) {
      console.error("Error updating product:", error);
      throw error;
    }

    return data[0] as Product;
  } catch (error) {
    console.error("Error updating product:", error);
    throw error;
  }
}

export async function deleteProduct(id: string) {
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting product:", error);
    throw error;
  }

  return true;
}

export async function fetchProductsByCategory(categoryId: string) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("main_category_id", categoryId)
    .order("name");

  if (error) {
    console.error("Error fetching products by category:", error);
    throw error;
  }

  return data as Product[];
}

export async function fetchProductsByCompany(companyId: string) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("company_id", companyId)
    .order("name");

  if (error) {
    console.error("Error fetching products by company:", error);
    throw error;
  }

  return data as Product[];
}

export async function fetchProductsBySubcategory(subcategoryId: string) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("subcategory_id", subcategoryId)
    .order("name");

  if (error) {
    console.error("Error fetching products by subcategory:", error);
    throw error;
  }

  return data as Product[];
}
