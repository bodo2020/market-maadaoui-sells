import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Boxes, Clock3, PackageCheck, RefreshCw, Route, Sparkles, Truck, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { AssignDeliveryPersonDialog } from "@/components/orders/AssignDeliveryPersonDialog";
import {
  assignRecommendedDelivery,
  claimOrderFulfillment,
  fetchOrderOperationsSnapshot,
  markOrderReady,
  startOrderPicking,
  updateOrderFulfillmentProgress,
} from "@/services/supabase/orderFulfillmentV1Service";
import { toast } from "sonner";

const labels: Record<string, string> = {
  awaiting_confirmation: "بانتظار تأكيد الطلب",
  queued: "جاهز لبدء التجهيز",
  picking: "جاري تجهيز الطلب",
  packing: "جاري تجهيز الطلب",
  ready: "جاهز للاستلام",
  handed_over: "تم تسليم الطلب للمندوب",
  completed: "مكتمل",
  cancelled: "ملغي",
};

const driverStateLabel: Record<string, string> = {
  assigned: "تم تكليف المندوب",
  accepted: "المندوب قبل الطلب",
  arrived_branch: "المندوب وصل الفرع",
  picked_up: "استلم الطلب",
  on_the_way: "في الطريق للعميل",
  arrived: "وصل للعميل",
  delivered: "تم التسليم",
  failed: "تحتاج إعادة توزيع",
};

