import { supabase } from "@/integrations/supabase/client";

export interface InventoryTransfer {
  id: string;
  from_branch_id: string;
  to_branch_id: string;
  product_id: string;
  quantity: number;
  status: string;
  requested_by?: string;
  confirmed_by?: string;
  completed_by?: string;
  request_date: string;
  confirmed_date?: string;
  completed_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  from_branch?: {
    id: string;
    name: string;
  };
  to_branch?: {
    id: string;
    name: string;
  };
  product?: {
    id: string;
    name: string;
    barcode?: string;
    image_urls?: string[];
  };
  requested_user?: {
    id: string;
    name: string;
  };
}

export const fetchInventoryTransfers = async (branchId?: string): Promise<InventoryTransfer[]> => {
  let query = supabase
    .from('inventory_transfers')
    .select(`
      *,
      from_branch:branches!inventory_transfers_from_branch_id_fkey (
        id,
        name
      ),
      to_branch:branches!inventory_transfers_to_branch_id_fkey (
        id,
        name
      ),
      product:products (
        id,
        name,
        barcode,
        image_urls
      ),
      requested_user:users!inventory_transfers_requested_by_fkey (
        id,
        name
      )
    `)
    .order('created_at', { ascending: false });

  if (branchId) {
    query = query.or(`from_branch_id.eq.${branchId},to_branch_id.eq.${branchId}`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching inventory transfers:', error);
    throw error;
  }

  return data || [];
};

export const createInventoryTransfer = async (transfer: {
  from_branch_id: string;
  to_branch_id: string;
  product_id: string;
  quantity: number;
  notes?: string;
}): Promise<InventoryTransfer> => {
  const { data, error } = await supabase
    .from('inventory_transfers')
    .insert({
      ...transfer,
      requested_by: (await supabase.auth.getUser()).data.user?.id
    })
    .select(`
      *,
      from_branch:branches!inventory_transfers_from_branch_id_fkey (
        id,
        name
      ),
      to_branch:branches!inventory_transfers_to_branch_id_fkey (
        id,
        name
      ),
      product:products (
        id,
        name,
        barcode,
        image_urls
      )
    `)
    .single();

  if (error) {
    console.error('Error creating inventory transfer:', error);
    throw error;
  }

  return data;
};

export const processInventoryTransfer = async (
  transferId: string,
  action: 'confirm' | 'complete' | 'cancel'
): Promise<boolean> => {
  const { data, error } = await supabase.rpc('process_inventory_transfer', {
    transfer_id: transferId,
    action: action
  });

  if (error) {
    console.error('Error processing inventory transfer:', error);
    throw error;
  }

  return data;
};

export const getTransferById = async (id: string): Promise<InventoryTransfer> => {
  const { data, error } = await supabase
    .from('inventory_transfers')
    .select(`
      *,
      from_branch:branches!inventory_transfers_from_branch_id_fkey (
        id,
        name
      ),
      to_branch:branches!inventory_transfers_to_branch_id_fkey (
        id,
        name
      ),
      product:products (
        id,
        name,
        barcode,
        image_urls
      ),
      requested_user:users!inventory_transfers_requested_by_fkey (
        id,
        name
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching transfer by id:', error);
    throw error;
  }

  return data;
};

export const getPendingTransfersByBranch = async (branchId: string): Promise<InventoryTransfer[]> => {
  const { data, error } = await supabase
    .from('inventory_transfers')
    .select(`
      *,
      from_branch:branches!inventory_transfers_from_branch_id_fkey (
        id,
        name
      ),
      to_branch:branches!inventory_transfers_to_branch_id_fkey (
        id,
        name
      ),
      product:products (
        id,
        name,
        barcode,
        image_urls
      )
    `)
    .eq('to_branch_id', branchId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pending transfers:', error);
    throw error;
  }

  return data || [];
};