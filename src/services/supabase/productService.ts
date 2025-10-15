import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types";

// Helper: get current branch id from localStorage or fallback to first active branch
async function getCurrentBranchId(): Promise<string | null> {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('currentBranchId') : null;
    if (saved) return saved;
    const { data } = await supabase
      .from('branches')
      .select('id')
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1);
    return data?.[0]?.id || null;
  } catch {
    return null;
  }
}

export async function fetchProducts() {
  console.log("Fetching all products");
  
  try {
    const currentBranchId = await getCurrentBranchId();
    
    if (!currentBranchId) {
      console.error('No branch ID available');
      return [];
    }

    // Get branch settings
    const { data: branchData, error: branchError } = await supabase
      .from("branches")
      .select("independent_pricing, independent_inventory, branch_type")
      .eq("id", currentBranchId)
      .single();

    if (branchError) {
      console.error("Error fetching branch data:", branchError);
      throw branchError;
    }

    const isIndependentInventory = branchData?.independent_inventory || false;
    const isIndependentPricing = branchData?.independent_pricing || false;

    // Pagination to bypass PostgREST default 1000 row limit
    const PAGE_SIZE = 1000;

    // 1) Fetch products (join inventory when independent inventory is enabled)
    let allProducts: any[] = [];
    {
      let from = 0;
      while (true) {
        let q;
        
        if (isIndependentInventory) {
          // For branches with independent inventory:
          // Only fetch products that have inventory records for this specific branch
          // This automatically filters to show only branch-specific products
          q = supabase
            .from("products")
            .select("*, inventory!inner(branch_id)")
            .eq("inventory.branch_id", currentBranchId)
            .order("name");
        } else {
          // No independent inventory: show all products
          q = supabase.from("products").select("*").order("name");
        }

        const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
        if (error) {
          console.error("Error fetching products (paged):", error);
          throw error;
        }
        if (!data || data.length === 0) break;
        // Remove joined inventory object if present
        const cleaned = data.map((p: any) => {
          const { inventory, ...rest } = p || {};
          return rest;
        });
        allProducts = allProducts.concat(cleaned);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }

    // 2) Fetch inventory for current branch (paged)
    let allInventory: any[] = [];
    {
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("inventory")
          .select("product_id, quantity, min_stock_level")
          .eq("branch_id", currentBranchId)
          .range(from, from + PAGE_SIZE - 1);
        if (error) {
          console.error("Error fetching inventory (paged):", error);
          break;
        }
        if (!data || data.length === 0) break;
        allInventory = allInventory.concat(data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }

    // 3) Fetch branch pricing if needed (paged)
    let pricingMap = new Map();
    if (isIndependentPricing) {
      let allPricing: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("branch_product_pricing")
          .select("product_id, sale_price, purchase_price, offer_price, is_offer")
          .eq("branch_id", currentBranchId)
          .range(from, from + PAGE_SIZE - 1);
        if (error) {
          console.error("Error fetching branch pricing (paged):", error);
          break;
        }
        if (!data || data.length === 0) break;
        allPricing = allPricing.concat(data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      pricingMap = new Map((allPricing || []).map((price: any) => [price.product_id, price]));
    }

    // Create a map of product_id to inventory data
    const inventoryMap = new Map((allInventory || []).map((inv: any) => [inv.product_id, inv]));


    // Merge products with inventory data and custom pricing
    const productsWithInventory = (allProducts || []).map(product => {
      const inventory = inventoryMap.get(product.id);
      const customPricing = pricingMap.get(product.id);

      return {
        ...product,
        quantity: inventory?.quantity || 0,
        min_stock_level: inventory?.min_stock_level || 5,
        // Use custom pricing if available, otherwise use default
        price: customPricing?.sale_price ?? product.price,
        purchase_price: customPricing?.purchase_price ?? product.purchase_price,
        offer_price: customPricing?.offer_price ?? product.offer_price,
        is_offer: customPricing?.is_offer ?? product.is_offer,
        // Add flag to indicate if custom pricing exists
        has_custom_pricing: !!customPricing
      };
    });

    console.log(`Successfully fetched ${productsWithInventory.length} products for branch ${currentBranchId}`);
    return productsWithInventory as Product[];
  } catch (error) {
    console.error("Error in fetchProducts:", error);
    return [];
  }
}

export async function fetchProductById(id: string) {
  const currentBranchId = await getCurrentBranchId();
  
  if (!currentBranchId) {
    throw new Error('No branch ID available');
  }

  // Get branch settings
  const { data: branchData } = await supabase
    .from("branches")
    .select("independent_pricing")
    .eq("id", currentBranchId)
    .single();

  const isIndependentPricing = branchData?.independent_pricing || false;

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching product:", error);
    throw error;
  }

  // Fetch inventory data for the current branch
  const { data: inventoryData } = await supabase
    .from("inventory")
    .select("quantity, min_stock_level")
    .eq("product_id", id)
    .eq("branch_id", currentBranchId)
    .maybeSingle();

  // Fetch custom pricing if branch has independent pricing
  let customPricing = null;
  if (isIndependentPricing) {
    const { data: pricingData } = await supabase
      .from("branch_product_pricing")
      .select("sale_price, purchase_price, offer_price, is_offer")
      .eq("product_id", id)
      .eq("branch_id", currentBranchId)
      .maybeSingle();
    
    customPricing = pricingData;
  }

  const productWithInventory = {
    ...data,
    quantity: inventoryData?.quantity || 0,
    min_stock_level: inventoryData?.min_stock_level || 5,
    // Use custom pricing if available
    price: customPricing?.sale_price ?? data.price,
    purchase_price: customPricing?.purchase_price ?? data.purchase_price,
    offer_price: customPricing?.offer_price ?? data.offer_price,
    is_offer: customPricing?.is_offer ?? data.is_offer,
    has_custom_pricing: !!customPricing,
    // Store original prices for reference
    original_price: data.price,
    original_purchase_price: data.purchase_price,
  };

  return productWithInventory as Product;
}

export async function fetchProductByBarcode(barcode: string) {
  const currentBranchId = await getCurrentBranchId();
  
  if (!currentBranchId) {
    return { product: null, isBulkBarcode: false };
  }

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .or(`barcode.eq.${barcode},bulk_barcode.eq.${barcode}`)
    .maybeSingle();

  if (error) {
    console.error("Error fetching product by barcode:", error);
    throw error;
  }

  if (!data) {
    return { product: null, isBulkBarcode: false };
  }

  // Fetch inventory for this product and branch
  const { data: inventoryData } = await supabase
    .from("inventory")
    .select("quantity, min_stock_level")
    .eq("product_id", data.id)
    .eq("branch_id", currentBranchId)
    .maybeSingle();

  // Check if the scanned barcode matches the bulk_barcode
  const isBulkBarcode = data.bulk_barcode === barcode;
    
  const productWithInventory = {
    ...data,
    quantity: inventoryData?.quantity || 0,
    min_stock_level: inventoryData?.min_stock_level || 5
  };

  return { 
    product: productWithInventory as Product, 
    isBulkBarcode 
  };
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
    
    // إنشاء سجل مخزون للمنتج للفرع الحالي
    let currentBranchId = await getCurrentBranchId();
    
    // إذا لم يتم العثور على فرع، استخدم الفرع الرئيسي كافتراضي
    if (!currentBranchId) {
      const { data: defaultBranch } = await supabase
        .from('branches')
        .select('id')
        .eq('active', true)
        .order('created_at', { ascending: true })
        .limit(1);
      
      currentBranchId = defaultBranch?.[0]?.id;
    }
    
    if (currentBranchId) {
      const { error: inventoryError } = await supabase
        .from("inventory")
        .upsert({
          product_id: data[0].id,
          branch_id: currentBranchId,
          quantity: productData.quantity || 0,
          min_stock_level: 5, // قيمة افتراضية للحد الأدنى
          updated_at: new Date().toISOString()
        }, { onConflict: 'product_id,branch_id' });
        
      if (inventoryError) {
        console.error("Error creating inventory record:", inventoryError);
        throw inventoryError; // يجب أن نتوقف إذا فشل إنشاء سجل المخزون
      }
    } else {
      throw new Error("لا يمكن العثور على فرع نشط لإنشاء سجل المخزون");
    }
    
    return data[0] as Product;
  } catch (error) {
    console.error("Error in createProduct:", error);
    throw error;
  }
}

export async function updateProduct(id: string, product: Partial<Omit<Product, "id" | "created_at" | "updated_at">>) {
  try {
    const currentBranchId = await getCurrentBranchId();
    
    // Get branch settings
    const { data: branchData } = await supabase
      .from("branches")
      .select("independent_pricing")
      .eq("id", currentBranchId)
      .single();

    const isIndependentPricing = branchData?.independent_pricing || false;

    // Extract fields that should not be saved to products table
    const { 
      min_stock_level, 
      price, 
      purchase_price, 
      offer_price, 
      is_offer, 
      has_custom_pricing, // Remove computed field
      original_price, // Remove computed field
      original_purchase_price, // Remove computed field
      ...productUpdateData 
    } = product as any;
    const updateData: any = { ...productUpdateData };
    
    // If changing barcode, check if it's a scale barcode
    if (product.barcode !== undefined) {
      if (product.barcode?.startsWith('2') && /^\d{6}$/.test(product.barcode)) {
        updateData.barcode_type = 'scale';
        updateData.unit_of_measure = 'كجم';
      }
    }

    // تبسيط منطق التعامل مع الفئات - عدم تعديل البيانات إلا إذا كانت محددة بوضوح
    if (product.subcategory_id !== undefined) {
      if (product.subcategory_id === null || product.subcategory_id === "" || product.subcategory_id === "none") {
        updateData.subcategory_id = null;
      } else {
        updateData.subcategory_id = product.subcategory_id;
        // الحفاظ على التناسق: إذا تم تحديد فئة فرعية، حدث الفئة الرئيسية تلقائيًا بناءً عليها
        try {
          const { data: subcat, error: subErr } = await supabase
            .from("subcategories")
            .select("category_id")
            .eq("id", product.subcategory_id as string)
            .single();
          if (subErr) {
            console.warn("Could not fetch subcategory for main_category sync", subErr);
          } else if (subcat?.category_id) {
            updateData.main_category_id = subcat.category_id;
          }
        } catch (e) {
          console.warn("Failed to sync main_category_id from subcategory_id", e);
        }
      }
    }

    if (product.main_category_id !== undefined) {
      if (product.main_category_id === null || product.main_category_id === "" || product.main_category_id === "none") {
        updateData.main_category_id = null;
      } else {
        updateData.main_category_id = product.main_category_id;
      }
    }

    // Handle pricing updates
    if (isIndependentPricing && currentBranchId) {
      // For branches with independent pricing, update branch_product_pricing table
      if (price !== undefined || purchase_price !== undefined || offer_price !== undefined || is_offer !== undefined) {
        const pricingUpdate: any = {};
        if (price !== undefined) pricingUpdate.sale_price = price;
        if (purchase_price !== undefined) pricingUpdate.purchase_price = purchase_price;
        if (offer_price !== undefined) pricingUpdate.offer_price = offer_price;
        if (is_offer !== undefined) pricingUpdate.is_offer = is_offer;

        const { error: pricingError } = await supabase
          .from("branch_product_pricing")
          .upsert({
            product_id: id,
            branch_id: currentBranchId,
            ...pricingUpdate,
            updated_at: new Date().toISOString()
          }, { onConflict: 'product_id,branch_id' });

        if (pricingError) {
          console.error("Error updating branch pricing:", pricingError);
          throw pricingError;
        }
      }
    } else {
      // For branches without independent pricing, update main products table
      if (price !== undefined) updateData.price = price;
      if (purchase_price !== undefined) updateData.purchase_price = purchase_price;
      if (offer_price !== undefined) updateData.offer_price = offer_price;
      if (is_offer !== undefined) updateData.is_offer = is_offer;
    }

    console.log("Updating product with data:", updateData);
    console.log("Original product data sent:", product);

    // إذا كان هناك تحديث للكمية، تحديثها في جدول المخزون أولاً
    if (product.quantity !== undefined) {
      if (currentBranchId) {
        const { error: inventoryError } = await supabase
          .from("inventory")
          .upsert({
            product_id: id,
            branch_id: currentBranchId,
            quantity: product.quantity,
            updated_at: new Date().toISOString()
          }, { onConflict: 'product_id,branch_id' });
        
        if (inventoryError) {
          console.error("Error updating inventory quantity:", inventoryError);
          throw inventoryError;
        }
      }
      // إزالة الكمية من بيانات تحديث المنتج لأن الـ trigger سيقوم بتحديثها
      delete updateData.quantity;
    }

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

    // تحديث الحد الأدنى للمخزون في جدول المخزون إذا تم تمريره
    if (min_stock_level !== undefined) {
      if (currentBranchId) {
        const { error: inventoryError } = await supabase
          .from("inventory")
          .upsert({
            product_id: id,
            branch_id: currentBranchId,
            min_stock_level: min_stock_level,
            updated_at: new Date().toISOString()
          }, { onConflict: 'product_id,branch_id' });
        
        if (inventoryError) {
          console.warn("Warning: Could not update inventory record:", inventoryError);
        }
      } else {
        // Fallback: تحديث كل صفوف المخزون لهذا المنتج
        const { error: inventoryError } = await supabase
          .from("inventory")
          .update({
            min_stock_level: min_stock_level,
            updated_at: new Date().toISOString()
          })
          .eq("product_id", id);
        
        if (inventoryError) {
          console.warn("Warning: Could not update inventory record:", inventoryError);
        }
      }
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

export async function fetchProductsWithoutSubcategory() {
  console.log("Fetching products without subcategory");
  
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .is("subcategory_id", null)
      .order("name");

    if (error) {
      console.error("Error fetching products without subcategory:", error);
      throw error;
    }
    
    console.log(`Found ${data?.length || 0} products without subcategory`);
    return data as Product[];
  } catch (error) {
    console.error("Error in fetchProductsWithoutSubcategory:", error);
    return [];
  }
}

export async function getProductsWithoutSubcategoryCount() {
  try {
    const { count, error } = await supabase
      .from("products")
      .select("id", { count: "exact" })
      .is("subcategory_id", null);

    if (error) {
      console.error("Error counting products without subcategory:", error);
      throw error;
    }
    
    return count || 0;
  } catch (error) {
    console.error("Error in getProductsWithoutSubcategoryCount:", error);
    return 0;
  }
}

export async function assignProductsToSubcategory(subcategoryId: string, mainCategoryId: string, productIds: string[]) {
  console.log("Assigning products to subcategory:", { subcategoryId, mainCategoryId, productIds });
  
  try {
    const { error } = await supabase
      .from("products")
      .update({ 
        subcategory_id: subcategoryId,
        main_category_id: mainCategoryId
      })
      .in("id", productIds);

    if (error) {
      console.error("Error assigning products to subcategory:", error);
      throw error;
    }
    
    console.log(`Successfully assigned ${productIds.length} products to subcategory ${subcategoryId}`);
    return true;
  } catch (error) {
    console.error("Error in assignProductsToSubcategory:", error);
    throw error;
  }
}

// Inventory management functions
export async function updateInventoryQuantity(productId: string, quantityChange: number, branchId?: string) {
  try {
    const resolvedBranchId = branchId || await getCurrentBranchId();

    if (resolvedBranchId) {
      // Get current inventory quantity for this branch
      const { data: inventory, error: fetchError } = await supabase
        .from("inventory")
        .select("quantity")
        .eq("product_id", productId)
        .eq("branch_id", resolvedBranchId)
        .maybeSingle();

      if (fetchError) {
        console.error(`Error fetching inventory for product ${productId}:`, fetchError);
        throw fetchError;
      }

      const currentQuantity = inventory?.quantity || 0;
      const newQuantity = Math.max(0, currentQuantity + quantityChange);

      // Upsert inventory row for this branch
      const { error: updateError } = await supabase
        .from("inventory")
        .upsert({
          product_id: productId,
          branch_id: resolvedBranchId,
          quantity: newQuantity,
          min_stock_level: 5,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'product_id,branch_id',
          ignoreDuplicates: false
        });

      if (updateError) {
        console.error(`Error updating inventory for product ${productId}:`, updateError);
        throw updateError;
      }

      // Sync products.quantity to the total across all branches
      const { data: allRows } = await supabase
        .from("inventory")
        .select("quantity")
        .eq("product_id", productId);
      const totalQty = (allRows || []).reduce((sum: number, r: any) => sum + (r.quantity || 0), 0);
      const { error: productUpdateError } = await supabase
        .from("products")
        .update({ quantity: totalQty })
        .eq("id", productId);
      if (productUpdateError) {
        console.warn(`Warning: Could not sync product ${productId} quantity:`, productUpdateError);
      }

      return newQuantity;
    } else {
      // Fallback: no branch context - update products table only
      const { data: product, error: fetchProductError } = await supabase
        .from("products")
        .select("quantity")
        .eq("id", productId)
        .single();
      if (fetchProductError) throw fetchProductError;
      const currentQuantity = product?.quantity || 0;
      const newQuantity = Math.max(0, currentQuantity + quantityChange);
      const { error: productUpdateError } = await supabase
        .from("products")
        .update({ quantity: newQuantity })
        .eq("id", productId);
      if (productUpdateError) throw productUpdateError;
      return newQuantity;
    }
  } catch (error) {
    console.error("Error updating inventory quantity:", error);
    throw error;
  }
}

// Updated function to use inventory table with operation type
export async function updateProductQuantity(
  productId: string,
  quantityChange: number,
  operation: 'increase' | 'decrease' = 'decrease',
  branchId?: string
) {
  const adjustedChange = operation === 'increase' ? Math.abs(quantityChange) : -Math.abs(quantityChange);
  return await updateInventoryQuantity(productId, adjustedChange, branchId);
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
