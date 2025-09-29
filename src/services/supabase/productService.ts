import { supabase } from "@/integrations/supabase/client";
import { Product, ProductVariant } from "@/types";
import { fetchProductVariants } from "./productVariantService";

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
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("name");

    if (error) {
      console.error("Error fetching products:", error);
      throw error;
    }

    // جلب الأصناف لكل منتج له أصناف متعددة
    const productsWithVariants = await Promise.all(
      data.map(async (product) => {
        if (product.has_variants) {
          try {
            const variants = await fetchProductVariants(product.id);
            return { ...product, variants };
          } catch (error) {
            console.error(`Error fetching variants for product ${product.id}:`, error);
            return product;
          }
        }
        return product;
      })
    );

    console.log(`Successfully fetched ${productsWithVariants.length} products`);
    return productsWithVariants as Product[];
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

  // جلب بيانات المخزون للمنتج (الحد الأدنى فقط)
  const { data: inventoryData } = await supabase
    .from("inventory")
    .select("min_stock_level")
    .eq("product_id", id)
    .maybeSingle();

  let productWithInventory = {
    ...data,
    min_stock_level: inventoryData?.min_stock_level || 5,
  };

  // جلب الأصناف إذا كان المنتج له أصناف متعددة
  if (data.has_variants) {
    try {
      const variants = await fetchProductVariants(id);
      (productWithInventory as any).variants = variants;
    } catch (error) {
      console.error("Error fetching product variants:", error);
    }
  }

  return productWithInventory as Product;
}

export async function fetchProductByBarcode(barcode: string) {
  // البحث في المنتجات العادية أولاً
  const { data: productData, error: productError } = await supabase
    .from("products")
    .select("*")
    .eq("barcode", barcode)
    .maybeSingle();

  if (productData) {
    return productData as Product;
  }

  // البحث في أصناف المنتجات
  const { data: variantData, error: variantError } = await supabase
    .from("product_variants")
    .select(`
      *,
      products:parent_product_id (*)
    `)
    .eq("barcode", barcode)
    .eq("active", true)
    .maybeSingle();

  if (variantData && variantData.products) {
    // إرجاع المنتج الأساسي مع معلومات الصنف المحدد
    return {
      ...variantData.products,
      selectedVariant: variantData,
      // استخدام سعر وبيانات الصنف بدلاً من المنتج الأساسي
      price: variantData.price,
      purchase_price: variantData.purchase_price,
      conversion_factor: variantData.conversion_factor
    } as Product & { selectedVariant: ProductVariant; conversion_factor: number };
  }

  if (productError && variantError) {
    console.error("Error fetching product by barcode:", productError, variantError);
    throw productError;
  }

  return null;
}

// إنشاء منتج جديد
export async function createProduct(product: Omit<Product, "id" | "created_at" | "updated_at">) {
  console.log("Creating product:", product);

  try {
    // تحديد نوع الباركود
    const barcodeType = product.barcode_type || 'normal';

    // تحديد وحدة القياس
    const unitOfMeasure = product.unit_of_measure || (barcodeType === 'scale' ? 'كيلوجرام' : 'قطعة');

    const productData = {
      ...product,
      barcode_type: barcodeType,
      unit_of_measure: unitOfMeasure,
      bulk_enabled: product.bulk_enabled || false,
      is_bulk: product.is_bulk || false,
      track_expiry: product.track_expiry || false,
    };

    const { data, error } = await supabase
      .from("products")
      .insert([productData])
      .select()
      .single();

    if (error) {
      console.error("Error creating product:", error);
      throw error;
    }

    console.log("Product created successfully:", data);

    // إنشاء سجل مخزون أولي للمنتج
    const branchId = await getCurrentBranchId();
    if (branchId) {
      await supabase
        .from("inventory")
        .insert([
          {
            product_id: data.id,
            quantity: 0,
            branch_id: branchId,
          },
        ]);
    }

    return data as Product;
  } catch (error) {
    console.error("Error in createProduct:", error);
    throw error;
  }
}

// تحديث منتج موجود
export async function updateProduct(id: string, product: Partial<Omit<Product, "id" | "created_at" | "updated_at">>) {
  console.log("Updating product:", id, product);

  try {
    // تحديد نوع الباركود إذا تم تحديده
    const updateData: any = { ...product };
    
    if (product.barcode_type) {
      // تحديث وحدة القياس حسب نوع الباركود
      updateData.unit_of_measure = product.barcode_type === 'scale' ? 'كيلوجرام' : 'قطعة';
    }

    // إزالة الحقول غير الموجودة في جدول المنتجات لمنع أخطاء PostgREST
    const { min_stock_level, created_at, updated_at, id: _id, ...cleanedData } = updateData;

    const { data, error } = await supabase
      .from("products")
      .update(cleanedData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating product:", error);
      throw error;
    }

    console.log("Product updated successfully:", data);

    // تحديث كمية المخزون إذا تم تحديدها
    if (product.quantity !== undefined) {
      const branchId = await getCurrentBranchId();
      
      if (branchId) {
        await supabase
          .from("inventory")
          .update({ quantity: product.quantity })
          .eq("product_id", id)
          .eq("branch_id", branchId);
      }
    }

    return data as Product;
  } catch (error) {
    console.error("Error in updateProduct:", error);
    throw error;
  }
}