function timeLabel(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function OrderFulfillmentPanel({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["order-operations-snapshot", orderId],
    queryFn: () => fetchOrderOperationsSnapshot(orderId),
    refetchInterval: 10_000,
  });

  const f = query.data?.fulfillment;
  const rec = query.data?.dispatch_recommendation;
  const dispatchState = query.data?.dispatch_state;
  const shadow = query.data?.picker_shadow;
  const delivery = query.data?.delivery_assignment;

  const [itemsPicked, setItemsPicked] = useState(0);
  const [shortages, setShortages] = useState(0);
  const [substitutions, setSubstitutions] = useState(0);
  const [working, setWorking] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  useEffect(() => {
    if (!f) return;
    setItemsPicked(Number(f.items_picked || 0));
    setShortages(Number(f.shortage_count || 0));
    setSubstitutions(Number(f.substitution_count || 0));
  }, [f?.items_picked, f?.shortage_count, f?.substitution_count]);

  const resolved = Math.max(0, Number(itemsPicked || 0) + Number(shortages || 0) + Number(substitutions || 0));
  const progress = useMemo(
    () => f?.items_total
      ? Math.min(100, Math.round((resolved / Number(f.items_total)) * 100))
      : 0,
    [f?.items_total, resolved],
  );
  const remaining = Math.max(0, Number(f?.items_total || 0) - resolved);
  const canFinish = Number(f?.items_total || 0) === 0 || remaining === 0;
  const isMine = Boolean(f?.picker_user_id && f.picker_user_id === user?.id);

  const refresh = async () => {
    await query.refetch();
    await queryClient.invalidateQueries({ queryKey: ["order-fulfillment-v1"] });
  };

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      setWorking(true);
      await action();
      toast.success(success);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تنفيذ الإجراء";
      if (message.includes("FULFILLMENT_ITEMS_INCOMPLETE")) toast.error("أكمل كل الأصناف أو سجّل النواقص/البدائل قبل إنهاء التجهيز.");
      else if (message.includes("NO_DELIVERY_CANDIDATE")) toast.error("لم يتم العثور على مندوب مناسب الآن. يمكنك اختيار مندوب يدويًا.");
      else if (message.includes("ORDER_ALREADY_ASSIGNED")) {
        toast.info("تم تعيين مندوب للطلب بالفعل.");
        await refresh();
      } else toast.error(message);
    } finally {
      setWorking(false);
    }
  };

  if (query.isLoading) {
    return <Card><CardContent className="p-5 text-sm text-muted-foreground">جاري تحميل تشغيل الطلب…</CardContent></Card>;
  }
  if (!f) return null;

  return (
    <>
      <Card className="overflow-hidden border-emerald-100 shadow-sm">
        <CardHeader className="border-b bg-gradient-to-l from-emerald-50 to-white pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5 text-[#005931]" />تشغيل الطلب والتوصيل</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">التجهيز والبحث عن المندوب شغالين بالتوازي.</p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => void query.refetch()}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl bg-emerald-50 p-3">
              <p className="text-[11px] font-bold text-emerald-700">التجهيز</p>
              <p className="mt-1 font-black text-[#005931]">{labels[f.fulfillment_state] || f.fulfillment_state}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-[11px] text-muted-foreground">المجهز</p>
              <p className="mt-1 font-bold">{f.picker_name || "غير معين"}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-[11px] text-muted-foreground">جاهز متوقع</p>
              <p className="mt-1 flex items-center gap-1 font-bold"><Clock3 className="h-4 w-4" />{timeLabel(f.predicted_ready_at)}</p>
            </div>
          </div>

          {shadow && !f.picker_user_id && (
            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-3">
              <div className="flex items-center gap-2 text-sm font-black text-violet-900"><Sparkles className="h-4 w-4" />اقتراح موظف التجهيز</div>
              <p className="mt-1 text-xs leading-5 text-violet-700">
                {shadow.recommended_name ? `${shadow.recommended_name} · Score ${Number(shadow.score || 0).toFixed(1)}` : "لا يوجد موظف تجهيز متاح داخل الوردية حاليًا."}
              </p>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span>تقدم تجهيز الأصناف</span>
              <strong>{resolved}/{f.items_total}</strong>
            </div>
            <Progress value={progress} className="h-2.5" />
          </div>

          {!f.picker_user_id && f.fulfillment_state === "queued" && (
            <Button
              className="w-full min-h-12 bg-[#005931] hover:bg-[#004526]"
              disabled={working}
              onClick={() => void run(() => claimOrderFulfillment(orderId), "تم استلام التجهيز وبدأ البحث عن مندوب بالتوازي")}
            >
              استلام وبدء تجهيز الطلب
            </Button>
          )}

          {isMine && f.fulfillment_state === "queued" && (
            <Button className="w-full min-h-12" disabled={working} onClick={() => void run(() => startOrderPicking(orderId), "بدأ تجهيز الطلب")}>
              بدء جمع الأصناف
            </Button>
          )}

          {isMine && ["picking", "packing"].includes(f.fulfillment_state) && (
            <div className="space-y-3 rounded-2xl border p-3">
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs">تم جمع<Input type="number" min={0} max={f.items_total} value={itemsPicked} onChange={e => setItemsPicked(Number(e.target.value))} /></label>
                <label className="text-xs">نواقص<Input type="number" min={0} value={shortages} onChange={e => setShortages(Number(e.target.value))} /></label>
                <label className="text-xs">بدائل<Input type="number" min={0} value={substitutions} onChange={e => setSubstitutions(Number(e.target.value))} /></label>
              </div>
              <Button
                variant="outline"
                className="w-full"
                disabled={working}
                onClick={() => void run(
                  () => updateOrderFulfillmentProgress(orderId, itemsPicked, shortages, substitutions, undefined),
                  "تم حفظ تقدم التجهيز",
                )}
              >
                حفظ التقدم
              </Button>
              <Button
                className="w-full min-h-12 bg-[#005931] hover:bg-[#004526]"
                disabled={working || !canFinish}
                onClick={() => void run(() => markOrderReady(orderId, 0, "تم إنهاء التجهيز بدون مرحلة تسكين"), "الطلب جاهز للاستلام")}
              >
                <PackageCheck className="h-4 w-4" />
                {canFinish ? "إنهاء التجهيز — الطلب جاهز" : `متبقي ${remaining} صنف قبل الإنهاء`}
              </Button>
              <p className="text-[11px] text-muted-foreground">عدد الأكياس والتسكين لم يعدا مرحلة إلزامية. يمكن تسجيل أي ملاحظة تشغيلية منفصلة عند الحاجة.</p>
            </div>
          )}

          <div className="border-t pt-4">
            <p className="mb-2 text-xs font-black text-slate-500">المندوب</p>

            {delivery ? (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-black text-blue-950"><Truck className="h-4 w-4" />{delivery.driver_name}</div>
                    <p className="mt-1 text-xs text-blue-700">{driverStateLabel[delivery.state] || delivery.state}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-blue-800">
                      <span>تعيين: {timeLabel(delivery.assigned_at)}</span>
                      {delivery.accepted_at && <span>قبول: {timeLabel(delivery.accepted_at)}</span>}
                      {delivery.arrived_branch_at && <span className="font-bold">وصل الفرع: {timeLabel(delivery.arrived_branch_at)}</span>}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>تغيير المندوب</Button>
                </div>
              </div>
            ) : rec?.recommended_driver ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 font-black text-amber-950"><Route className="h-4 w-4" />المندوب المقترح: {rec.recommended_driver.name}</div>
                <p className="mt-1 text-xs text-amber-800">
                  وصوله للفرع ≈ {rec.recommended_driver.travel_minutes} دقيقة
                  {rec.recommended_driver.distance_km != null ? ` · ${Number(rec.recommended_driver.distance_km).toFixed(1)} كم` : ""}
                </p>
                <p className="mt-2 text-xs text-amber-900">لم يثبت التعيين تلقائيًا حتى الآن. أعد المحاولة أو اختر مندوبًا يدويًا.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button disabled={working} onClick={() => void run(() => assignRecommendedDelivery(orderId, true), "تم تعيين المندوب المقترح")}>
                    <RefreshCw className="h-4 w-4" />إعادة التوزيع الآن
                  </Button>
                  <Button variant="outline" onClick={() => setAssignOpen(true)}><UserCheck className="h-4 w-4" />اختيار مندوب</Button>
                </div>
              </div>
            ) : dispatchState?.state === "manual_intervention" || rec ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
                <div className="flex items-center gap-2 font-black text-red-950"><AlertTriangle className="h-4 w-4" />لم يتم العثور على مندوب تلقائيًا</div>
                <p className="mt-1 text-xs leading-5 text-red-800">النظام سيعيد المحاولة عند ظهور مندوب متاح أو تحديث موقعه. يمكنك التدخل الآن من الـPOS.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button variant="outline" disabled={working} onClick={() => void run(() => assignRecommendedDelivery(orderId, true), "تم العثور على مندوب وتعيينه")}>
                    <RefreshCw className="h-4 w-4" />إعادة البحث
                  </Button>
                  <Button className="bg-[#005931] hover:bg-[#004526]" onClick={() => setAssignOpen(true)}>
                    <UserCheck className="h-4 w-4" />تعيين يدويًا
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">سيبدأ البحث عن مندوب بمجرد استلام الطلب وبدء التجهيز.</div>
            )}
          </div>
        </CardContent>
      </Card>

      <AssignDeliveryPersonDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        orderId={orderId}
        onConfirm={() => void refresh()}
      />
    </>
  );
}
