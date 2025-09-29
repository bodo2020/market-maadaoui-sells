import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types";

// جلب المنتجات المرتبطة بمنتج أساسي
export async function getLinkedProducts(parentId: string): Promise<Product[]> {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("parent_product_id", parentId)
      .order("name");

    if (error) {
      console.error("Error fetching linked products:", error);
      throw error;
    }

    return data as Product[];
  } catch (error) {
    console.error("Error in getLinkedProducts:", error);
    return [];
  }
}

// جلب المنتج الأساسي لمنتج مرتبط
export async function getParentProduct(productId: string): Promise<Product | null> {
  try {
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("parent_product_id")
      .eq("id", productId)
      .single();

    if (productError || !product?.parent_product_id) {
      return null;
    }

    const { data: parentProduct, error: parentError } = await supabase
      .from("products")
      .select("*")
      .eq("id", product.parent_product_id)
      .single();

    if (parentError) {
      console.error("Error fetching parent product:", parentError);
      throw parentError;
    }

    return parentProduct as Product;
  } catch (error) {
    console.error("Error in getParentProduct:", error);
    return null;
  }
}

// إنشاء منتج مرتبط
export async function createLinkedProduct(
  parentProduct: Product,
  linkedProductData: {
    barcode?: string;
    image_urls?: string[];
    price: number;
    shared_inventory?: boolean;
    conversion_factor?: number;
  }
): Promise<Product> {
  try {
    const productData = {
      // نسخ البيانات من المنتج الأساسي
      name: parentProduct.name,
      description: parentProduct.description,
      purchase_price: parentProduct.purchase_price,
      main_category_id: parentProduct.main_category_id,
      subcategory_id: parentProduct.subcategory_id,
      company_id: parentProduct.company_id,
      manufacturer_name: parentProduct.manufacturer_name,
      unit_of_measure: parentProduct.unit_of_measure,
      bulk_enabled: parentProduct.bulk_enabled,
      bulk_quantity: parentProduct.bulk_quantity,
      bulk_price: parentProduct.bulk_price,
      
      // البيانات المخصصة للمنتج المرتبط
      barcode: linkedProductData.barcode,
      image_urls: linkedProductData.image_urls || [],
      price: linkedProductData.price,
      quantity: linkedProductData.shared_inventory ? parentProduct.quantity : 0,
      
      // ربط بالمنتج الأساسي
      parent_product_id: parentProduct.id,
      shared_inventory: linkedProductData.shared_inventory || false,
      conversion_factor: linkedProductData.conversion_factor || 1,
      
      // قيم افتراضية
      is_offer: false,
      is_bulk: false,
    };

    const { data, error } = await supabase
      .from("products")
      .insert([productData])
      .select();

    if (error) {
      console.error("Error creating linked product:", error);
      throw error;
    }

    return data[0] as Product;
  } catch (error) {
    console.error("Error in createLinkedProduct:", error);
    throw error;
  }
}

// مزامنة المخزون للمنتجات المترابطة
export async function syncLinkedProductsInventory(
  productId: string,
  quantityChange: number
): Promise<void> {
  try {
    // جلب بيانات المنتج
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("parent_product_id, shared_inventory")
      .eq("id", productId)
      .single();

    if (productError) {
      console.error("Error fetching product:", productError);
      throw productError;
    }

    // إذا كان المنتج مرتبط ومشاركة المخزون مفعلة
    if (product.parent_product_id && product.shared_inventory) {
      // جلب الكمية الحالية للمنتج الأساسي
      const { data: parentInventory, error: parentInventoryError } = await supabase
        .from("inventory")
        .select("quantity")
        .eq("product_id", product.parent_product_id)
        .single();

      if (parentInventoryError) {
        console.error("Error fetching parent inventory:", parentInventoryError);
        throw parentInventoryError;
      }

      const newQuantity = Math.max(0, (parentInventory?.quantity || 0) + quantityChange);

      // تحديث كمية المنتج الأساسي
      const { error: parentUpdateError } = await supabase
        .from("inventory")
        .update({ 
          quantity: newQuantity,
          updated_at: new Date().toISOString()
        })
        .eq("product_id", product.parent_product_id);

      if (parentUpdateError) {
        console.error("Error updating parent product inventory:", parentUpdateError);
        throw parentUpdateError;
      }

      // جلب جميع المنتجات المرتبطة التي تشارك المخزون
      const { data: linkedProducts, error: linkedProductsError } = await supabase
        .from("products")
        .select("id")
        .eq("parent_product_id", product.parent_product_id)
        .eq("shared_inventory", true)
        .neq("id", productId);

      if (linkedProductsError) {
        console.error("Error fetching linked products:", linkedProductsError);
        throw linkedProductsError;
      }

      // تحديث كمية المنتجات المرتبطة الأخرى
      if (linkedProducts && linkedProducts.length > 0) {
        const productIds = linkedProducts.map(p => p.id);
        
        const { error: linkedUpdateError } = await supabase
          .from("inventory")
          .update({ 
            quantity: newQuantity,
            updated_at: new Date().toISOString()
          })
          .in("product_id", productIds);

        if (linkedUpdateError) {
          console.error("Error updating linked products inventory:", linkedUpdateError);
          throw linkedUpdateError;
        }
      }
    }
    // إذا كان المنتج أساسي
    else if (!product.parent_product_id) {
      // جلب المنتجات المرتبطة التي تشارك المخزون
      const { data: linkedProducts, error: linkedError } = await supabase
        .from("products")
        .select("id")
        .eq("parent_product_id", productId)
        .eq("shared_inventory", true);

      if (linkedError) {
        console.error("Error fetching linked products:", linkedError);
        throw linkedError;
      }

      // جلب الكمية الحالية للمنتج الحالي
      const { data: currentInventory, error: currentInventoryError } = await supabase
        .from("inventory")
        .select("quantity")
        .eq("product_id", productId)
        .single();

      if (currentInventoryError) {
        console.error("Error fetching current inventory:", currentInventoryError);
        throw currentInventoryError;
      }

      const newQuantity = Math.max(0, (currentInventory?.quantity || 0) + quantityChange);

      // تحديث كمية المنتجات المرتبطة
      if (linkedProducts && linkedProducts.length > 0) {
        const productIds = linkedProducts.map(p => p.id);
        
        const { error: updateError } = await supabase
          .from("inventory")
          .update({ 
            quantity: newQuantity,
            updated_at: new Date().toISOString()
          })
          .in("product_id", productIds);

        if (updateError) {
          console.error("Error updating linked products inventory:", updateError);
          throw updateError;
        }
      }
    }
  } catch (error) {
    console.error("Error in syncLinkedProductsInventory:", error);
    throw error;
  }
}

// فصل منتج عن المنتج الأساسي
export async function unlinkProduct(productId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("products")
      .update({
        parent_product_id: null,
        shared_inventory: false
      })
      .eq("id", productId);

    if (error) {
      console.error("Error unlinking product:", error);
      throw error;
    }
  } catch (error) {
    console.error("Error in unlinkProduct:", error);
    throw error;
  }
}

// ربط منتج بمنتج أساسي آخر
export async function relinkProduct(
  productId: string,
  newParentId: string,
  shareInventory: boolean = false
): Promise<void> {
  try {
    const { error } = await supabase
      .from("products")
      .update({
        parent_product_id: newParentId,
        shared_inventory: shareInventory
      })
      .eq("id", productId);

    if (error) {
      console.error("Error relinking product:", error);
      throw error;
    }
  } catch (error) {
    console.error("Error in relinkProduct:", error);
    throw error;
  }
}