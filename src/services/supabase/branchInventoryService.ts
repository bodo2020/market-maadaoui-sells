import { supabase } from "@/integrations/supabase/client";

export interface BranchInventory {
  id: string;
  product_id: string;
  branch_id: string;
  quantity: number;
  min_stock_level: number;
  max_stock_level: number;
  created_at: string;
  updated_at: string;
  products?: {
    id: string;
    name: string;
    barcode?: string;
    price: number;
    image_urls?: string[];
  };
}

export const fetchBranchInventory = async (branchId: string): Promise<BranchInventory[]> => {
  const { data, error } = await supabase
    .from('branch_inventory')
    .select(`
      *,
      products:product_id (
        id,
        name,
        barcode,
        price,
        image_urls
      )
    `)
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching branch inventory:', error);
    throw error;
  }

  return data || [];
};

export const updateBranchInventoryQuantity = async (
  productId: string,
  branchId: string,
  quantityChange: number
): Promise<number> => {
  // First get current quantity
  const { data: currentInventory, error: fetchError } = await supabase
    .from('branch_inventory')
    .select('quantity')
    .eq('product_id', productId)
    .eq('branch_id', branchId)
    .single();

  if (fetchError) {
    console.error('Error fetching current inventory:', fetchError);
    throw fetchError;
  }

  const newQuantity = Math.max(0, (currentInventory?.quantity || 0) + quantityChange);

  const { data, error } = await supabase
    .from('branch_inventory')
    .update({ 
      quantity: newQuantity,
      updated_at: new Date().toISOString()
    })
    .eq('product_id', productId)
    .eq('branch_id', branchId)
    .select('quantity')
    .single();

  if (error) {
    console.error('Error updating branch inventory:', error);
    throw error;
  }

  return data?.quantity || 0;
};

export const setBranchInventoryQuantity = async (
  productId: string,
  branchId: string,
  quantity: number
): Promise<void> => {
  const { error } = await supabase
    .from('branch_inventory')
    .upsert({
      product_id: productId,
      branch_id: branchId,
      quantity: Math.max(0, quantity),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'product_id,branch_id'
    });

  if (error) {
    console.error('Error setting branch inventory:', error);
    throw error;
  }
};

export const createBranchInventoryForProduct = async (
  productId: string,
  branchId: string,
  initialQuantity: number = 0
): Promise<BranchInventory> => {
  const { data, error } = await supabase
    .from('branch_inventory')
    .insert({
      product_id: productId,
      branch_id: branchId,
      quantity: initialQuantity
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating branch inventory:', error);
    throw error;
  }

  return data;
};

export const getLowStockItems = async (branchId: string): Promise<BranchInventory[]> => {
  const { data, error } = await supabase
    .from('branch_inventory')
    .select(`
      *,
      products:product_id (
        id,
        name,
        barcode,
        price,
        image_urls
      )
    `)
    .eq('branch_id', branchId)
    .lt('quantity', 'min_stock_level')
    .order('quantity', { ascending: true });

  if (error) {
    console.error('Error fetching low stock items:', error);
    throw error;
  }

  return data || [];
};