// حذف منتج
export async function deleteProduct(id: string) {
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting product:", error);
    throw error;
  }

  console.log("Product deleted successfully");
}

// جلب منتجات حسب الفئة الرئيسية
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

// جلب منتجات حسب الشركة
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

// جلب منتجات حسب الفئة الفرعية
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

// جلب منتجات بدون فئة فرعية
export async function fetchProductsWithoutSubcategory() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .is("subcategory_id", null)
    .order("name");

  if (error) {
    console.error("Error fetching products without subcategory:", error);
    throw error;
  }

  return data as Product[];
}

// عد المنتجات بدون فئة فرعية
export async function getProductsWithoutSubcategoryCount() {
  const { count, error } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .is("subcategory_id", null);

  if (error) {
    console.error("Error counting products without subcategory:", error);
    throw error;
  }

  return count || 0;
}

// تعيين منتجات لفئة فرعية
export async function assignProductsToSubcategory(
  subcategoryId: string,
  mainCategoryId: string,
  productIds: string[]
) {
  const { data, error } = await supabase
    .from("products")
    .update({
      subcategory_id: subcategoryId,
      main_category_id: mainCategoryId,
    })
    .in("id", productIds)
    .select();

  if (error) {
    console.error("Error assigning products to subcategory:", error);
    throw error;
  }

  return data as Product[];
}

// تحديث كمية المخزون
export async function updateInventoryQuantity(
  productId: string,
  quantityChange: number,
  branchId?: string
) {
  try {
    const currentBranchId = branchId || await getCurrentBranchId();
    
    if (!currentBranchId) {
      throw new Error("No branch ID available");
    }

    // جلب الكمية الحالية
    const { data: currentInventory, error: fetchError } = await supabase
      .from("inventory")
      .select("quantity")
      .eq("product_id", productId)
      .eq("branch_id", currentBranchId)
      .single();

    if (fetchError) {
      console.error("Error fetching current inventory:", fetchError);
      throw fetchError;
    }

    const newQuantity = (currentInventory?.quantity || 0) + quantityChange;

    // تحديث الكمية في المخزون
    const { data: inventoryData, error: inventoryError } = await supabase
      .from("inventory")
      .update({ quantity: newQuantity })
      .eq("product_id", productId)
      .eq("branch_id", currentBranchId)
      .select();

    if (inventoryError) {
      console.error("Error updating inventory:", inventoryError);
      throw inventoryError;
    }

    // مزامنة الكمية الإجمالية في جدول المنتجات
    const { data: allInventory, error: sumError } = await supabase
      .from("inventory")
      .select("quantity")
      .eq("product_id", productId);

    if (sumError) {
      console.error("Error fetching all inventory for product:", sumError);
      throw sumError;
    }

    const totalQuantity = allInventory.reduce((sum, inv) => sum + (inv.quantity || 0), 0);

    // تحديث الكمية الإجمالية في جدول المنتجات
    const { error: productUpdateError } = await supabase
      .from("products")
      .update({ quantity: totalQuantity })
      .eq("id", productId);

    if (productUpdateError) {
      console.error("Error updating product total quantity:", productUpdateError);
      throw productUpdateError;
    }

    console.log(`Updated inventory for product ${productId}: ${quantityChange} (new total: ${totalQuantity})`);
    return inventoryData;
  } catch (error) {
    console.error("Error in updateInventoryQuantity:", error);
    throw error;
  }
}

// دالة مساعدة لتحديث كمية المنتج
export async function updateProductQuantity(
  productId: string,
  quantityChange: number,
  operation: 'increase' | 'decrease' = 'decrease',
  branchId?: string
) {
  const changeAmount = operation === 'increase' ? Math.abs(quantityChange) : -Math.abs(quantityChange);
  return updateInventoryQuantity(productId, changeAmount, branchId);
}

// إنشاء باركود للمنتج
export async function generateBarcodeForProduct(productId: string) {
  // هذه دالة مؤقتة - يمكن تطويرها لإنشاء باركود فعلي
  const timestamp = Date.now();
  const barcode = `PRD${timestamp}`;
  
  await updateProduct(productId, { barcode });
  return barcode;
}

// تحديث باركود المنتج
export async function updateProductBarcode(productId: string, barcode: string) {
  return updateProduct(productId, { barcode });
}