
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types";

export interface ProductCollection {
  id?: string;
  title: string;
  description?: string;
  products: string[];
  position?: number;
  active?: boolean;
}

export async function fetchProductCollections() {
  console.log("Fetching product collections");
  
  try {
    const { data, error } = await supabase
      .from("product_collections")
      .select("*")
      .order("position");

    if (error) {
      console.error("Error fetching product collections:", error);
      throw error;
    }

    console.log(`Successfully fetched ${data.length} product collections`);
    return data as ProductCollection[];
  } catch (error) {
    console.error("Error in fetchProductCollections:", error);
    return [];
  }
}

export async function createProductCollection(collection: Omit<ProductCollection, 'id'>) {
  console.log("Creating product collection:", collection);

  try {
    const { data, error } = await supabase
      .from("product_collections")
      .insert([collection])
      .select();

    if (error) {
      console.error("Error creating product collection:", error);
      throw error;
    }

    console.log("Product collection created successfully:", data[0]);
    return data[0] as ProductCollection;
  } catch (error) {
    console.error("Error in createProductCollection:", error);
    throw error;
  }
}

export async function updateProductCollection(id: string, collection: Partial<ProductCollection>) {
  try {
    console.log("Updating product collection:", id, collection);

    const { data, error } = await supabase
      .from("product_collections")
      .update({
        ...collection,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select();

    if (error) {
      console.error("Error updating product collection:", error);
      throw error;
    }

    return data[0] as ProductCollection;
  } catch (error) {
    console.error("Error in updateProductCollection:", error);
    throw error;
  }
}

export async function deleteProductCollection(id: string) {
  const { error } = await supabase
    .from("product_collections")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting product collection:", error);
    throw error;
  }

  return true;
}
