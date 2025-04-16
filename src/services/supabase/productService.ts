
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
    // Extract the product code (5 digits after the '2')
    const productCode = barcode.substring(1, 6);
    
    // Get product with matching scale product code
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("barcode_type", "scale")
      .eq("barcode", productCode)
      .single();
    
    if (error) {
      console.error("Error fetching scale product:", error);
      throw error;
    }
    
    if (data) {
      // Extract weight from barcode: positions 7-11 (5 digits)
      // Format is 2PPPPPWWWWWC where:
      // P = product code (5 digits)
      // W = weight in grams (5 digits)
      // C = check digit
      const weightInGrams = parseInt(barcode.substring(6, 11));
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
  
  // Handle regular barcodes
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

  return data as Product;
}

export async function createProduct(product: Omit<Product, "id" | "created_at" | "updated_at">) {
  // Format barcode for scale products (store only the 5-digit product code)
  let productData = { ...product };
  
  if (productData.barcode_type === "scale" && productData.barcode) {
    // If user entered more than 5 digits, extract just the product code part
    if (productData.barcode.length > 5) {
      productData.barcode = productData.barcode.substring(0, 5);
    }
    
    // Ensure it's exactly 5 digits by padding with zeros if needed
    while (productData.barcode.length < 5) {
      productData.barcode = '0' + productData.barcode;
    }
  }
  
  // Only include fields that exist in the database schema
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
    barcode_type: productData.barcode_type,
    bulk_enabled: productData.bulk_enabled,
    bulk_quantity: productData.bulk_quantity,
    bulk_price: productData.bulk_price,
    bulk_barcode: productData.bulk_barcode,
    manufacturer_name: productData.manufacturer_name,
    unit_of_measure: productData.unit_of_measure,
    is_bulk: productData.is_bulk || false
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

export async function updateProduct(id: string, product: Partial<Product>) {
  // Format barcode for scale products if it's being updated
  if (product.barcode_type === "scale" && product.barcode) {
    // If user entered more than 5 digits, extract just the product code part
    if (product.barcode.length > 5) {
      product.barcode = product.barcode.substring(0, 5);
    }
    
    // Ensure it's exactly 5 digits by padding with zeros if needed
    while (product.barcode.length < 5) {
      product.barcode = '0' + product.barcode;
    }
  }

  const updateData: any = {};
  
  // Only include fields that are present in the product object and exist in the database
  const validFields = [
    'name', 'barcode', 'description', 'image_urls', 'quantity', 
    'price', 'purchase_price', 'offer_price', 'is_offer',
    'category_id', 'subcategory_id', 'subsubcategory_id',
    'barcode_type', 'bulk_enabled', 'bulk_quantity', 'bulk_price', 
    'bulk_barcode', 'manufacturer_name', 'unit_of_measure',
    'created_at', 'updated_at', 'is_bulk'
  ];
  
  Object.keys(product).forEach(key => {
    if (product[key as keyof Product] !== undefined && validFields.includes(key)) {
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
