import { supabase } from "@/integrations/supabase/client";
import { ProductBatch } from "@/types";

export async function fetchProductBatches(productId?: string, branchId?: string): Promise<ProductBatch[]> {
  try {
    const currentBranchId = branchId || localStorage.getItem('currentBranchId');
    
    let query = supabase
      .from("product_batches")
      .select(`
        *,
        products(name, shelf_location, barcode)
      `)
      .order("expiry_date", { ascending: true });

    if (productId) {
      query = query.eq("product_id", productId);
    }

    if (currentBranchId) {
      query = query.eq("branch_id", currentBranchId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching product batches:", error);
      throw error;
    }

    return data as ProductBatch[];
  } catch (error) {
    console.error("Error in fetchProductBatches:", error);
    return [];
  }
}

export async function createProductBatch(batch: Omit<ProductBatch, "id" | "created_at" | "updated_at">): Promise<ProductBatch> {
  try {
    const currentBranchId = localStorage.getItem('currentBranchId');
    
    const batchWithBranch: any = {
      ...batch,
      branch_id: currentBranchId
    };

    const { data, error } = await supabase
      .from("product_batches")
      .insert(batchWithBranch)
      .select()
      .single();

    if (error) {
      console.error("Error creating product batch:", error);
      throw error;
    }

    return data as ProductBatch;
  } catch (error) {
    console.error("Error in createProductBatch:", error);
    throw error;
  }
}

export async function updateProductBatch(id: string, updates: Partial<ProductBatch>): Promise<ProductBatch> {
  try {
    const { data, error } = await supabase
      .from("product_batches")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating product batch:", error);
      throw error;
    }

    return data as ProductBatch;
  } catch (error) {
    console.error("Error in updateProductBatch:", error);
    throw error;
  }
}

export async function deleteProductBatch(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("product_batches")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting product batch:", error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error("Error in deleteProductBatch:", error);
    return false;
  }
}

export async function getExpiringProducts(daysAhead: number = 7, branchId?: string): Promise<ProductBatch[]> {
  try {
    const currentBranchId = branchId || localStorage.getItem('currentBranchId');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    let query = supabase
      .from("product_batches")
      .select(`
        *,
        products!inner(name, shelf_location, barcode)
      `)
      .lte("expiry_date", futureDate.toISOString().split('T')[0])
      .gt("quantity", 0)
      .order("expiry_date", { ascending: true });

    if (currentBranchId) {
      query = query.eq("branch_id", currentBranchId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching expiring products:", error);
      throw error;
    }

    return data as ProductBatch[];
  } catch (error) {
    console.error("Error in getExpiringProducts:", error);
    return [];
  }
}

export async function getProductsByShelfLocation(shelfLocation: string): Promise<ProductBatch[]> {
  try {
    const { data, error } = await supabase
      .from("product_batches")
      .select(`
        *,
        products!inner(name, price)
      `)
      .eq("shelf_location", shelfLocation)
      .gt("quantity", 0)
      .order("expiry_date", { ascending: true });

    if (error) {
      console.error("Error fetching products by shelf location:", error);
      throw error;
    }

    return data as ProductBatch[];
  } catch (error) {
    console.error("Error in getProductsByShelfLocation:", error);
    return [];
  }
}