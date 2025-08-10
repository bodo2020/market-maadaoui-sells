import { supabase } from "@/integrations/supabase/client";

export interface TransferItemInput {
  product_id: string;
  quantity: number;
}

export interface CreateTransferInput {
  from_branch_id: string;
  to_branch_id: string;
  notes?: string;
  items: TransferItemInput[];
}

export async function createTransfer(input: CreateTransferInput) {
  // 1) Create transfer header
  const { data: header, error: headerError } = await supabase
    .from('inventory_transfers')
    .insert([{ from_branch_id: input.from_branch_id, to_branch_id: input.to_branch_id, notes: input.notes || null }])
    .select('id, status')
    .single();
  if (headerError) throw headerError;

  const transferId = header!.id as string;

  if (!input.items?.length) return { id: transferId };

  // 2) Insert items
  const itemsPayload = input.items.map((it) => ({ transfer_id: transferId, product_id: it.product_id, quantity: Math.max(0, Math.floor(it.quantity)) }));
  const { error: itemsError } = await supabase.from('inventory_transfer_items').insert(itemsPayload);
  if (itemsError) throw itemsError;

  // 3) Apply inventory movement immediately (simple apply)
  for (const it of input.items) {
    // decrease from source
    await adjustInventory(it.product_id, input.from_branch_id, -Math.abs(it.quantity));
    // increase at destination
    await adjustInventory(it.product_id, input.to_branch_id, Math.abs(it.quantity));
  }

  return { id: transferId };
}

export async function listTransfers() {
  const { data, error } = await supabase
    .from('inventory_transfers')
    .select('id, status, created_at, from:from_branch_id(name), to:to_branch_id(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function adjustInventory(productId: string, branchId: string, delta: number) {
  // Read current
  const { data: inv, error: fetchError } = await supabase
    .from('inventory')
    .select('quantity, min_stock_level')
    .eq('product_id', productId)
    .eq('branch_id', branchId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const newQty = Math.max(0, (inv?.quantity || 0) + delta);
  const { error: upsertError } = await supabase
    .from('inventory')
    .upsert({ 
      product_id: productId, 
      branch_id: branchId, 
      quantity: newQty,
      min_stock_level: inv?.min_stock_level ?? 5
    }, { onConflict: 'product_id,branch_id' });
  if (upsertError) throw upsertError;
}
