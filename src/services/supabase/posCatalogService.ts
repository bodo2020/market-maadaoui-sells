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

async function queryCatalog(params: { search?: string | null; barcode?: string | null; limit?: number }) {
  const { data, error } = await posRpc('get_pos_branch_catalog', {
    p_branch_id: currentBranchId(),
    p_search: params.search?.trim() || null,
    p_barcode: params.barcode?.trim() || null,
    p_limit: params.limit ?? 5000,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as Product[];
}

/**
 * DALI-style scale labels used in the store are based on a 6-digit product code
 * (normally starting with 2), followed by five weight digits and optionally one
 * final check digit. Example: 020001 01000 5 => product 020001, 1.000 kg.
 */
function parseScaleBarcode(barcode: string): { productBarcode: string; weight: number } | null {
  if (!/^\d+$/.test(barcode)) return null;
  if (barcode.length !== 11 && barcode.length !== 12) return null;

  const productBarcode = barcode.slice(0, 6);
  if (!productBarcode.startsWith('2') && !productBarcode.startsWith('02')) return null;

  const weightDigits = barcode.slice(6, 11);
  if (!/^\d{5}$/.test(weightDigits)) return null;
  const weight = Number(weightDigits) / 1000;
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) return null;

  return { productBarcode, weight: Number(weight.toFixed(3)) };
}

export async function fetchPOSProducts(search?: string): Promise<Product[]> {
  return queryCatalog({ search, barcode: null, limit: 5000 });
}

export async function fetchPOSProductByBarcode(barcode: string): Promise<{ product: Product | null; isBulkBarcode: boolean }> {
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) return { product: null, isBulkBarcode: false };

  // Always prefer an exact product/bulk barcode match.
  const exactRows = await queryCatalog({ search: null, barcode: cleanBarcode, limit: 2 });
  const exactProduct = exactRows[0] || null;
  if (exactProduct) {
    return {
      product: exactProduct,
      isBulkBarcode: Boolean(exactProduct.bulk_barcode === cleanBarcode),
    };
  }

  // If the label is an encoded scale barcode, resolve the 6-digit product code
  // against the branch catalog, then attach the decoded weight for the POS cart.
  const scale = parseScaleBarcode(cleanBarcode);
  if (!scale) return { product: null, isBulkBarcode: false };

  const scaleRows = await queryCatalog({ search: null, barcode: scale.productBarcode, limit: 2 });
  const scaleProduct = scaleRows[0] || null;
  if (!scaleProduct || scaleProduct.barcode_type !== 'scale') {
    return { product: null, isBulkBarcode: false };
  }

  const effectivePrice = Number(scaleProduct.is_offer && scaleProduct.offer_price != null
    ? scaleProduct.offer_price
    : scaleProduct.price || 0);

  return {
    product: {
      ...scaleProduct,
      calculated_weight: scale.weight,
      calculated_price: Number((effectivePrice * scale.weight).toFixed(2)),
    },
    isBulkBarcode: false,
  };
}
