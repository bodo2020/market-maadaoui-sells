import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types";

export async function fetchProducts() {
  console.log("Fetching all products");
  
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("name");

    if (error) {
      console.error("Error fetching products:", error);
      throw error;
    }

    console.log(`Successfully fetched ${data.length} products`);
    return data as Product[];
  } catch (error) {
    console.error("Error in fetchProducts:", error);
    return [];
  }
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
  console.log("Creating product with data:", product);

  try {
    // Ensure product has all required fields
    if (!product.name) {
      throw new Error("Product name is required");
    }

    if (product.price === undefined || product.price === null) {
      throw new Error("Product price is required");
    }

    if (product.purchase_price === undefined || product.purchase_price === null) {
      throw new Error("Product purchase price is required");
    }

    // Check if barcode starts with 2 and is 6 digits (scale product)
    if (product.barcode?.startsWith('2') && /^\d{6}$/.test(product.barcode)) {
      product.barcode_type = 'scale';
      product.unit_of_measure = 'كجم';
    }

    // If subcategory is provided, ensure we get the correct main category
    if (product.subcategory_id) {
      const { data: subcategory, error: subcategoryError } = await supabase
        .from("subcategories")
        .select("category_id")
        .eq("id", product.subcategory_id)
        .single();

      if (subcategoryError) {
        console.error("Error fetching subcategory:", subcategoryError);
        throw subcategoryError;
      }

      // Set the main_category_id based on the subcategory's category_id
      product.main_category_id = subcategory.category_id;
    }

    // Ensure all required fields are present and properly formatted
    const productData = {
      name: product.name,
      price: product.price,
      purchase_price: product.purchase_price,
      quantity: product.quantity || 0,
      image_urls: product.image_urls || [],
      main_category_id: product.main_category_id,
      subcategory_id: product.subcategory_id,
      company_id: product.company_id,
      description: product.description,
      barcode: product.barcode,
      barcode_type: product.barcode_type,
      is_offer: product.is_offer || false,
      offer_price: product.offer_price,
      bulk_enabled: product.bulk_enabled || false,
      bulk_quantity: product.bulk_quantity,
      bulk_price: product.bulk_price,
      bulk_barcode: product.bulk_barcode,
      is_bulk: product.is_bulk || false,
      manufacturer_name: product.manufacturer_name,
      unit_of_measure: product.unit_of_measure,
    };

    const { data, error } = await supabase
      .from("products")
      .insert([productData])
      .select();

    if (error) {
      console.error("Error creating product:", error);
      throw error;
    }

    console.log("Product created successfully:", data[0]);
    return data[0] as Product;
  } catch (error) {
    console.error("Error in createProduct:", error);
    throw error;
  }
}

export async function updateProduct(id: string, product: Partial<Omit<Product, "id" | "created_at" | "updated_at">>) {
  try {
    // Modified to ensure we're only updating the fields provided in the product parameter
    // Only handle special cases if those specific fields are being updated
    const updateData: any = { ...product };
    
    // If changing barcode, check if it's a scale barcode
    if (product.barcode !== undefined) {
      if (product.barcode?.startsWith('2') && /^\d{6}$/.test(product.barcode)) {
        updateData.barcode_type = 'scale';
        updateData.unit_of_measure = 'كجم';
      }
    }

    // If changing subcategory, ensure we update main category accordingly
    if (product.subcategory_id !== undefined) {
      if (product.subcategory_id === null) {
        // If clearing subcategory, also clear main category
        updateData.main_category_id = null;
      } else {
        // Get the main category from the subcategory
        const { data: subcategory, error: subcategoryError } = await supabase
          .from("subcategories")
          .select("category_id")
          .eq("id", product.subcategory_id)
          .single();

        if (subcategoryError) {
          console.error("Error fetching subcategory:", subcategoryError);
          throw subcategoryError;
        }

        updateData.main_category_id = subcategory.category_id;
      }
    }

    // Only update main_category_id if it was explicitly provided or modified by subcategory change
    if (product.main_category_id !== undefined && !updateData.hasOwnProperty('main_category_id')) {
      updateData.main_category_id = product.main_category_id;
    }

    console.log("Updating product with data:", updateData);

    const { data, error } = await supabase
      .from("products")
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select();

    if (error) {
      console.error("Error updating product:", error);
      throw error;
    }

    return data[0] as Product;
  } catch (error) {
    console.error("Error in updateProduct:", error);
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
  console.log("Fetching products for main category:", categoryId);
  
  try {
    if (!categoryId) {
      console.error("No category ID provided");
      return [];
    }
    
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("main_category_id", categoryId)
      .order("name");

    if (error) {
      console.error("Error fetching products by category:", error);
      throw error;
    }
    
    console.log(`Found ${data?.length || 0} products for main category ${categoryId}`);
    return data as Product[];
  } catch (error) {
    console.error("Error in fetchProductsByCategory:", error);
    return [];
  }
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
  console.log("Fetching products for subcategory:", subcategoryId);
  
  try {
    if (!subcategoryId) {
      console.error("No subcategory ID provided");
      return [];
    }
    
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("subcategory_id", subcategoryId)
      .order("name");

    if (error) {
      console.error("Error fetching products by subcategory:", error);
      throw error;
    }
    
    console.log(`Found ${data?.length || 0} products for subcategory ${subcategoryId}`);
    return data as Product[];
  } catch (error) {
    console.error("Error in fetchProductsBySubcategory:", error);
    return [];
  }
}

// Inventory management functions
export async function updateInventoryQuantity(productId: string, quantityChange: number) {
  try {
    // Get current inventory quantity
    const { data: inventory, error: fetchError } = await supabase
      .from("inventory")
      .select("quantity")
      .eq("product_id", productId)
      .maybeSingle();

    if (fetchError) {
      console.error(`Error fetching inventory for product ${productId}:`, fetchError);
      throw fetchError;
    }

    const currentQuantity = inventory?.quantity || 0;
    const newQuantity = Math.max(0, currentQuantity + quantityChange);

    // Update inventory using upsert to handle cases where inventory record doesn't exist
    const { error: updateError } = await supabase
      .from("inventory")
      .upsert({
        product_id: productId,
        quantity: newQuantity,
        min_stock_level: 5,
        max_stock_level: 100,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'product_id',
        ignoreDuplicates: false
      });

    if (updateError) {
      console.error(`Error updating inventory for product ${productId}:`, updateError);
      throw updateError;
    }

    // Also update products table for backward compatibility
    const { error: productUpdateError } = await supabase
      .from("products")
      .update({ quantity: newQuantity })
      .eq("id", productId);

    if (productUpdateError) {
      console.error(`Error updating product ${productId} quantity:`, productUpdateError);
    }

    return newQuantity;
  } catch (error) {
    console.error("Error updating inventory quantity:", error);
    throw error;
  }
}

// Updated function to use inventory table
export async function updateProductQuantity(productId: string, quantityChange: number) {
  return await updateInventoryQuantity(productId, quantityChange);
}

// Barcode management functions
export async function generateBarcodeForProduct(productId: string): Promise<string> {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${timestamp}${random}`;
}

export async function updateProductBarcode(productId: string, barcode: string) {
  try {
    const { error } = await supabase
      .from("products")
      .update({ barcode })
      .eq("id", productId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error updating product barcode:", error);
    throw error;
  }
}
