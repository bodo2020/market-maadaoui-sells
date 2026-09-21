import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Cloud, CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getOfflineOutboxSummary } from "@/services/offline/posOfflineStore";
import { syncOfflinePOSSales } from "@/services/supabase/posCheckoutV2Service";

type Props = { branchId: string | null };

export default function POSOfflineStatus({ branchId }: Props) {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState({ pending: 0, needsReview: 0, lastSyncedAt: null as string | null });

  const refresh = useCallback(async () => {
    if (!branchId) return;
    try { setSummary(await getOfflineOutboxSummary(branchId)); } catch { /* IndexedDB may be blocked by the browser. */ }
  }, [branchId]);

  const sync = useCallback(async () => {
    if (!branchId || !navigator.onLine || syncing) return;
    setSyncing(true);
    try { await syncOfflinePOSSales(branchId); } catch { /* Keep the outbox pending for the next retry. */ } finally { setSyncing(false); await refresh(); }
  }, [branchId, syncing, refresh]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      setSyncing(true);
      void syncOfflinePOSSales(branchId || undefined).catch(() => undefined).finally(() => { setSyncing(false); void refresh(); });
    };
    const onOffline = () => setOnline(false);
    const onChanged = () => void refresh();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pos:offline-outbox-changed", onChanged);
    window.addEventListener("pos:offline-sync-finished", onChanged);
    void refresh();
    if (navigator.onLine) void syncOfflinePOSSales(branchId || undefined).catch(() => undefined).finally(refresh);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pos:offline-outbox-changed", onChanged);
      window.removeEventListener("pos:offline-sync-finished", onChanged);
    };
  }, [branchId, refresh]);

  if (!online) return <Badge className="gap-1 bg-amber-100 text-amber-900 hover:bg-amber-100"><CloudOff className="h-3.5 w-3.5" />أوفلاين · البيع النقدي متاح</Badge>;

  return (
    <div className="flex items-center gap-1.5">
      <Badge className="gap-1 bg-emerald-50 text-[#005931] hover:bg-emerald-50"><Cloud className="h-3.5 w-3.5" />متصل</Badge>
      {summary.pending > 0 && <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => void sync()} disabled={syncing}><RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />{summary.pending} بانتظار المزامنة</Button>}
      {summary.needsReview > 0 && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3.5 w-3.5" />{summary.needsReview} تحتاج مراجعة</Badge>}
    </div>
  );
}
