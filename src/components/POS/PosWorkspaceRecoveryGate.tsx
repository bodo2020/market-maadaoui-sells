import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { POSTab } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { getLocalPosDevice } from "@/services/supabase/posDeviceService";
import { getMyPosWorkspace, saveMyPosWorkspace } from "@/services/supabase/posWorkspaceBackupService";

type Props = { children: ReactNode };

function readLocalTabs(): POSTab[] {
  try {
    const raw = localStorage.getItem("pos_tabs");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

export default function PosWorkspaceRecoveryGate({ children }: Props) {
  const { user } = useAuth();
  const { currentBranchId } = useBranchStore();
  const [ready, setReady] = useState(false);
  const lastSavedRef = useRef<string>("");

  const device = useMemo(
    () => currentBranchId ? getLocalPosDevice(currentBranchId) : null,
    [currentBranchId],
  );

  useEffect(() => {
    let cancelled = false;
    setReady(false);

    const recover = async () => {
      if (!user?.id || !currentBranchId) {
        if (!cancelled) setReady(true);
        return;
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

  return <>{children}</>;
}
