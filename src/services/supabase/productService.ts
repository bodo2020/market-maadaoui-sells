
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
  const { data, error } = await supabase
    .from("products")
    .update(product)
    .eq("id", id)
    .select();

  if (error) {
    console.error("Error updating product:", error);
    throw error;
  }

  return data[0] as Product;
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
    .eq("category_id", categoryId)
    .order("name");

  if (error) {
    console.error("Error fetching products by category:", error);
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

export async function fetchProductsBySubsubcategory(subsubcategoryId: string) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("subsubcategory_id", subsubcategoryId)
    .order("name");

  if (error) {
    console.error("Error fetching products by subsubcategory:", error);
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
