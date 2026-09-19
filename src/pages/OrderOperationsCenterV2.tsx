import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock3, Layers3, PackageCheck, RefreshCw, Route, Settings2, Store, TimerReset, Truck, UserCheck } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useBranchStore } from "@/stores/branchStore";
import {
  assignRecommendedDelivery,
  fetchBatchPickingShadow,
  fetchFulfillmentWorkspace,
  fetchPickerAssignmentPolicy,
  setPickerAssignmentPolicy,
} from "@/services/supabase/orderFulfillmentV1Service";
import {
  fetchOrderGroupControlTower,
  type OrderGroupControlTowerItem,
} from "@/services/supabase/orderOperationsService";
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

const groupStatusLabel: Record<string, string> = {
  pending: "بانتظار المتاجر",
  confirmed: "تم قبول المتاجر",
  preparing: "المتاجر بتحضّر",
  ready: "كل نقاط الاستلام جاهزة",
  shipped: "خرج للتوصيل",
  on_the_way: "في الطريق للعميل",
  delivered: "تم التسليم",
  cancelled: "ملغي",
  failed: "مشكلة في الرحلة",
  return_to_branch: "راجع للفرع",
};

const orderStatusLabel: Record<string, string> = {
  pending: "ينتظر القبول",
  confirmed: "مقبول",
  preparing: "جاري التجهيز",
  ready: "جاهز",
  shipped: "تم الاستلام",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

const riskLabel: Record<string, string> = { on_track: "في الموعد", at_risk: "معرض للتأخير", late: "متأخر" };
const batchReasonLabel: Record<string, string> = {
  shared_shelf_route: "مسار رفوف مشترك",
  shared_categories: "أقسام متقاربة",
  close_sla_window: "مواعيد تجهيز متقاربة",
};

function timeLabel(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function groupRiskClass(risk?: string | null) {
  if (risk === "late") return "border-red-200 bg-red-50 text-red-700";
  if (risk === "at_risk") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function groupStatusClass(status?: string | null) {
  if (status === "ready") return "bg-emerald-600 text-white";
  if (status === "preparing") return "bg-blue-100 text-blue-800";
  if (status === "pending") return "bg-amber-100 text-amber-800";
  if (status === "shipped" || status === "on_the_way") return "bg-violet-100 text-violet-800";
  return "bg-slate-100 text-slate-700";
}

function MultiStoreGroupCard({ group, onOpenOrder }: { group: OrderGroupControlTowerItem; onOpenOrder: (id: string) => void }) {
  const operations = group.operations || {};
  const activeStores = Number(operations.stores_active ?? group.stores.length);
  const readyStores = Number(operations.ready || 0) + Number(operations.shipped || 0) + Number(operations.delivered || 0);
  const readiness = activeStores > 0 ? Math.min(100, Math.round((readyStores / activeStores) * 100)) : 0;
  const risk = operations.sla_risk || "on_track";

  return (
    <Card className={`overflow-hidden border-2 shadow-sm ${risk === "late" ? "border-red-200" : risk === "at_risk" ? "border-amber-200" : operations.ready_for_dispatch ? "border-emerald-200" : "border-slate-200"}`}>
      <CardHeader className="border-b bg-slate-50/70 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{group.display_id}</CardTitle>
              <span className={`rounded-full px-3 py-1 text-[11px] font-black ${groupStatusClass(group.status)}`}>
                {groupStatusLabel[group.status] || group.status}
              </span>
              {operations.partially_cancelled && (
                <span className="rounded-full bg-red-100 px-3 py-1 text-[11px] font-black text-red-700">إلغاء جزئي</span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {group.customer_name || "عميل"} · {group.stores_count} متاجر · {Number(group.total || 0).toFixed(2)} ج.م
            </p>
          </div>
          <div className={`rounded-xl border px-3 py-2 text-xs font-black ${groupRiskClass(risk)}`}>
            {riskLabel[risk] || risk}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-600">جاهزية نقاط الاستلام</span>
            <strong>{readyStores}/{activeStores || 0}</strong>
          </div>
          <Progress value={readiness} className="h-2.5" />
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-3 text-center">
            <p className="text-[11px] text-slate-500">جاهز</p>
            <p className="mt-1 text-xl font-black text-emerald-700">{operations.ready || 0}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3 text-center">
            <p className="text-[11px] text-slate-500">بيتحضّر</p>
            <p className="mt-1 text-xl font-black text-blue-700">{operations.preparing || 0}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3 text-center">
            <p className="text-[11px] text-slate-500">ينتظر القبول</p>
            <p className="mt-1 text-xl font-black text-amber-700">{operations.pending || 0}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3 text-center">
            <p className="text-[11px] text-slate-500">ملغي</p>
            <p className="mt-1 text-xl font-black text-red-700">{operations.cancelled || 0}</p>
          </div>
        </div>

        <div className="space-y-2">
          {group.stores.map((store) => (
            <button
              key={store.order_id}
              type="button"
              onClick={() => onOpenOrder(store.order_id)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border bg-white p-3 text-right transition hover:border-[#005931]/30 hover:bg-emerald-50/30"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Store className="h-4 w-4 shrink-0 text-[#005931]" />
                  <strong className="truncate text-sm">{store.branch_name || store.merchant_name}</strong>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
                    {store.source_kind === "owned" ? "المعداوي" : "شريك"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {orderStatusLabel[store.status] || store.status}
                  {store.pickup_sequence ? ` · نقطة استلام #${store.pickup_sequence}` : ""}
                  {store.predicted_ready_at ? ` · متوقع ${timeLabel(store.predicted_ready_at)}` : ""}
                </p>
              </div>
              <span className={`shrink-0 text-xs font-black ${store.eta_risk === "late" ? "text-red-600" : store.eta_risk === "at_risk" ? "text-amber-700" : "text-emerald-700"}`}>
                {riskLabel[store.eta_risk] || "—"}
              </span>
            </button>
          ))}
        </div>

        {(operations.late_stores || operations.at_risk_stores) ? (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {operations.late_stores ? `${operations.late_stores} متجر متأخر` : ""}
              {operations.late_stores && operations.at_risk_stores ? " · " : ""}
              {operations.at_risk_stores ? `${operations.at_risk_stores} معرض للتأخير` : ""}
              {" · "}تم ربط الحالة تلقائيًا بمركز المهام عند وجود خطر SLA.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-500">
            {group.route ? (
              <>
                المسار: <strong className="text-slate-700">{group.route.status}</strong>
                {group.route.assigned_driver_name ? <> · المندوب: <strong className="text-slate-700">{group.route.assigned_driver_name}</strong></> : " · بدون مندوب"}
                {group.route.estimated_minutes ? ` · ${group.route.estimated_minutes} د` : ""}
              </>
            ) : "مسار التوصيل لم يُنشأ بعد"}
          </div>
          {group.lead_order_id && (
            <Button variant="outline" onClick={() => onOpenOrder(group.lead_order_id!)}>
              فتح الطلب الرئيسي
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function OrderOperationsCenterV2() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [policyMode, setPolicyMode] = useState<"shadow" | "assisted">("shadow");
  const [offerTtl, setOfferTtl] = useState(90);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const query = useQuery({
    queryKey: ["order-fulfillment-v1", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchFulfillmentWorkspace(currentBranchId!),
    refetchInterval: 20_000,
  });

  const groupQuery = useQuery({
    queryKey: ["order-group-control-tower-v1", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchOrderGroupControlTower(currentBranchId!, 100),
    refetchInterval: 15_000,
  });

  const batchShadowQuery = useQuery({
    queryKey: ["batch-picking-shadow-v1", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchBatchPickingShadow(currentBranchId!),
    refetchInterval: 30_000,
  });

  const policyQuery = useQuery({
    queryKey: ["picker-assignment-policy-v1", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchPickerAssignmentPolicy(currentBranchId!),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!policyQuery.data) return;
    setPolicyMode(policyQuery.data.mode);
    setOfferTtl(Number(policyQuery.data.offer_ttl_seconds || 90));
  }, [policyQuery.data?.mode, policyQuery.data?.offer_ttl_seconds]);

  const orders = query.data?.orders || [];
  const summary = query.data?.summary;
  const readyForDispatch = useMemo(() => orders.filter((order: any) => order.fulfillment_state === "ready" && !order.delivery_assigned), [orders]);
  const groupSummary = groupQuery.data?.summary || {};
  const activeGroups = groupQuery.data?.groups || [];

  const assignRecommended = async (order: any) => {
    const recommendation = order.dispatch_recommendation;
    if (!recommendation?.recommended_driver?.id) return toast.error("مفيش مندوب مناسب حاليًا");
    try {
      await assignRecommendedDelivery(order.order_id, Boolean(recommendation.dispatch_now));
      toast.success(`تم تعيين ${recommendation.recommended_driver.name} للطلب ${order.display_id}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["order-fulfillment-v1", currentBranchId] }),
        queryClient.invalidateQueries({ queryKey: ["order-group-control-tower-v1", currentBranchId] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تعيين المندوب");
    }
  };

  const refreshOperations = async () => {
    await Promise.all([
      query.refetch(),
      groupQuery.refetch(),
      batchShadowQuery.refetch(),
    ]);
  };

  const saveAssignmentPolicy = async () => {
    if (!currentBranchId || !policyQuery.data?.can_manage) return;
    try {
      setSavingPolicy(true);
      await setPickerAssignmentPolicy(currentBranchId, policyMode, offerTtl);
      toast.success(policyMode === "assisted" ? `تم تشغيل التوزيع المساعد بمهلة ${offerTtl} ثانية` : "تم الرجوع لوضع Shadow بدون توزيع فعلي");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["picker-assignment-policy-v1", currentBranchId] }),
        queryClient.invalidateQueries({ queryKey: ["order-fulfillment-v1", currentBranchId] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ سياسة توزيع المهام");
    } finally {
      setSavingPolicy(false);
    }
  };

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-7xl space-y-5 py-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black text-[#005931]">ORDER OPERATIONS V2</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950 md:text-3xl">مركز تشغيل وتجهيز وتوزيع الطلبات</h1>
            <p className="mt-1 text-sm text-slate-500">{currentBranchName || "الفرع الحالي"} · الطلبات الفردية والمجمعة في Control Tower واحدة.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/online-orders")}>الطلبات</Button>
            <Button variant="outline" onClick={() => void refreshOperations()} disabled={query.isFetching || groupQuery.isFetching}>
              <RefreshCw className={`h-4 w-4 ${query.isFetching || groupQuery.isFetching ? "animate-spin" : ""}`} />
              تحديث
            </Button>
          </div>
        </header>

        {!policyQuery.isLoading && policyQuery.data && <Card className={`overflow-hidden border-2 ${policyQuery.data.mode === "assisted" ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#005931] text-white"><Settings2 className="h-5 w-5" /></div>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-black text-slate-950">توزيع مهام التجهيز الذكي</h2><span className={`rounded-full px-3 py-1 text-xs font-black ${policyQuery.data.mode === "assisted" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>{policyQuery.data.mode === "assisted" ? "ASSISTED شغال" : "SHADOW مراقبة فقط"}</span></div>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Shadow يحسب أفضل موظف ويسجل القرار بدون إرسال المهمة. Assisted يعرض الطلب تلقائيًا للموظف الأنسب لمدة محددة، ولو ما قبلهوش ينتقل لموظف آخر.</p>
                </div>
              </div>

              {policyQuery.data.can_manage ? <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex rounded-xl border bg-white p-1">
                  <button type="button" onClick={() => setPolicyMode("shadow")} className={`rounded-lg px-3 py-2 text-xs font-black transition ${policyMode === "shadow" ? "bg-slate-900 text-white" : "text-slate-600"}`}>Shadow</button>
                  <button type="button" onClick={() => setPolicyMode("assisted")} className={`rounded-lg px-3 py-2 text-xs font-black transition ${policyMode === "assisted" ? "bg-[#005931] text-white" : "text-slate-600"}`}>Assisted</button>
                </div>
                <select aria-label="مدة عرض المهمة" value={offerTtl} onChange={(event) => setOfferTtl(Number(event.target.value))} className="h-10 rounded-xl border bg-white px-3 text-sm font-bold outline-none">
                  <option value={60}>60 ثانية</option>
                  <option value={90}>90 ثانية</option>
                  <option value={120}>120 ثانية</option>
                  <option value={180}>180 ثانية</option>
                </select>
                <Button onClick={() => void saveAssignmentPolicy()} disabled={savingPolicy || (policyMode === policyQuery.data.mode && offerTtl === policyQuery.data.offer_ttl_seconds)} className="bg-[#005931] hover:bg-[#004526]">{savingPolicy ? "جاري الحفظ…" : "حفظ السياسة"}</Button>
              </div> : <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">تغيير السياسة متاح لمدير الطلبات فقط</div>}
            </div>
          </CardContent>
        </Card>}

        <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#005931] text-white"><Route className="h-5 w-5" /></div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>Multi-store Control Tower</CardTitle>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black text-emerald-800">GROUP AWARE</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">كل Sub-order يحتفظ بتشغيله المستقل، والمجموعة لا تصبح جاهزة للمندوب إلا بعد جاهزية كل نقاط الاستلام النشطة.</p>
                </div>
              </div>
              <Button variant="outline" onClick={() => void groupQuery.refetch()} disabled={groupQuery.isFetching}>
                <RefreshCw className={`h-4 w-4 ${groupQuery.isFetching ? "animate-spin" : ""}`} />
                تحديث المجموعات
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
              {[
                ["نشطة", groupSummary.active_groups || 0],
                ["انتظار", groupSummary.pending || 0],
                ["تجهيز", groupSummary.preparing || 0],
                ["جاهزة", groupSummary.ready || 0],
                ["في الطريق", groupSummary.on_route || 0],
                ["At risk", groupSummary.at_risk || 0],
                ["متأخرة", groupSummary.late || 0],
                ["إلغاء جزئي", groupSummary.partially_cancelled || 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-emerald-100 bg-white p-3 text-center">
                  <p className="text-[11px] text-slate-500">{label}</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{value}</p>
                </div>
              ))}
            </div>

            {groupQuery.isLoading ? (
              <div className="rounded-2xl bg-white/80 p-6 text-center text-sm text-slate-500">جاري تحميل الطلبات المجمعة…</div>
            ) : groupQuery.error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {groupQuery.error instanceof Error ? groupQuery.error.message : "تعذر تحميل Control Tower للطلبات المجمعة."}
              </div>
            ) : activeGroups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-emerald-200 bg-white/70 p-6 text-center text-sm text-slate-500">
                لا توجد طلبات Multi-store نشطة حاليًا. أول Order Group جديد سيظهر هنا تلقائيًا.
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {activeGroups.map((group) => (
                  <MultiStoreGroupCard
                    key={group.group_id}
                    group={group}
                    onOpenOrder={(id) => navigate(`/online-orders/${id}`)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-violet-200 bg-gradient-to-br from-violet-50/70 via-white to-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-700 text-white"><Layers3 className="h-5 w-5" /></div>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><CardTitle>Batch Picking Shadow</CardTitle><span className="rounded-full bg-violet-100 px-3 py-1 text-[11px] font-black text-violet-800">اقتراح فقط · لا يغيّر الطلبات</span></div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">يجمع الطلبات المتوافقة في جولة مقترحة حسب الـSLA والأقسام والرفوف، مع حد أقصى 4 طلبات و40 صنفًا.</p>
                </div>
              </div>
              <Button variant="outline" onClick={() => void batchShadowQuery.refetch()} disabled={batchShadowQuery.isFetching}><RefreshCw className={`h-4 w-4 ${batchShadowQuery.isFetching ? "animate-spin" : ""}`} />إعادة التحليل</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {batchShadowQuery.isLoading ? <div className="rounded-2xl bg-white/80 p-5 text-center text-sm text-slate-500">جاري تحليل فرص التجميع…</div> : batchShadowQuery.error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">تعذر تحميل تحليل Batch Picking.</div> : <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                {[
                  ["مؤهل للتجميع", batchShadowQuery.data?.summary.eligible_orders || 0],
                  ["Batches مقترحة", batchShadowQuery.data?.summary.recommended_batches || 0],
                  ["طلبات مغطاة", batchShadowQuery.data?.summary.covered_orders || 0],
                  ["تبقى Single", batchShadowQuery.data?.summary.single_orders || 0],
                  ["نسبة التغطية", batchShadowQuery.data?.summary.coverage_rate == null ? "—" : `${batchShadowQuery.data.summary.coverage_rate}%`],
                ].map(([label, value]) => <div key={label} className="rounded-2xl border border-violet-100 bg-white p-3 text-center"><p className="text-[11px] text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-violet-900">{value}</p></div>)}
              </div>
              {(batchShadowQuery.data?.batches || []).length === 0 ? <div className="rounded-2xl border border-dashed border-violet-200 bg-white/70 p-5 text-center text-sm text-slate-500">لا توجد حاليًا طلبات مؤكدة ومتوافقة تستحق التجميع. الطلبات الكبيرة أو المتباعدة زمنيًا ستظل Single تلقائيًا.</div> : <div className="grid gap-3 lg:grid-cols-2">
                {batchShadowQuery.data!.batches.map((batch) => <div key={batch.id} className="rounded-2xl border border-violet-100 bg-white p-4">
                  <div className="flex items-start justify-between gap-3"><div><strong className="text-violet-950">{batch.batch_code}</strong><p className="mt-1 text-xs text-slate-500">{batchReasonLabel[batch.reason] || batch.reason} · Score {Number(batch.score).toFixed(1)}</p></div><span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-800">{batch.order_count} طلبات · {batch.total_lines} صنف</span></div>
                  <div className="mt-3 space-y-2">{batch.orders.map((order) => <button key={order.order_id} type="button" onClick={() => navigate(`/online-orders/${order.order_id}`)} className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-right transition hover:bg-violet-50"><div><p className="text-sm font-black">{order.display_id}</p><p className="text-[11px] text-slate-500">{order.customer_name} · {order.items_total} صنف</p></div><span className={`text-xs font-black ${order.eta_risk === "late" ? "text-red-600" : order.eta_risk === "at_risk" ? "text-amber-700" : "text-emerald-700"}`}>{riskLabel[order.eta_risk] || "—"} · {timeLabel(order.predicted_ready_at)}</span></button>)}</div>
                  <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs"><span className="text-slate-500">المجهز المقترح</span><strong>{batch.recommended_user_name || "يُحدد وقت التوزيع"}</strong></div>
                </div>)}
              </div>}
            </>}
          </CardContent>
        </Card>

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
