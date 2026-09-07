import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import type { POSTab } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { supabase } from "@/integrations/supabase/client";
import { getLocalPosDevice } from "@/services/supabase/posDeviceService";
import { getMyPosWorkspace, saveMyPosWorkspace } from "@/services/supabase/posWorkspaceBackupService";

type Props = { children: ReactNode };

type PendingSaleCache = {
  requestId?: string;
  confirmed?: boolean;
};

type RecoveredSale = {
  id: string;
  invoice_number: string;
  total: number;
};

function readLocalTabs(): POSTab[] {
  try {
    const raw = localStorage.getItem("pos_tabs");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalTabs(tabs: POSTab[]) {
  try { localStorage.setItem("pos_tabs", JSON.stringify(tabs)); } catch { /* noop */ }
}

function hasMeaningfulWorkspace(tabs: POSTab[]) {
  return tabs.some(tab =>
    (Array.isArray(tab.cartItems) && tab.cartItems.length > 0)
    || Boolean(tab.customerName)
    || Boolean(tab.customerPhone)
  ) || tabs.length > 1;
}

function activeTabId() {
  try { return localStorage.getItem("pos_active_tab"); } catch { return null; }
}

function serializeWorkspace(tabs: POSTab[], activeId: string | null) {
  return JSON.stringify({ tabs, activeId });
}

async function reconcileCommittedSales(userId: string, branchId: string): Promise<RecoveredSale | null> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;

  const prefix = `pos-sale-request:${userId}:${branchId}:`;
  const entries: Array<{ key: string; checkoutId: string; requestId: string }> = [];

  try {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const pending = JSON.parse(raw) as PendingSaleCache;
      if (!pending?.requestId) continue;
      entries.push({ key, checkoutId: key.slice(prefix.length), requestId: pending.requestId });
    }
  } catch {
    return null;
  }

  if (!entries.length) return null;

  const ids = [...new Set(entries.map(entry => entry.requestId))];
  const { data, error } = await supabase
    .from("sales")
    .select("id, invoice_number, total, cashier_id, branch_id, date")
    .in("id", ids)
    .eq("cashier_id", userId)
    .eq("branch_id", branchId)
    .order("date", { ascending: false });

  if (error || !data?.length) return null;

  const committed = new Map(data.map(row => [row.id, row]));
  let tabs = readLocalTabs();
  let changed = false;
  let latest: RecoveredSale | null = null;

  for (const entry of entries) {
    const sale = committed.get(entry.requestId);
    if (!sale) continue;

    tabs = tabs.map(tab => tab.id === entry.checkoutId ? {
      ...tab,
      cartItems: [],
      selectedCustomer: "",
      customerName: "",
      customerPhone: "",
      search: "",
      searchResults: [],
    } : tab);
    changed = true;
    try { localStorage.removeItem(entry.key); } catch { /* noop */ }

    if (!latest) {
      latest = {
        id: sale.id,
        invoice_number: sale.invoice_number,
        total: Number(sale.total || 0),
      };
    }
  }

  if (changed) writeLocalTabs(tabs);
  return latest;
}

export default function PosWorkspaceRecoveryGate({ children }: Props) {
  const { user } = useAuth();
  const { currentBranchId } = useBranchStore();
  const [ready, setReady] = useState(false);
  const [recoveredSale, setRecoveredSale] = useState<RecoveredSale | null>(null);
  const lastSavedRef = useRef<string>("");

  const device = useMemo(
    () => currentBranchId ? getLocalPosDevice(currentBranchId) : null,
    [currentBranchId],
  );

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setRecoveredSale(null);

    const recover = async () => {
      if (!user?.id || !currentBranchId) {
        if (!cancelled) setReady(true);
        return;
      }

      if (typeof navigator === "undefined" || navigator.onLine) {
        try {
          const confirmed = await reconcileCommittedSales(user.id, currentBranchId);
          if (!cancelled && confirmed) setRecoveredSale(confirmed);
        } catch {
          // A failed reconciliation must never block the cashier.
        }
      }

      const localTabs = readLocalTabs();
      if (hasMeaningfulWorkspace(localTabs) || (typeof navigator !== "undefined" && !navigator.onLine)) {
        if (!cancelled) setReady(true);
        return;
      }

      try {
        const backup = await Promise.race([
          getMyPosWorkspace(currentBranchId),
          new Promise<null>(resolve => window.setTimeout(() => resolve(null), 1400)),
        ]);
        if (!cancelled && backup?.tabs && hasMeaningfulWorkspace(backup.tabs)) {
          localStorage.setItem("pos_tabs", JSON.stringify(backup.tabs));
          if (backup.active_tab_id) localStorage.setItem("pos_active_tab", backup.active_tab_id);
        }
      } catch {
        // Local workspace remains authoritative if backup recovery is unavailable.
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    void recover();
    return () => { cancelled = true; };
  }, [user?.id, currentBranchId]);

  useEffect(() => {
    if (!ready || !user?.id || !currentBranchId) return;

    const sync = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const tabs = readLocalTabs();
      if (!Array.isArray(tabs) || tabs.length === 0) return;
      const activeId = activeTabId();
      const serialized = serializeWorkspace(tabs, activeId);
      if (serialized === lastSavedRef.current) return;
      try {
        await saveMyPosWorkspace(currentBranchId, device?.device_id || null, tabs, activeId);
        lastSavedRef.current = serialized;
      } catch {
        // Best-effort backup: never interrupt an active sale because cloud backup failed.
      }
    };

    void sync();
    const timer = window.setInterval(() => void sync(), 3000);
    return () => window.clearInterval(timer);
  }, [ready, user?.id, currentBranchId, device?.device_id]);

  if (!ready) {
    return (
      <div dir="rtl" className="flex min-h-[45vh] items-center justify-center">
        <div className="flex items-center gap-2 rounded-2xl border bg-white px-5 py-4 text-sm text-muted-foreground shadow-sm">
          <RefreshCw className="h-4 w-4 animate-spin" /> تجهيز سلات الكاشير…
        </div>
      </div>
    );
  }

  return (
    <>
      {recoveredSale && (
        <div dir="rtl" className="mx-3 mt-3 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 md:mx-6">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <div className="font-bold">تم تأكيد عملية بيع سابقة بعد استرجاع الاتصال</div>
            <div className="mt-0.5 text-xs">فاتورة {recoveredSale.invoice_number} · {Number(recoveredSale.total).toFixed(2)} ج.م — تم تنظيف السلة المباعة تلقائيًا لمنع التكرار.</div>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
