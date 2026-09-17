import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Boxes,
  Building2,
  Clock3,
  MapPin,
  MonitorCog,
  PackageCheck,
  Power,
  PowerOff,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
  Smartphone,
  Store,
  Truck,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  BranchChannelKey,
  BranchChannelRuntime,
  fetchBranchControlDetail,
  setBranchActive,
  setBranchChannel,
} from "@/services/supabase/branchControlService";
import { fetchFranchiseDetail } from "@/services/supabase/franchiseService";

const channelDefinitions: Array<{
  key: BranchChannelKey;
  label: string;
  description: string;
  icon: typeof MonitorCog;
}> = [
  { key: "pos", label: "نقطة البيع POS", description: "البيع داخل الفرع والورديات", icon: MonitorCog },
  { key: "online_sales", label: "البيع أونلاين", description: "إنشاء الطلبات من القنوات الرقمية", icon: ShoppingCart },
  { key: "customer_app", label: "تطبيق العميل", description: "ظهور واستخدام الفرع في تجربة العميل", icon: Smartphone },
  { key: "marketplace", label: "Marketplace", description: "استقبال الطلبات كمتجر شريك", icon: Store },
  { key: "delivery", label: "التوصيل", description: "التوزيع والمندوبون ومناطق التوصيل", icon: Truck },
  { key: "pickup", label: "Pickup", description: "الطلب أونلاين والاستلام من الفرع", icon: PackageCheck },
];

const blockedLabels: Record<string, string> = {
  branch_channel_disabled: "موقوف من إعدادات الفرع",
  branch_inactive: "الفرع نفسه غير نشط",
  merchant_inactive: "المشغل غير نشط",
  tenant_pos_disabled: "POS موقوف من منصة SaaS",
  tenant_online_sales_disabled: "البيع أونلاين موقوف من منصة SaaS",
  tenant_customer_app_disabled: "تطبيق العميل موقوف من منصة SaaS",
  tenant_delivery_disabled: "التوصيل موقوف من منصة SaaS",
  merchant_not_marketplace: "المشغل ليس Marketplace/Franchise",
  merchant_not_published: "المشغل لم يتم نشره للعملاء",
  branch_not_marketplace_published: "الفرع غير منشور في Marketplace",
  legacy_delivery_disabled: "التوصيل غير مفعل على إعدادات الفرع",
};

const merchantLabels: Record<string, string> = {
  owned: "مملوك للشركة",
  franchise: "Franchise",
  partner: "Marketplace Partner",
};

const agreementLabels: Record<string, string> = {
  draft: "مسودة",
  review: "قيد المراجعة",
  approved: "معتمد",
  active: "نشط",
  suspended: "موقوف",
  expired: "منتهي",
  terminated: "منهى",
};

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function HealthCard({ label, value, note, icon: Icon }: { label: string; value: number | string; note: string; icon: typeof Boxes }) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-bold text-slate-500">{label}</p><div className="mt-2 text-2xl font-black text-slate-950">{value}</div><p className="mt-2 text-[11px] leading-5 text-slate-400">{note}</p></div>
          <div className="rounded-2xl bg-emerald-50 p-2.5 text-[#005931]"><Icon className="h-5 w-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

function RuntimeBadge({ runtime }: { runtime: BranchChannelRuntime }) {
  if (runtime.effective_enabled) return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">فعال فعليًا</Badge>;
  if (runtime.configured_enabled) return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">مُفعل لكن محجوب</Badge>;
  return <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">متوقف</Badge>;
}

