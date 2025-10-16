/**
 * Schema-Aware Product Service
 * يدعم Multi-Schema Architecture للفروع الخارجية
 * 
 * ملاحظة: بسبب قيود TypeScript مع dynamic schemas في Supabase client،
 * نستخدم هذا الـ service كـ wrapper يحدد متى نستخدم schema مخصص
 */

import { supabase } from "@/integrations/supabase/client";
import { getBranchInfo, getSchemaForBranch } from "@/lib/schemaContext";
import type { Product } from "@/types";

/**
 * جلب المنتجات حسب الفرع مع دعم Multi-Schema
 */
export async function fetchProductsForBranch(
  branchId: string | null,
  filters?: {
    searchQuery?: string;
    categoryId?: string;
    companyId?: string;
  }
): Promise<Product[]> {
  try {
    const branchInfo = branchId ? await getBranchInfo(branchId) : null;
    const schema = await getSchemaForBranch(branchId);

    // إذا كان فرع خارجي مع schema مخصص، استخدم RPC
    if (schema !== 'public') {
      return await fetchProductsViaRPC(schema, filters);
    }

    // وإلا، استخدم الطريقة العادية (public schema)
    let query = supabase
      .from('products')
      .select('*')
      .order('name');

    // تطبيق الفلاتر
    if (filters?.searchQuery) {
      query = query.or(`name.ilike.%${filters.searchQuery}%,barcode.ilike.%${filters.searchQuery}%`);
    }

    if (filters?.categoryId) {
      query = query.eq('main_category_id', filters.categoryId);
    }

    if (filters?.companyId) {
      query = query.eq('company_id', filters.companyId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching products for branch:', error);
    throw error;
  }
}

/**
 * Helper function للـ fetch عبر RPC
 */
async function fetchProductsViaRPC(schema: string, filters?: any): Promise<Product[]> {
  // TODO: إنشاء RPC function في قاعدة البيانات لجلب المنتجات من schema محدد
  // في الوقت الحالي، نستخدم الطريقة العادية
  console.warn(`Schema-aware queries not fully implemented yet for schema: ${schema}`);
  
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name');

  if (error) throw error;
  return data || [];
}

/**
 * إنشاء منتج جديد في الـ schema المناسب
 */
export async function createProductInBranch(
  branchId: string | null,
  product: Omit<Product, 'id' | 'created_at' | 'updated_at'>
): Promise<Product | null> {
  try {
    const schema = await getSchemaForBranch(branchId);

    // للـ external branches مع schema مخصص، استخدم RPC
    if (schema !== 'public') {
      return await createProductViaRPC(schema, product);
    }

    // الطريقة العادية للـ public schema
    const { data, error } = await supabase
      .from('products')
      .insert(product as any)
      .select()
      .single();

    if (error) throw error;

    // إنشاء سجل inventory تلقائياً
    if (data && branchId) {
      await supabase
        .from('inventory')
        .insert({
          product_id: data.id,
          branch_id: branchId,
          quantity: product.quantity || 0
        });
    }

    return data;
  } catch (error) {
    console.error('Error creating product in branch:', error);
    throw error;
  }
}

/**
 * Helper function لإنشاء منتج عبر RPC
 */
async function createProductViaRPC(schema: string, product: any): Promise<Product | null> {
  // TODO: إنشاء RPC function
  console.warn(`Schema-aware insert not fully implemented yet for schema: ${schema}`);
  return null;
}

/**
 * تحديث منتج في الـ schema المناسب
 */
export async function updateProductInBranch(
  branchId: string | null,
  productId: string,
  updates: Partial<Product>
): Promise<Product | null> {
  try {
    const schema = await getSchemaForBranch(branchId);

    if (schema !== 'public') {
      return await updateProductViaRPC(schema, productId, updates);
    }

    const { data, error } = await supabase
      .from('products')
      .update(updates as any)
      .eq('id', productId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating product in branch:', error);
    throw error;
  }
}

/**
 * Helper function لتحديث منتج عبر RPC
 */
async function updateProductViaRPC(schema: string, productId: string, updates: any): Promise<Product | null> {
  console.warn(`Schema-aware update not fully implemented yet for schema: ${schema}`);
  return null;
}

/**
 * حذف منتج من الـ schema المناسب
 */
export async function deleteProductFromBranch(
  branchId: string | null,
  productId: string
): Promise<boolean> {
  try {
    const schema = await getSchemaForBranch(branchId);

    if (schema !== 'public') {
      return await deleteProductViaRPC(schema, productId);
    }

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting product from branch:', error);
    return false;
  }
}

/**
 * Helper function لحذف منتج عبر RPC
 */
async function deleteProductViaRPC(schema: string, productId: string): Promise<boolean> {
  console.warn(`Schema-aware delete not fully implemented yet for schema: ${schema}`);
  return false;
}

/**
 * جلب منتج واحد حسب ID
 */
export async function fetchProductById(
  branchId: string | null,
  productId: string
): Promise<Product | null> {
  try {
    const schema = await getSchemaForBranch(branchId);

    if (schema !== 'public') {
      return await fetchProductByIdViaRPC(schema, productId);
    }

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching product by id:', error);
    return null;
  }
}

/**
 * Helper function لجلب منتج عبر RPC
 */
async function fetchProductByIdViaRPC(schema: string, productId: string): Promise<Product | null> {
  console.warn(`Schema-aware fetch by id not fully implemented yet for schema: ${schema}`);
  return null;
}

/**
 * جلب المخزون للمنتجات
 */
export async function fetchInventoryForBranch(
  branchId: string | null
): Promise<any[]> {
  try {
    if (!branchId) return [];

    const schema = await getSchemaForBranch(branchId);

    if (schema !== 'public') {
      return await fetchInventoryViaRPC(schema);
    }

    const { data, error } = await supabase
      .from('inventory')
      .select(`
        *,
        products (*)
      `)
      .eq('branch_id', branchId)
      .order('products(name)');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching inventory for branch:', error);
    return [];
  }
}

/**
 * Helper function لجلب المخزون عبر RPC
 */
async function fetchInventoryViaRPC(schema: string): Promise<any[]> {
  console.warn(`Schema-aware inventory fetch not fully implemented yet for schema: ${schema}`);
  return [];
}
