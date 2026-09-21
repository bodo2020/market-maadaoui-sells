import { supabase } from '@/integrations/supabase/client';
import type { Product } from '@/types';
import { readPOSCatalogSnapshot, savePOSCatalogSnapshot } from '@/services/offline/posOfflineStore';

const posRpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

type CatalogCache = {
  branchId: string;
  products: Product[];
  loadedAt: number;
};

let catalogCache: CatalogCache | null = null;
let catalogRequest: Promise<Product[]> | null = null;

function currentBranchId(): string {
  const branchId = typeof window !== 'undefined' ? localStorage.getItem('currentBranchId') : null;
  if (!branchId || branchId === 'null') throw new Error('BRANCH_REQUIRED');
  return branchId;
}

function normalizeCatalogProduct(product: Product): Product {
  // Once a product has linked sale units (carton/pack/etc), those rows are the
  // canonical POS entry points. Keep the legacy bulk_* values in the database
  // for backwards compatibility, but do not expose the old bulk button as a
  // second selling path in POS.
  if (product.has_variants && !product.is_linked_sale_unit) {
    return {
      ...product,
      bulk_enabled: false,
      bulk_quantity: null,
      bulk_price: null,
      bulk_barcode: null,
    };
  }
  return product;
}

async function queryCatalog(params: { search?: string | null; barcode?: string | null; limit?: number }) {
  const { data, error } = await posRpc('get_pos_branch_catalog', {
    p_branch_id: currentBranchId(),
    p_search: params.search?.trim() || null,
    p_barcode: params.barcode?.trim() || null,
    p_limit: params.limit ?? 500,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(row => normalizeCatalogProduct(row as Product));
}

function localSearch(products: Product[], query: string): Product[] {
  const value = query.trim().toLocaleLowerCase('ar');
  if (!value) return products;
  return products.filter(product =>
    product.name?.toLocaleLowerCase('ar').includes(value)
    || product.barcode?.includes(value)
    || product.bulk_barcode?.includes(value),
  ).slice(0, 100);
}

type ScaleBarcode = {
  productCandidates: string[];
  weight: number;
};

/**
 * Store scale products are saved with a six-digit PLU-like barcode such as
 * 000034. DALI labels can be printed as:
 *   PP + PLU(4) + WEIGHT(5) + optional check digit
 * Example: 02 0034 01000 5 => stored product 000034, weight 1.000 kg.
 *
 * We also keep the first six digits as a fallback candidate because some scale
 * configurations save that whole prefix+PLU value as the product barcode.
 */
function parseScaleBarcode(barcode: string): ScaleBarcode | null {
  if (!/^\d+$/.test(barcode)) return null;
  if (barcode.length !== 11 && barcode.length !== 12) return null;

  const prefix = barcode.slice(0, 2);
  const looksLikeScalePrefix = prefix === '02' || /^2\d$/.test(prefix);
  if (!looksLikeScalePrefix) return null;

  const plu = barcode.slice(2, 6);
  const weightDigits = barcode.slice(6, 11);
  if (!/^\d{4}$/.test(plu) || !/^\d{5}$/.test(weightDigits)) return null;

  const weight = Number(weightDigits) / 1000;
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) return null;

  const candidates = [
    plu.padStart(6, '0'),
    barcode.slice(0, 6),
  ];

  return {
    productCandidates: [...new Set(candidates)],
    weight: Number(weight.toFixed(3)),
  };
}

export function invalidatePOSCatalogCache(branchId?: string) {
  if (!catalogCache) return;
  if (!branchId || catalogCache.branchId === branchId) catalogCache = null;
}

export async function fetchPOSProducts(search?: string): Promise<Product[]> {
  const branchId = currentBranchId();
  const query = search?.trim();

  if (query) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const local = catalogCache?.branchId === branchId ? catalogCache.products : (await readPOSCatalogSnapshot(branchId))?.products || [];
      return localSearch(local, query);
    }
    try {
      return await queryCatalog({ search: query, barcode: null, limit: 100 });
    } catch (error) {
      const local = catalogCache?.branchId === branchId ? catalogCache.products : (await readPOSCatalogSnapshot(branchId))?.products || [];
      if (local.length) return localSearch(local, query);
      throw error;
    }
  }

  if (catalogCache?.branchId === branchId) return catalogCache.products;
  if (catalogRequest) return catalogRequest;

  catalogRequest = (async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const snapshot = await readPOSCatalogSnapshot(branchId);
      if (!snapshot?.products.length) throw new Error('افتح نقطة البيع مرة واحدة بالإنترنت لتحميل المنتجات على الجهاز.');
      catalogCache = { branchId, products: snapshot.products, loadedAt: Date.parse(snapshot.savedAt) || Date.now() };
      return snapshot.products;
    }
    try {
      // A full branch snapshot makes name search and barcode scanning available offline.
      const products = await queryCatalog({ search: null, barcode: null, limit: 5000 });
      catalogCache = { branchId, products, loadedAt: Date.now() };
      await savePOSCatalogSnapshot(branchId, products);
      return products;
    } catch (error) {
      const snapshot = await readPOSCatalogSnapshot(branchId);
      if (!snapshot?.products.length) throw error;
      catalogCache = { branchId, products: snapshot.products, loadedAt: Date.parse(snapshot.savedAt) || Date.now() };
      return snapshot.products;
    }
  })()
    .finally(() => {
      catalogRequest = null;
    });

  return catalogRequest;
}

export async function fetchPOSProductByBarcode(barcode: string): Promise<{ product: Product | null; isBulkBarcode: boolean }> {
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) return { product: null, isBulkBarcode: false };

  const branchId = currentBranchId();
  const localProducts = async () => catalogCache?.branchId === branchId
    ? catalogCache.products
    : (await readPOSCatalogSnapshot(branchId))?.products || [];
  const localExact = async (value: string) => (await localProducts()).find(product => product.barcode === value || product.bulk_barcode === value) || null;

  // Always prefer an exact product/bulk barcode match.
  let exactProduct: Product | null = null;
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) exactProduct = await localExact(cleanBarcode);
    else exactProduct = (await queryCatalog({ search: null, barcode: cleanBarcode, limit: 2 }))[0] || null;
  } catch (error) {
    exactProduct = await localExact(cleanBarcode);
    if (!exactProduct && !(await localProducts()).length) throw error;
  }
  if (exactProduct) {
    return {
      product: exactProduct,
      isBulkBarcode: Boolean(exactProduct.bulk_barcode === cleanBarcode),
    };
  }

  const scale = parseScaleBarcode(cleanBarcode);
  if (!scale) return { product: null, isBulkBarcode: false };

  let scaleProduct: Product | null = null;
  for (const candidate of scale.productCandidates) {
    let product: Product | null = null;
    try {
      product = typeof navigator !== 'undefined' && !navigator.onLine
        ? await localExact(candidate)
        : (await queryCatalog({ search: null, barcode: candidate, limit: 2 }))[0] || null;
    } catch {
      product = await localExact(candidate);
    }
    if (product?.barcode_type === 'scale') {
      scaleProduct = product;
      break;
    }
  }

  if (!scaleProduct) return { product: null, isBulkBarcode: false };

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
