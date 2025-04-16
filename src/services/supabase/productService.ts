
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types";

export async function fetchProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*");

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

export async function createProduct(product: Omit<Product, "id" | "created_at" | "updated_at">) {
  const { data, error } = await supabase
    .from("products")
    .insert([{
      name: product.name,
      barcode: product.barcode,
      description: product.description,
      image_urls: product.image_urls,
      quantity: product.quantity,
      price: product.price,
      purchase_price: product.purchase_price,
      offer_price: product.offer_price,
      is_offer: product.is_offer,
      category_id: product.category_id,
      subcategory_id: product.subcategory_id,
      subsubcategory_id: product.subsubcategory_id,
      barcode_type: product.barcode_type,
      bulk_enabled: product.bulk_enabled,
      bulk_quantity: product.bulk_quantity,
      bulk_price: product.bulk_price,
      bulk_barcode: product.bulk_barcode,
      manufacturer_name: product.manufacturer_name,
      is_bulk: product.is_bulk,
      unit_of_measure: product.unit_of_measure
    }])
    .select();

  if (error) {
    console.error("Error creating product:", error);
    throw error;
  }

  return data[0] as Product;
}

export async function updateProduct(id: string, product: Partial<Product>) {
  const updateData: any = {};
  
  // Only include fields that are present in the product object
  Object.keys(product).forEach(key => {
    if (product[key as keyof Product] !== undefined) {
      // Convert Date objects to ISO strings if needed
      if (key === 'created_at' || key === 'updated_at') {
        const value = product[key as keyof Product];
        updateData[key] = value instanceof Date ? value.toISOString() : value;
      } else {
        updateData[key] = product[key as keyof Product];
      }
    }
  });

  const { data, error } = await supabase
    .from("products")
    .update(updateData)
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
