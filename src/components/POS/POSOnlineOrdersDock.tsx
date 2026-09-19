import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, BellRing, CheckCircle2, Clock3, Loader2, PackageCheck, RefreshCw, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBranchStore } from "@/stores/branchStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  acceptPosOnlineOrder,
  fetchPosOnlineOrderInbox,
  type PosInboxOrder,
  type PosOrderInbox,
} from "@/services/supabase/posOnlineOrdersInboxService";

const statusLabel: Record<string, string> = {
  pending: "طلب جديد",
  confirmed: "تم التأكيد",
  preparing: "جاري التجهيز",
  ready: "جاهز للاستلام",
  shipped: "خرج للتوصيل",
};

const fulfillmentLabel: Record<string, string> = {
  awaiting_confirmation: "بانتظار المراجعة",
  queued: "في طابور التجهيز",
  picking: "جمع الأصناف",
  packing: "التعبئة",
  ready: "جاهز",
  handed_over: "تم التسليم للمندوب",
};

const deliveryLabel: Record<string, string> = {
  assigned: "مُعيّن لمندوب",
  accepted: "المندوب قبل الطلب",
  picked_up: "استلم من الفرع",
  on_the_way: "في الطريق للعميل",
  arrived: "وصل للعميل",
};

function money(value: number) {
  return `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
}

function etaText(value: string | null) {
  if (!value) return "—";
  const diff = Math.ceil((new Date(value).getTime() - Date.now()) / 60000);
  if (diff <= 0) return "المفروض يكون جاهز";
  if (diff === 1) return "خلال دقيقة";
  return `خلال ${diff} د`;
}

function confidenceText(value: string) {
  if (value === "high") return "ثقة عالية";
  if (value === "medium") return "ثقة جيدة";
  return "تقدير مبدئي";
}

function ageText(minutes: number) {
  if (minutes < 60) return `منذ ${Math.max(0, minutes)} د`;
  const hours = Math.floor(minutes / 60);
  return `منذ ${hours} س`;
}

function progressOf(order: PosInboxOrder) {
  if (!order.items_total) return 0;
  return Math.max(0, Math.min(100, Math.round((order.items_picked / order.items_total) * 100)));
}

function playOrderAlert() {
  try { navigator.vibrate?.([180, 80, 180]); } catch { /* best effort */ }
  try {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const context = new Ctx();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 840;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.3);
    oscillator.addEventListener("ended", () => void context.close());
  } catch { /* browser may block audio */ }
}

export default function POSOnlineOrdersDock() {
  const navigate = useNavigate();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PosOrderInbox | null>(null);
  const [loading, setLoading] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const seenSignals = useRef(new Set<number>());

  const refresh = useCallback(async (silent = false) => {
    if (!currentBranchId) {
      setData(null);
      return;
    }
    if (!silent) setLoading(true);
    try {
      setData(await fetchPosOnlineOrderInbox(currentBranchId));
    } catch (error) {
      console.error("POS online order inbox failed", error);
      if (!silent) toast.error("تعذر تحميل طلبات الأونلاين");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentBranchId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!currentBranchId) return;
    const channel = supabase
      .channel(`pos-order-operations-${currentBranchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_operations_realtime_signals_v1",
          filter: `branch_id=eq.${currentBranchId}`,
        },
        (payload) => {
          const signal = payload.new as { id?: number; event_type?: string; order_id?: string };
          if (signal.id && seenSignals.current.has(signal.id)) return;
          if (signal.id) seenSignals.current.add(signal.id);
          if (signal.event_type === "order_created") {
            playOrderAlert();
            toast.success("طلب أونلاين جديد", {
              description: "وصل طلب جديد للفرع. افتح صندوق الطلبات لمراجعته.",
              action: { label: "فتح", onClick: () => setOpen(true) },
            });
          }
          void refresh(true);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentBranchId, refresh]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => void refresh(true), 30000);
    return () => window.clearInterval(timer);
  }, [open, refresh]);

  const handleAccept = async (orderId: string) => {
    if (acceptingId) return;
    setAcceptingId(orderId);
    try {
      await acceptPosOnlineOrder(orderId);
      toast.success("تم استلام وتأكيد الطلب", { description: "تم إرسال الطلب تلقائيًا لمنظومة التجهيز." });
      await refresh(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ORDER_ACCEPT_FAILED";
      if (message.includes("ORDER_STATUS_CHANGED")) toast.info("حالة الطلب اتغيرت بالفعل. تم تحديث البيانات.");
      else toast.error("تعذر تأكيد الطلب", { description: "حدّث البيانات أو افتح تفاصيل الطلب للمراجعة." });
      await refresh(true);
    } finally {
      setAcceptingId(null);
    }
  };

  const summary = data?.summary;
  const badgeCount = Number(summary?.new_orders || 0) + Number(summary?.at_risk || 0);
  const orders = useMemo(() => data?.orders || [], [data?.orders]);

  if (!currentBranchId) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 left-4 z-40 flex min-h-14 items-center gap-3 rounded-2xl border border-emerald-900/10 bg-[#005931] px-4 py-3 text-white shadow-2xl shadow-emerald-950/20 transition hover:scale-[1.02] active:scale-[.98] lg:bottom-5 lg:left-5"
        aria-label="طلبات الأونلاين"
      >
        <BellRing className="h-5 w-5" />
        <span className="hidden text-sm font-extrabold sm:inline">طلبات الأونلاين</span>
        {badgeCount > 0 && (
          <span className="flex min-h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs font-black text-[#005931]">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto p-0 sm:max-w-[520px]">
          <div className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur-xl">
            <SheetHeader className="text-right">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <SheetTitle className="text-xl font-black">طلبات الأونلاين</SheetTitle>
                  <SheetDescription className="mt-1">{currentBranchName || "الفرع الحالي"} · متابعة لحظية بدون إيقاف البيع</SheetDescription>
                </div>
                <Button variant="outline" size="icon" onClick={() => void refresh()} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            </SheetHeader>
          </div>

          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl bg-amber-50 p-3"><div className="text-[11px] font-bold text-amber-700">جديدة</div><div className="mt-1 text-xl font-black text-amber-950">{summary?.new_orders ?? 0}</div></div>
              <div className="rounded-2xl bg-blue-50 p-3"><div className="text-[11px] font-bold text-blue-700">تجهيز</div><div className="mt-1 text-xl font-black text-blue-950">{summary?.in_fulfillment ?? 0}</div></div>
              <div className="rounded-2xl bg-emerald-50 p-3"><div className="text-[11px] font-bold text-emerald-700">جاهزة</div><div className="mt-1 text-xl font-black text-emerald-950">{summary?.ready ?? 0}</div></div>
              <div className="rounded-2xl bg-red-50 p-3"><div className="text-[11px] font-bold text-red-700">تحتاج انتباه</div><div className="mt-1 text-xl font-black text-red-950">{summary?.at_risk ?? 0}</div></div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-extrabold">الطلبات النشطة</p>
              <Button variant="ghost" size="sm" onClick={() => { setOpen(false); navigate("/online-orders/operations"); }}>
                مركز التشغيل
              </Button>
            </div>

            {loading && !data ? (
              <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#005931]" /></div>
            ) : orders.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                <PackageCheck className="mx-auto mb-3 h-8 w-8 opacity-40" />
                مفيش طلبات أونلاين نشطة في الفرع حاليًا
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map(order => {
                  const progress = progressOf(order);
                  const isNew = order.order_status === "pending";
                  return (
                    <article key={order.order_id} className={`rounded-2xl border bg-white p-4 shadow-sm ${order.needs_attention ? "border-amber-300/70" : "border-slate-200"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-black">{order.display_id}</span>
                            <Badge variant={isNew ? "default" : "secondary"}>{statusLabel[order.order_status] || order.order_status}</Badge>
                            {order.eta_risk === "late" && <Badge variant="destructive">متأخر</Badge>}
                            {order.eta_risk === "at_risk" && <Badge className="bg-amber-500">معرض للتأخير</Badge>}
                            {order.eta_model_version === "eta-v2-intelligent" && (
                              <Badge variant="outline">{confidenceText(order.eta_confidence)}</Badge>
                            )}
                          </div>
                          <p className="mt-1 text-sm font-bold">{order.customer_name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{order.items_count} صنف · {money(order.total)} · {ageText(order.age_minutes)}</p>
                        </div>
                        {order.needs_attention && <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />}
                      </div>

                      {order.fulfillment_state && order.order_status !== "pending" && (
                        <div className="mt-4 rounded-xl bg-slate-50 p-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold">{fulfillmentLabel[order.fulfillment_state] || order.fulfillment_state}</span>
                            <span className="text-muted-foreground">{order.items_picked}/{order.items_total || order.items_count}</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#005931] transition-all" style={{ width: `${progress}%` }} /></div>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span><Clock3 className="ml-1 inline h-3 w-3" />{etaText(order.predicted_ready_at)}</span>
                            {order.picker_name && <span>المجهز: {order.picker_name}</span>}
                            {order.shortage_count > 0 && <span className="font-bold text-amber-700">نواقص: {order.shortage_count}</span>}
                          </div>
                        </div>
                      )}

                      {order.eta_model_version === "eta-v2-intelligent" && (
                        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2 text-center text-[10px]">
                          <div><span className="block text-muted-foreground">متبقي</span><strong>{Math.max(0, Number(order.eta_remaining_minutes || 0))} د</strong></div>
                          <div><span className="block text-muted-foreground">التجهيز</span><strong>{Math.max(0, Number(order.eta_ready_remaining_minutes || 0))} د</strong></div>
                          <div><span className="block text-muted-foreground">الطريق</span><strong>{Math.max(0, Number(order.eta_route_minutes || 0))} د</strong></div>
                        </div>
                      )}

                      {order.driver_name && (
                        <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                          <Truck className="h-4 w-4" />
                          <span className="font-bold">{order.driver_name}</span>
                          <span>· {deliveryLabel[order.delivery_state || ""] || order.delivery_state}</span>
                          {order.arrived_branch_at && <span className="mr-auto font-bold">وصل الفرع</span>}
                        </div>
                      )}

                      <div className="mt-4 flex gap-2">
                        {isNew && (
                          <Button className="flex-1 bg-[#005931] hover:bg-[#004525]" disabled={acceptingId === order.order_id} onClick={() => void handleAccept(order.order_id)}>
                            {acceptingId === order.order_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            استلام وتأكيد
                          </Button>
                        )}
                        <Button variant={isNew ? "outline" : "default"} className={isNew ? "" : "flex-1 bg-[#005931] hover:bg-[#004525]"} onClick={() => { setOpen(false); navigate(`/online-orders/${order.order_id}`); }}>
                          مراجعة التفاصيل
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
