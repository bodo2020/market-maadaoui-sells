import type { Product, Sale } from "@/types";
import type { POSPaymentMethod } from "@/services/supabase/posPaymentMethodService";

const DB_NAME = "elmadawy-pos-offline";
const DB_VERSION = 1;
const CATALOG_STORE = "catalog";
const PAYMENT_STORE = "payment-methods";
const OUTBOX_STORE = "sales-outbox";

export type POSCatalogSnapshot = {
  branchId: string;
  products: Product[];
  savedAt: string;
};

export type POSPaymentMethodsSnapshot = {
  branchId: string;
  methods: POSPaymentMethod[];
  savedAt: string;
};

export type OfflineSaleStatus = "pending" | "syncing" | "needs_review" | "synced";

export type OfflineSaleRecord = {
  id: string;
  branchId: string;
  userId: string;
  checkoutId: string;
  fingerprint: string;
  payload: Record<string, unknown>;
  optimisticSale: Sale & Record<string, unknown>;
  status: OfflineSaleStatus;
  attempts: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string | null;
};

let databasePromise: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("OFFLINE_STORAGE_UNAVAILABLE"));

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CATALOG_STORE)) db.createObjectStore(CATALOG_STORE, { keyPath: "branchId" });
      if (!db.objectStoreNames.contains(PAYMENT_STORE)) db.createObjectStore(PAYMENT_STORE, { keyPath: "branchId" });
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
        store.createIndex("branchId", "branchId", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error("OFFLINE_STORAGE_OPEN_FAILED"));
    };
  });
  return databasePromise;
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("OFFLINE_STORAGE_REQUEST_FAILED"));
  });
}

async function getValue<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
  const db = await database();
  const transaction = db.transaction(storeName, "readonly");
  const result = await requestValue(transaction.objectStore(storeName).get(key));
  return (result as T | undefined) || null;
}

async function putValue<T>(storeName: string, value: T): Promise<void> {
  const db = await database();
  const transaction = db.transaction(storeName, "readwrite");
  await requestValue(transaction.objectStore(storeName).put(value));
}

export async function savePOSCatalogSnapshot(branchId: string, products: Product[]): Promise<void> {
  await putValue<POSCatalogSnapshot>(CATALOG_STORE, { branchId, products, savedAt: new Date().toISOString() });
}

export async function readPOSCatalogSnapshot(branchId: string): Promise<POSCatalogSnapshot | null> {
  return getValue<POSCatalogSnapshot>(CATALOG_STORE, branchId);
}

export async function saveOfflineSaleWithStockDeduction(record: OfflineSaleRecord, items: Sale["items"]): Promise<void> {
  const db = await database();
  const transaction = db.transaction([OUTBOX_STORE, CATALOG_STORE], "readwrite");
  const completed = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("OFFLINE_STORAGE_TRANSACTION_FAILED"));
    transaction.onabort = () => reject(transaction.error || new Error("OFFLINE_STORAGE_TRANSACTION_ABORTED"));
  });
  const outbox = transaction.objectStore(OUTBOX_STORE);
  const existing = await requestValue(outbox.get(record.id)) as OfflineSaleRecord | undefined;
  if (existing) {
    transaction.abort();
    try { await completed; } catch { /* Existing record is already durable. */ }
    return;
  }

  const catalog = transaction.objectStore(CATALOG_STORE);
  const snapshot = await requestValue(catalog.get(record.branchId)) as POSCatalogSnapshot | undefined;
  if (snapshot) {
    const baseDeductions = new Map<string, number>();
    items.forEach(item => {
      const amount = Number(item.weight ?? item.quantity ?? 0);
      const baseProductId = item.product.parent_product_id || item.product.id;
      const factor = item.product.is_linked_sale_unit ? Math.max(1, Number(item.product.conversion_factor || 1)) : 1;
      baseDeductions.set(baseProductId, (baseDeductions.get(baseProductId) || 0) + amount * factor);
    });
    const products = snapshot.products.map(product => {
      const baseProductId = product.parent_product_id || product.id;
      const baseDeduction = baseDeductions.get(baseProductId) || 0;
      if (baseDeduction <= 0) return product;
      const factor = product.is_linked_sale_unit ? Math.max(1, Number(product.conversion_factor || 1)) : 1;
      const nextBase = Math.max(0, Number(product.base_quantity ?? product.quantity ?? 0) - baseDeduction);
      return {
        ...product,
        quantity: product.is_linked_sale_unit ? Math.floor(nextBase / factor) : nextBase,
        ...(product.base_quantity != null ? { base_quantity: nextBase } : {}),
      };
    });
    catalog.put({ ...snapshot, products, savedAt: new Date().toISOString() });
  }
  outbox.put(record);
  await completed;
  window.dispatchEvent(new CustomEvent("pos:offline-outbox-changed"));
}

export async function savePOSPaymentMethodsSnapshot(branchId: string, methods: POSPaymentMethod[]): Promise<void> {
  await putValue<POSPaymentMethodsSnapshot>(PAYMENT_STORE, { branchId, methods, savedAt: new Date().toISOString() });
}

export async function readPOSPaymentMethodsSnapshot(branchId: string): Promise<POSPaymentMethodsSnapshot | null> {
  return getValue<POSPaymentMethodsSnapshot>(PAYMENT_STORE, branchId);
}

export async function readOfflineSale(id: string): Promise<OfflineSaleRecord | null> {
  return getValue<OfflineSaleRecord>(OUTBOX_STORE, id);
}

export async function updateOfflineSale(id: string, patch: Partial<OfflineSaleRecord>): Promise<OfflineSaleRecord | null> {
  const current = await getValue<OfflineSaleRecord>(OUTBOX_STORE, id);
  if (!current) return null;
  const next = { ...current, ...patch, id: current.id, updatedAt: new Date().toISOString() };
  await putValue<OfflineSaleRecord>(OUTBOX_STORE, next);
  window.dispatchEvent(new CustomEvent("pos:offline-outbox-changed"));
  return next;
}

export async function listOfflineSales(branchId?: string): Promise<OfflineSaleRecord[]> {
  const db = await database();
  const transaction = db.transaction(OUTBOX_STORE, "readonly");
  const store = transaction.objectStore(OUTBOX_STORE);
  const rows = branchId
    ? await requestValue(store.index("branchId").getAll(branchId))
    : await requestValue(store.getAll());
  return (rows as OfflineSaleRecord[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getOfflineOutboxSummary(branchId?: string) {
  const rows = await listOfflineSales(branchId);
  return {
    pending: rows.filter(row => row.status === "pending" || row.status === "syncing").length,
    needsReview: rows.filter(row => row.status === "needs_review").length,
    lastSyncedAt: rows.filter(row => row.status === "synced" && row.syncedAt).map(row => row.syncedAt as string).sort().at(-1) || null,
  };
}

export async function pruneSyncedOfflineSales(olderThanMs = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  const db = await database();
  const transaction = db.transaction(OUTBOX_STORE, "readwrite");
  const completed = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("OFFLINE_STORAGE_TRANSACTION_FAILED"));
  });
  const store = transaction.objectStore(OUTBOX_STORE);
  const rows = await requestValue(store.index("status").getAll("synced")) as OfflineSaleRecord[];
  const cutoff = Date.now() - olderThanMs;
  rows.filter(row => Date.parse(row.syncedAt || row.updatedAt) < cutoff).forEach(row => store.delete(row.id));
  await completed;
}
