import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, PackageCheck, RefreshCw, Route, Truck, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import {
  assignRecommendedDelivery,
  claimOrderFulfillment,
  fetchOrderOperationsSnapshot,
  markOrderReady,
  startOrderPacking,
  startOrderPicking,
  updateOrderFulfillmentProgress,
} from "@/services/supabase/orderFulfillmentV1Service";
import { toast } from "sonner";

const labels: Record<string, string> = {
  awaiting_confirmation: "بانتظار تأكيد الطلب",
  queued: "جاهز لبدء التجهيز",
  picking: "جاري جمع الأصناف",
  packing: "جاري التعبئة",
  ready: "جاهز للمندوب",
  handed_over: "تم تسليم الطلب للمندوب",
  completed: "مكتمل",
  cancelled: "ملغي",
};

export default function OrderFulfillmentPanel({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["order-operations-snapshot", orderId], queryFn: () => fetchOrderOperationsSnapshot(orderId), refetchInterval: 15_000 });
  const f = query.data?.fulfillment;
  const rec = query.data?.dispatch_recommendation;
  const [itemsPicked, setItemsPicked] = useState(0);
  const [shortages, setShortages] = useState(0);
  const [substitutions, setSubstitutions] = useState(0);
  const [bags, setBags] = useState(1);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!f) return;
    setItemsPicked(Number(f.items_picked || 0));
    setShortages(Number(f.shortage_count || 0));
    setSubstitutions(Number(f.substitution_count || 0));
    setBags(Math.max(1, Number(f.bags_count || 1)));
  }, [f?.items_picked, f?.shortage_count, f?.substitution_count, f?.bags_count]);

  const progress = useMemo(() => f?.items_total ? Math.min(100, Math.round((Number(f.items_picked || 0) / Number(f.items_total)) * 100)) : 0, [f?.items_picked, f?.items_total]);
  const isMine = Boolean(f?.picker_user_id && f.picker_user_id === user?.id);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      setWorking(true);
      await action();
      toast.success(success);
      await query.refetch();
      await queryClient.invalidateQueries({ queryKey: ["order-fulfillment-v1"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تنفيذ الإجراء");
    } finally {
      setWorking(false);
    }
  };

  if (query.isLoading) return <Card><CardContent className="p-5 text-sm text-muted-foreground">جاري تحميل تشغيل الطلب…</CardContent></Card>;
  if (!f) return null;

  return (
    <Card className="border-emerald-100">
      <CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5 text-[#005931]" />التجهيز والتوزيع</CardTitle><Button size="icon" variant="ghost" onClick={() => void query.refetch()}><RefreshCw className="h-4 w-4" /></Button></div></CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl bg-emerald-50 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs text-emerald-700">الحالة التشغيلية</p><p className="mt-1 font-black text-[#005931]">{labels[f.fulfillment_state] || f.fulfillment_state}</p></div><PackageCheck className="h-6 w-6 text-[#005931]" /></div></div>
        <div className="grid grid-cols-2 gap-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-muted-foreground">المجهز</p><p className="mt-1 font-bold">{f.picker_name || "غير معين"}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-muted-foreground">جاهز متوقع</p><p className="mt-1 font-bold">{f.predicted_ready_at ? new Intl.DateTimeFormat("ar-EG",{hour:"2-digit",minute:"2-digit"}).format(new Date(f.predicted_ready_at)) : "—"}</p></div></div>
        <div><div className="mb-2 flex justify-between text-xs"><span>تقدم جمع الأصناف</span><strong>{f.items_picked}/{f.items_total}</strong></div><Progress value={progress} className="h-2" /></div>

        {!f.picker_user_id && f.fulfillment_state === "queued" && <Button className="w-full bg-[#005931] hover:bg-[#004526]" disabled={working} onClick={() => void run(() => claimOrderFulfillment(orderId), "تم استلام مهمة التجهيز")}>استلام التجهيز</Button>}
        {isMine && f.fulfillment_state === "queued" && <Button className="w-full" disabled={working} onClick={() => void run(() => startOrderPicking(orderId), "بدأ تجهيز الطلب")}>بدء جمع الأصناف</Button>}

        {isMine && ["picking","packing"].includes(f.fulfillment_state) && <div className="space-y-3 rounded-2xl border p-3"><div className="grid grid-cols-2 gap-2"><label className="text-xs">تم جمع<Input type="number" min={0} max={f.items_total} value={itemsPicked} onChange={e=>setItemsPicked(Number(e.target.value))} /></label><label className="text-xs">نواقص<Input type="number" min={0} value={shortages} onChange={e=>setShortages(Number(e.target.value))} /></label><label className="text-xs">بدائل<Input type="number" min={0} value={substitutions} onChange={e=>setSubstitutions(Number(e.target.value))} /></label><label className="text-xs">عدد الأكياس<Input type="number" min={1} value={bags} onChange={e=>setBags(Number(e.target.value))} /></label></div><Button variant="outline" className="w-full" disabled={working} onClick={() => void run(() => updateOrderFulfillmentProgress(orderId,itemsPicked,shortages,substitutions,bags),"تم حفظ تقدم التجهيز")}>حفظ التقدم</Button>{f.fulfillment_state === "picking" && <Button className="w-full" disabled={working} onClick={() => void run(() => startOrderPacking(orderId,bags),"بدأت تعبئة الطلب")}>بدء التعبئة</Button>}{f.fulfillment_state === "packing" && <Button className="w-full bg-[#005931] hover:bg-[#004526]" disabled={working} onClick={() => void run(() => markOrderReady(orderId,bags),"الطلب جاهز للاستلام")}>الطلب جاهز</Button>}</div>}

        {query.data?.delivery_assignment ? <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3"><div className="flex items-center gap-2 font-black text-blue-900"><Truck className="h-4 w-4" />{query.data.delivery_assignment.driver_name}</div><p className="mt-1 text-xs text-blue-700">حالة المندوب: {query.data.delivery_assignment.state}</p></div> : rec ? <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3"><div className="flex items-center gap-2 font-black text-[#005931]"><UserCheck className="h-4 w-4" />{rec.recommended_driver ? `أفضل مندوب: ${rec.recommended_driver.name}` : "لا يوجد مندوب مناسب الآن"}</div>{rec.recommended_driver && <><p className="mt-1 text-xs text-slate-600">وصوله للفرع ≈ {rec.recommended_driver.travel_minutes} دقيقة · {rec.dispatch_now ? "وقت الإرسال الآن" : `الإرسال بعد ${rec.dispatch_in_minutes} دقيقة`}</p><Button className="mt-3 w-full" disabled={working || !rec.dispatch_now} onClick={() => void run(() => assignRecommendedDelivery(orderId,false),"تم تعيين المندوب المقترح")}><Route className="h-4 w-4" />{rec.dispatch_now ? "تعيين المندوب المقترح" : "بانتظار نافذة الإرسال"}</Button></>}</div> : null}
      </CardContent>
    </Card>
  );
}
