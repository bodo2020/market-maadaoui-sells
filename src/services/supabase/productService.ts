
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

export async function fetchProductByBarcode(barcode: string) {
  // Handle scale barcodes (starting with 2 and 13 digits)
  if (barcode.startsWith('2') && barcode.length === 13) {
    // Extract the product code (6 digits after the '2')
    const productCode = barcode.substring(1, 7);
    
    // Get product with matching scale product code
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("barcode_type", "scale")
      .eq("barcode", productCode)
      .single();
    
    if (error) {
      console.error("Error fetching scale product:", error);
      if (error.code === 'PGRST116') {
        // No data found
        return null;
      }
      throw error;
    }
    
    if (data) {
      // Extract weight from barcode: positions 7-11 (5 digits)
      // Format is 2PPPPPPWWWWWC where:
      // P = product code (6 digits)
      // W = weight in grams (5 digits)
      // C = check digit
      const weightInGrams = parseInt(barcode.substring(7, 12));
      const weightInKg = weightInGrams / 1000;
      
      // Return a modified product with the calculated quantity
      return {
        ...data,
        is_weight_based: true,
        calculated_weight: weightInKg,
        calculated_price: Number(data.price) * weightInKg
      } as Product;
    }
    
    return null;
  }
  
  // First check if this is a bulk barcode
  const bulkProduct = await supabase
    .from("products")
    .select("*")
    .eq("bulk_barcode", barcode)
    .maybeSingle();
    
  if (!bulkProduct.error && bulkProduct.data) {
    // Mark this as a bulk product scan
    return {
      ...bulkProduct.data,
      is_bulk_scan: true
    } as Product;
  }
  
  // If not a bulk barcode, look for regular barcode
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("barcode", barcode)
    .single();

  if (error) {
    console.error("Error fetching product by barcode:", error);
    if (error.code === 'PGRST116') {
      // No data found
      return null;
    }
    throw error;
  }

  // Return the product with a flag indicating this is not a bulk scan
  return {
    ...data,
    is_bulk_scan: false
  } as Product;
}

export async function createProduct(product: Omit<Product, "id" | "created_at" | "updated_at">) {
  // Format barcode for scale products (store only the 6-digit product code)
  let productData = { ...product };
  
  if (productData.barcode_type === "scale" && productData.barcode) {
    // If user entered more than 6 digits, extract just the product code part
    if (productData.barcode.length > 6) {
      productData.barcode = productData.barcode.substring(0, 6);
    }
    
    // Ensure it's exactly 6 digits by padding with zeros if needed
    while (productData.barcode.length < 6) {
      productData.barcode = '0' + productData.barcode;
    }
  }
  
  // Only include fields that exist in the database schema
  // Remove track_inventory from the data to match the schema
  const finalProductData = {
    name: productData.name,
    barcode: productData.barcode,
    description: productData.description,
    image_urls: productData.image_urls,
    quantity: productData.quantity,
    price: productData.price,
    purchase_price: productData.purchase_price,
    offer_price: productData.offer_price,
    is_offer: productData.is_offer,
    category_id: productData.category_id,
    subcategory_id: productData.subcategory_id,
    subsubcategory_id: productData.subsubcategory_id,
    company_id: productData.company_id, 
    barcode_type: productData.barcode_type,
    bulk_enabled: productData.bulk_enabled,
    bulk_quantity: productData.bulk_quantity,
    bulk_price: productData.bulk_price,
    bulk_barcode: productData.bulk_barcode,
    manufacturer_name: productData.manufacturer_name,
    unit_of_measure: productData.unit_of_measure,
    is_bulk: productData.is_bulk || false,
    notify_quantity: productData.notify_quantity
  };

  const { data, error } = await supabase
    .from("products")
    .insert([finalProductData])
    .select();

  if (error) {
    console.error("Error creating product:", error);
    throw error;
  }

  return data[0] as Product;
}

export async function updateProduct(id: string, product: {
  name?: string;
  barcode?: string | null;
  description?: string | null;
  image_urls?: string[];
  quantity?: number;
  price?: number;
  purchase_price?: number;
  offer_price?: number | null;
  is_offer?: boolean;
  category_id?: string | null;
  subcategory_id?: string | null;
  subsubcategory_id?: string | null;
  company_id?: string | null;
  barcode_type?: string;
  bulk_enabled?: boolean;
  bulk_quantity?: number | null;
  bulk_price?: number | null;
  bulk_barcode?: string | null;
  manufacturer_name?: string | null;
  unit_of_measure?: string | null;
  is_bulk?: boolean;
  notify_quantity?: number | null;
}) {
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
    .eq("category_id", categoryId);

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
    .eq("company_id", companyId);

  if (error) {
    console.error("Error fetching products by company:", error);
    throw error;
  }

  return data as Product[];
}