export default function BranchControlDetails() {
  const { branchId } = useParams<{ branchId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["branch-control-detail", branchId],
    queryFn: () => fetchBranchControlDetail(branchId!),
    enabled: !!branchId,
    staleTime: 8_000,
    refetchInterval: 30_000,
  });

  const franchiseQuery = useQuery({
    queryKey: ["franchise-detail", query.data?.merchant.id],
    queryFn: () => fetchFranchiseDetail(query.data!.merchant.id),
    enabled: query.data?.merchant.merchant_type === "franchise" && !!query.data?.merchant.id,
    staleTime: 8_000,
  });

  const [pendingDisable, setPendingDisable] = useState<{ key: BranchChannelKey; label: string } | null>(null);
  const [reason, setReason] = useState("");
  const [messageAr, setMessageAr] = useState("");
  const [pendingBranchDisable, setPendingBranchDisable] = useState(false);
  const [branchReason, setBranchReason] = useState("");

  const mutation = useMutation({
    mutationFn: (input: { key: BranchChannelKey; enabled: boolean; reason?: string | null; messageAr?: string | null }) => {
      if (!branchId) throw new Error("الفرع غير محدد");
      return setBranchChannel({ branchId, channel: input.key, enabled: input.enabled, reason: input.reason, messageAr: input.messageAr });
    },
    onSuccess: async (runtime) => {
      toast.success(runtime.configured_enabled ? "تم تشغيل القناة" : "تم إيقاف القناة");
      setPendingDisable(null);
      setReason("");
      setMessageAr("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["branch-control-detail", branchId] }),
        queryClient.invalidateQueries({ queryKey: ["business-structure"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث القناة"),
  });

  const branchStateMutation = useMutation({
    mutationFn: (input: { active: boolean; reason?: string | null }) => {
      if (!branchId) throw new Error("الفرع غير محدد");
      return setBranchActive({ branchId, active: input.active, reason: input.reason });
    },
    onSuccess: async (result) => {
      toast.success(result.active ? "تم تشغيل الفرع" : "تم إيقاف الفرع");
      setPendingBranchDisable(false);
      setBranchReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["branch-control-detail", branchId] }),
        queryClient.invalidateQueries({ queryKey: ["business-structure"] }),
        queryClient.invalidateQueries({ queryKey: ["franchise-detail", result.merchant_id] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث حالة الفرع"),
  });

  const toggleChannel = (runtime: BranchChannelRuntime, label: string) => {
    const next = !runtime.configured_enabled;
    if (!next) {
      setReason(`إيقاف ${label} من مركز الفروع`);
      setMessageAr("الخدمة متوقفة مؤقتًا في هذا الفرع.");
      setPendingDisable({ key: runtime.channel, label });
      return;
    }
    mutation.mutate({ key: runtime.channel, enabled: true });
  };

  const confirmDisable = () => {
    if (!pendingDisable || !reason.trim()) return;
    mutation.mutate({ key: pendingDisable.key, enabled: false, reason: reason.trim(), messageAr: messageAr.trim() || reason.trim() });
  };

  const confirmBranchDisable = () => {
    if (!branchReason.trim()) return;
    branchStateMutation.mutate({ active: false, reason: branchReason.trim() });
  };

  const lastOrder = useMemo(() => {
    const raw = query.data?.health?.last_order_at;
    if (!raw) return "لا يوجد";
    return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(raw));
  }, [query.data?.health?.last_order_at]);

  if (query.isLoading) {
    return <MainLayout><div className="grid min-h-[60vh] place-items-center"><div className="text-center text-sm font-bold text-slate-500"><RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-[#005931]" />جارٍ تحميل Branch 360…</div></div></MainLayout>;
  }

  if (query.error || !query.data) {
    return <MainLayout><div dir="rtl" className="space-y-4"><Button variant="outline" onClick={() => navigate("/branches")}><ArrowRight className="ml-2 h-4 w-4" />العودة للفروع</Button><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-800">{query.error instanceof Error ? query.error.message : "تعذر تحميل بيانات الفرع"}</div></div></MainLayout>;
  }

  const { branch, merchant, channels, groups, health } = query.data;
  const activationBlockers: string[] = [];
  const agreement = franchiseQuery.data?.current_agreement;
  const currentDate = todayKey();

  if (!branch.active) {
    if (merchant.status !== "active") activationBlockers.push("المشغل نفسه غير نشط؛ يجب إعادة تفعيله أولًا.");

    if (merchant.merchant_type === "franchise") {
      if (franchiseQuery.isLoading) {
        activationBlockers.push("جارٍ التحقق من عقد الـFranchise…");
      } else if (franchiseQuery.isError) {
        activationBlockers.push("تعذر التحقق من عقد الـFranchise؛ التفعيل محجوب احتياطيًا.");
      } else if (!agreement) {
        activationBlockers.push("لا يوجد عقد Franchise حالي لهذا المشغل.");
      } else {
        if (agreement.status !== "active") activationBlockers.push(`العقد الحالي حالته «${agreementLabels[agreement.status] || agreement.status}» وليس Active.`);
        if (agreement.starts_on && agreement.starts_on > currentDate) activationBlockers.push(`العقد يبدأ في ${agreement.starts_on} ولم يدخل فترة السريان بعد.`);
        if (agreement.ends_on && agreement.ends_on < currentDate) activationBlockers.push(`العقد انتهى في ${agreement.ends_on}.`);
      }
    }
  }

  const canActivate = !branch.active && activationBlockers.length === 0;

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6 pb-12">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Button variant="ghost" className="mb-2 -mr-3 text-slate-500" onClick={() => navigate("/branches")}><ArrowRight className="ml-2 h-4 w-4" />مركز الفروع</Button>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={merchant.merchant_type === "owned" ? "bg-emerald-100 text-emerald-800" : merchant.merchant_type === "franchise" ? "bg-blue-100 text-blue-800" : "bg-violet-100 text-violet-800"}>{merchantLabels[merchant.merchant_type] || merchant.merchant_type}</Badge>
              <Badge variant="outline" className={branch.active ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-700"}>{branch.active ? "الفرع نشط" : "الفرع متوقف"}</Badge>
              {merchant.merchant_type === "franchise" && agreement && <Badge variant="outline">العقد: {agreementLabels[agreement.status] || agreement.status}</Badge>}
            </div>
            <h1 className="mt-3 text-3xl font-black text-slate-950">{branch.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-slate-500">
              <span>{branch.code}</span>
              <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{merchant.name}</span>
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{branch.address || "لا يوجد عنوان مسجل"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {branch.active ? (
              <Button variant="destructive" onClick={() => { setBranchReason(""); setPendingBranchDisable(true); }} disabled={branchStateMutation.isPending}>
                <PowerOff className="ml-2 h-4 w-4" />إيقاف الفرع
              </Button>
            ) : (
              <Button className="bg-[#005931] hover:bg-[#004525]" onClick={() => branchStateMutation.mutate({ active: true })} disabled={!canActivate || branchStateMutation.isPending}>
                <Power className="ml-2 h-4 w-4" />{branchStateMutation.isPending ? "جارٍ التشغيل…" : "تشغيل الفرع"}
              </Button>
            )}
            <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث الحالة</Button>
          </div>
        </div>

        {!branch.active && (
          activationBlockers.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="font-black text-amber-950">التفعيل محجوب حاليًا</p><p className="mt-1 text-xs text-amber-800">Branch 360 يمنع التشغيل قبل استيفاء شروط المشغل والعقد، والـServer يعيد التحقق عند التنفيذ.</p><div className="mt-3 space-y-1">{activationBlockers.map((item) => <p key={item} className="text-xs font-bold text-amber-900">• {item}</p>)}</div></div></div>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">الفرع جاهز للتشغيل. تفعيل الفرع لا يغير إعدادات القنوات؛ كل قناة ستعمل فقط حسب إعدادها وحالتها الفعلية.</div>
          )
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <HealthCard label="أصناف المخزون" value={Number(health.inventory_sku_count || 0).toLocaleString("ar-EG")} note="SKU مسجل على الفرع" icon={Boxes} />
          <HealthCard label="تنبيهات المخزون" value={Number(health.low_stock_count || 0).toLocaleString("ar-EG")} note="وصلت للحد الأدنى" icon={Boxes} />
          <HealthCard label="طلبات نشطة" value={Number(health.active_online_orders || 0).toLocaleString("ar-EG")} note="قيد التنفيذ الآن" icon={ShoppingCart} />
          <HealthCard label="طلبات 24 ساعة" value={Number(health.orders_last_24h || 0).toLocaleString("ar-EG")} note="Online / Marketplace" icon={ShoppingCart} />
          <HealthCard label="مناطق التوصيل" value={Number(health.active_delivery_zones || 0).toLocaleString("ar-EG")} note="Zone فعالة" icon={Truck} />
          <HealthCard label="آخر طلب" value={lastOrder} note="آخر نشاط طلبات مسجل" icon={Clock3} />
        </section>

        <section className="space-y-3">
          <div><p className="text-xs font-black text-[#005931]">CHANNEL CONTROL</p><h2 className="mt-1 text-xl font-black text-slate-950">قنوات تشغيل الفرع</h2><p className="mt-1 text-xs leading-5 text-slate-500">الحالة الفعلية تجمع إعداد الفرع مع حالة المشغل واشتراك SaaS والنشر في Marketplace. إيقاف الفرع يحجب القنوات بدون مسح إعداداتها.</p></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {channelDefinitions.map((definition) => {
              const runtime = channels[definition.key];
              const Icon = definition.icon;
              return (
                <Card key={definition.key} className={`border-slate-200 bg-white shadow-sm ${runtime.effective_enabled ? "ring-1 ring-emerald-100" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3"><div className={`rounded-2xl p-2.5 ${runtime.effective_enabled ? "bg-emerald-50 text-[#005931]" : "bg-slate-100 text-slate-500"}`}><Icon className="h-5 w-5" /></div><div><h3 className="font-black text-slate-950">{definition.label}</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">{definition.description}</p></div></div>
                      <Switch checked={!!runtime.configured_enabled} disabled={mutation.isPending} onCheckedChange={() => toggleChannel(runtime, definition.label)} />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2"><RuntimeBadge runtime={runtime} /><span className="text-[10px] font-bold text-slate-400">rev {runtime.revision}</span></div>
                    {!!runtime.blocked_by?.length && <div className="mt-3 space-y-1 rounded-xl bg-amber-50 p-3">{runtime.blocked_by.map((code) => <p key={code} className="text-[11px] font-bold text-amber-900">• {blockedLabels[code] || code}</p>)}</div>}
                    {runtime.reason && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">آخر سبب: {runtime.reason}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
          <Card className="border-slate-200"><CardContent className="p-5"><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-[#005931]" /><h2 className="font-black">تشغيل الفرع</h2></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-[11px] font-bold text-slate-400">سياسة المخزون</p><p className="mt-2 text-sm font-black">{branch.independent_inventory ? "مخزون مستقل" : "مصدر مخزون مشترك"}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-[11px] font-bold text-slate-400">سياسة التسعير</p><p className="mt-2 text-sm font-black">{branch.independent_pricing ? "تسعير مستقل" : "تسعير موروث"}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-[11px] font-bold text-slate-400">رسوم التوصيل</p><p className="mt-2 text-sm font-black">{Number(branch.delivery_fee || 0).toLocaleString("ar-EG")} ج.م</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-[11px] font-bold text-slate-400">الحد الأدنى للطلب</p><p className="mt-2 text-sm font-black">{Number(branch.min_order_amount || 0).toLocaleString("ar-EG")} ج.م</p></div></div></CardContent></Card>
          <Card className="border-slate-200"><CardContent className="p-5"><div className="flex items-center gap-2"><Store className="h-5 w-5 text-[#005931]" /><h2 className="font-black">المشغل والمجموعات</h2></div><div className="mt-4 rounded-2xl border border-slate-100 p-4"><p className="text-[11px] font-bold text-slate-400">Operator</p><p className="mt-1 font-black">{merchant.name}</p><p className="mt-1 text-xs text-slate-500">{merchant.code} • {merchantLabels[merchant.merchant_type] || merchant.merchant_type}</p></div><div className="mt-3 flex flex-wrap gap-2">{groups.length ? groups.map((group) => <Badge key={group.id} variant="outline">{group.name}</Badge>) : <span className="text-xs text-slate-400">الفرع غير مضاف لأي مجموعة حتى الآن.</span>}</div></CardContent></Card>
        </section>
      </div>

      <Dialog open={pendingBranchDisable} onOpenChange={(open) => !open && setPendingBranchDisable(false)}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader><DialogTitle>إيقاف الفرع بالكامل</DialogTitle><DialogDescription>سيتم حجب التشغيل الفعلي لكل القنوات، لكن إعدادات القنوات نفسها ستظل محفوظة حتى يمكن استعادتها عند إعادة تشغيل الفرع.</DialogDescription></DialogHeader>
          <div className="space-y-2 py-3"><Label>سبب إيقاف الفرع *</Label><Input value={branchReason} onChange={(event) => setBranchReason(event.target.value)} placeholder="مثال: صيانة شاملة / إيقاف تشغيلي مؤقت" /></div>
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setPendingBranchDisable(false)}>إلغاء</Button><Button variant="destructive" onClick={confirmBranchDisable} disabled={!branchReason.trim() || branchStateMutation.isPending}>{branchStateMutation.isPending ? "جارٍ الإيقاف…" : "تأكيد إيقاف الفرع"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDisable} onOpenChange={(open) => !open && setPendingDisable(null)}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader><DialogTitle>إيقاف {pendingDisable?.label}</DialogTitle><DialogDescription>الإيقاف يطبق على الفرع فقط. لو الخدمة موقوفة من منصة SaaS فستظل الحالة الفعلية متوقفة حتى بعد تشغيلها هنا.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-3"><div className="space-y-2"><Label>سبب الإيقاف *</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="مثال: صيانة مؤقتة في الفرع" /></div><div className="space-y-2"><Label>رسالة للمستخدم — اختيارية</Label><Input value={messageAr} onChange={(event) => setMessageAr(event.target.value)} placeholder="الخدمة متوقفة مؤقتًا في هذا الفرع" /></div></div>
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setPendingDisable(null)}>إلغاء</Button><Button variant="destructive" onClick={confirmDisable} disabled={!reason.trim() || mutation.isPending}>{mutation.isPending ? "جارٍ الإيقاف…" : "تأكيد الإيقاف"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
