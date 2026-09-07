import { supabase } from '@/integrations/supabase/client';
import type { Product } from '@/types';

const posRpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

function currentBranchId(): string {
  const branchId = typeof window !== 'undefined' ? localStorage.getItem('currentBranchId') : null;
  if (!branchId || branchId === 'null') throw new Error('BRANCH_REQUIRED');
  return branchId;
}

export async function fetchPOSProducts(search?: string): Promise<Product[]> {
  const { data, error } = await posRpc('get_pos_branch_catalog', {
    p_branch_id: currentBranchId(),
    p_search: search?.trim() || null,
    p_barcode: null,
    p_limit: 5000,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as Product[];
}

export async function fetchPOSProductByBarcode(barcode: string): Promise<{ product: Product | null; isBulkBarcode: boolean }> {
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) return { product: null, isBulkBarcode: false };
  const { data, error } = await posRpc('get_pos_branch_catalog', {
    p_branch_id: currentBranchId(),
    p_search: null,
    p_barcode: cleanBarcode,
    p_limit: 2,
  });
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []) as Product[];
  const product = rows[0] || null;
  return { product, isBulkBarcode: Boolean(product && product.bulk_barcode === cleanBarcode) };
}
