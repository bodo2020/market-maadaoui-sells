import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Clock3, PackageCheck, RefreshCw, Route, TimerReset, Truck, UserCheck } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useBranchStore } from "@/stores/branchStore";
import { assignRecommendedDelivery, fetchFulfillmentWorkspace } from "@/services/supabase/orderFulfillmentV1Service";
import { toast } from "sonner";

const stateLabel: Record<string, string> = {
  awaiting_confirmation: "بانتظار التأكيد",
  queued: "في طابور التجهيز",
  picking: "جاري جمع الأصناف",
  packing: "جاري التعبئة",
  ready: "جاهز للاستلام",
  handed_over: "تم التسليم للمندوب",
  completed: "مكتمل",
  cancelled: "ملغي",
  issue: "مشكلة تشغيلية",
};

const riskLabel: Record<string, string> = { on_track: "في الموعد", at_risk: "معرض للتأخير", late: "متأخر" };

function timeLabel(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function OrderOperationsCenterV2() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const query = useQuery({
    queryKey: ["order-fulfillment-v1", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchFulfillmentWorkspace(currentBranchId!),
    refetchInterval: 20_000,
  });

  const orders = query.data?.orders || [];
  const summary = query.data?.summary;
  const readyForDispatch = useMemo(() => orders.filter((order: any) => order.fulfillment_state === "ready" && !order.delivery_assigned), [orders]);

  const assignRecommended = async (order: any) => {
    const recommendation = order.dispatch_recommendation;
    if (!recommendation?.recommended_driver?.id) return toast.error("مفيش مندوب مناسب حاليًا");
    try {
      await assignRecommendedDelivery(order.order_id, Boolean(recommendation.dispatch_now));
      toast.success(`تم تعيين ${recommendation.recommended_driver.name} للطلب ${order.display_id}`);
      await queryClient.invalidateQueries({ queryKey: ["order-fulfillment-v1", currentBranchId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تعيين المندوب");
    }
  };

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-7xl space-y-5 py-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black text-[#005931]">ORDER OPERATIONS V2</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950 md:text-3xl">مركز تشغيل وتجهيز وتوزيع الطلبات</h1>
            <p className="mt-1 text-sm text-slate-500">{currentBranchName || "الفرع الحالي"} · التجهيز والتوصيل شغالين بالتوازي حسب الوقت المتوقع.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/online-orders")}>الطلبات</Button>
            <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {[
            ["تنتظر التأكيد", summary?.awaiting_confirmation || 0, Clock3],
            ["طابور التجهيز", summary?.queued || 0, TimerReset],
            ["جاري التجهيز", summary?.picking || 0, PackageCheck],
            ["التعبئة", summary?.packing || 0, PackageCheck],
            ["جاهز", summary?.ready || 0, Truck],
            ["معرض للتأخير", summary?.at_risk || 0, Route],
          ].map(([label, value, Icon]: any) => <Card key={label} className="border-slate-200 shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div><Icon className="h-5 w-5 text-[#005931]" /></div></CardContent></Card>)}
        </section>

        {readyForDispatch.length > 0 && <Card className="border-emerald-200 bg-emerald-50/40"><CardHeader><CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-[#005931]" />جاهز للتوزيع الآن · {readyForDispatch.length}</CardTitle></CardHeader></Card>}

        {query.isLoading ? <div className="rounded-3xl border bg-white p-12 text-center text-slate-500">جاري تحميل مركز التشغيل…</div> : query.error ? <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700">تعذر تحميل مركز التشغيل. راجع الصلاحيات والاتصال.</div> : orders.length === 0 ? <div className="rounded-3xl border border-dashed bg-white p-12 text-center text-slate-500">لا توجد طلبات مفتوحة في الفرع الحالي.</div> : <div className="grid gap-4 lg:grid-cols-2">
          {orders.map((order: any) => {
            const progress = order.items_total ? Math.min(100, Math.round((order.items_picked / order.items_total) * 100)) : 0;
            const rec = order.dispatch_recommendation;
            return <Card key={order.order_id} className="overflow-hidden border-slate-200 shadow-sm">
              <CardHeader className="border-b bg-slate-50/70 pb-3">
                <div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">{order.display_id}</CardTitle><p className="mt-1 text-xs text-slate-500">{order.customer_name} · {Number(order.amount || 0).toFixed(2)} ج.م</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#005931] shadow-sm">{stateLabel[order.fulfillment_state] || order.fulfillment_state}</span></div>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">جاهز متوقع</p><p className="mt-1 font-black">{timeLabel(order.predicted_ready_at)}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">المجهز</p><p className="mt-1 truncate font-black">{order.picker_name || "غير معين"}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">SLA</p><p className={`mt-1 font-black ${order.eta_risk === "late" ? "text-red-600" : order.eta_risk === "at_risk" ? "text-amber-700" : "text-emerald-700"}`}>{riskLabel[order.eta_risk] || "—"}</p></div></div>
                <div><div className="mb-2 flex justify-between text-xs"><span>تقدم التجهيز</span><strong>{order.items_picked}/{order.items_total}</strong></div><Progress value={progress} className="h-2" /></div>
                {rec && <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3"><div className="flex items-center gap-2 font-black text-[#005931]"><UserCheck className="h-4 w-4" />{rec.recommended_driver ? `المقترح: ${rec.recommended_driver.name}` : "لا يوجد مندوب مناسب"}</div>{rec.recommended_driver && <p className="mt-1 text-xs text-slate-600">وصول للفرع ≈ {rec.recommended_driver.travel_minutes} د · {rec.dispatch_now ? "يتحرك الآن" : `الإرسال بعد ${rec.dispatch_in_minutes} د`}</p>}</div>}
                <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => navigate(`/online-orders/${order.order_id}`)}>فتح الطلب</Button>{rec?.recommended_driver && <Button className="flex-1 bg-[#005931] hover:bg-[#004526]" disabled={!rec.dispatch_now} onClick={() => void assignRecommended(order)}><Truck className="h-4 w-4" />{rec.dispatch_now ? "تعيين المقترح" : `انتظر ${rec.dispatch_in_minutes} د`}</Button>}</div>
              </CardContent>
            </Card>;
          })}
        </div>}
      </div>
    </MainLayout>
  );
}
