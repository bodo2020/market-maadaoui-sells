import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Building2,
  CalendarClock,
  CreditCard,
  Layers3,
  MonitorCog,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
  Smartphone,
  Store,
  Truck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  assignTenantSubscription,
  fetchSaaSControlCenter,
  SaaSPlan,
  SaaSPlanInput,
  SaaSTenantControl,
  setTenantSubscriptionStatus,
  SubscriptionStatus,
  TenantPlatformControlPatch,
  updateTenantPlatformControls,
  upsertSaaSPlan,
} from "@/services/supabase/saasControlService";

type ControlKey =
  | "app_access_enabled"
  | "online_sales_enabled"
  | "pos_enabled"
  | "admin_enabled"
  | "customer_app_enabled"
  | "delivery_enabled";

type PatchKey =
  | "appAccessEnabled"
  | "onlineSalesEnabled"
  | "posEnabled"
  | "adminEnabled"
  | "customerAppEnabled"
  | "deliveryEnabled";

const controlDefinitions: Array<{
  key: ControlKey;
  patchKey: PatchKey;
  label: string;
  description: string;
  icon: typeof Power;
}> = [
  { key: "app_access_enabled", patchKey: "appAccessEnabled", label: "تشغيل النظام بالكامل", description: "Kill Switch أعلى من كل التطبيقات والخدمات.", icon: Power },
  { key: "online_sales_enabled", patchKey: "onlineSalesEnabled", label: "البيع أونلاين", description: "يوقف إنشاء طلبات Online وMarketplace من السيرفر.", icon: ShoppingCart },
  { key: "pos_enabled", patchKey: "posEnabled", label: "نقطة البيع POS", description: "المبيعات والورديات محمية من قاعدة البيانات.", icon: MonitorCog },
  { key: "admin_enabled", patchKey: "adminEnabled", label: "لوحة الإدارة", description: "إدارة الفروع والمنتجات والمخزون والموردين.", icon: Building2 },
  { key: "customer_app_enabled", patchKey: "customerAppEnabled", label: "تطبيق العميل", description: "إتاحة تطبيق التسوق الخاص بالعميل.", icon: Smartphone },
  { key: "delivery_enabled", patchKey: "deliveryEnabled", label: "تطبيق التوصيل", description: "تشغيل المندوبين وعمليات التوصيل.", icon: Truck },
];

const subscriptionLabels: Record<string, string> = {
  legacy_unmanaged: "قديم / غير مُدار",
  trial: "فترة تجريبية",
  active: "نشط",
  past_due: "متأخر دفع",
  suspended: "موقوف",
  cancelled: "ملغي",
  expired: "منتهي",
};

function Summary({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardContent className="p-4">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <div className="mt-2 text-2xl font-black text-slate-950">{Number(value || 0).toLocaleString("ar-EG")}</div>
        <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p>
      </CardContent>
    </Card>
  );
}

function formatMoney(value: number, currency = "EGP") {
  return new Intl.NumberFormat("ar-EG", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(new Date(value));
}

function subscriptionBadge(status?: string | null) {
  const value = status || "legacy_unmanaged";
  const label = subscriptionLabels[value] || value;
  if (["suspended", "expired", "cancelled"].includes(value)) return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">{label}</Badge>;
  if (value === "past_due") return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">{label}</Badge>;
  if (value === "trial") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">{label}</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{label}</Badge>;
}

function statusBadge(tenant: SaaSTenantControl) {
  if (!tenant.subscription?.allowed) return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">موقوف بالاشتراك</Badge>;
  if (!tenant.app_access_enabled) return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">موقوف من المنصة</Badge>;
  if (tenant.tenant_status !== "active") return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">{tenant.tenant_status}</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">يعمل</Badge>;
}

function UsageBar({ label, used, limit, icon: Icon }: { label: string; used: number; limit: number | null; icon: typeof Store }) {
  const percentage = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const nearLimit = limit !== null && limit > 0 && percentage >= 80;
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600"><Icon className="h-4 w-4" />{label}</div>
        <span className={`text-xs font-black ${nearLimit ? "text-amber-700" : "text-slate-900"}`}>
          {Number(used || 0).toLocaleString("ar-EG")} / {limit === null ? "∞" : Number(limit).toLocaleString("ar-EG")}
        </span>
      </div>
      {limit !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div className={`h-full rounded-full ${nearLimit ? "bg-amber-500" : "bg-[#005931]"}`} style={{ width: `${percentage}%` }} />
        </div>
      )}
    </div>
  );
}

export default function SaaSControlCenter() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["saas-control-center"],
    queryFn: fetchSaaSControlCenter,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const [pending, setPending] = useState<{
    tenant: SaaSTenantControl;
    key: ControlKey;
    patchKey: PatchKey;
    nextValue: boolean;
    label: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [reasonCode, setReasonCode] = useState<NonNullable<TenantPlatformControlPatch["blockReasonCode"]>>("manual");

  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [planDraft, setPlanDraft] = useState<SaaSPlanInput | null>(null);
  const [subscriptionTenant, setSubscriptionTenant] = useState<SaaSTenantControl | null>(null);
  const [subscriptionPlanId, setSubscriptionPlanId] = useState("");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [graceDays, setGraceDays] = useState(3);
  const [autoSuspend, setAutoSuspend] = useState(true);

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ["saas-control-center"] });
    await queryClient.invalidateQueries({ queryKey: ["tenant-runtime-control"] });
  };

  const platformMutation = useMutation({
    mutationFn: async () => {
      if (!pending) throw new Error("لم يتم تحديد أمر التحكم.");
      const patch: TenantPlatformControlPatch = {
        tenantId: pending.tenant.tenant_id,
        [pending.patchKey]: pending.nextValue,
      };
      if (!pending.nextValue) {
        patch.blockReasonCode = reasonCode;
        patch.blockReason = reason;
        patch.blockMessageAr = message || reason;
      }
      return updateTenantPlatformControls(patch);
    },
    onSuccess: async () => {
      toast.success(pending?.nextValue ? "تم تشغيل الخدمة" : "تم إيقاف الخدمة", {
        description: pending ? `${pending.tenant.tenant_name} — ${pending.label}` : undefined,
      });
      setPending(null);
      setReason("");
      setMessage("");
      await refreshAll();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث حالة الخدمة"),
  });

  const planMutation = useMutation({
    mutationFn: async () => {
      if (!planDraft) throw new Error("بيانات الباقة غير مكتملة.");
      return upsertSaaSPlan(planDraft);
    },
    onSuccess: async () => {
      toast.success(planDraft?.planId ? "تم تحديث الباقة" : "تم إنشاء الباقة");
      setPlanEditorOpen(false);
      setPlanDraft(null);
      await refreshAll();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر حفظ الباقة"),
  });

  const subscriptionMutation = useMutation({
    mutationFn: async () => {
      if (!subscriptionTenant || !subscriptionPlanId) throw new Error("اختر الباقة أولًا.");
      return assignTenantSubscription({
        tenantId: subscriptionTenant.tenant_id,
        planId: subscriptionPlanId,
        billingCycle,
        status: "active",
        graceDays,
        autoSuspend,
      });
    },
    onSuccess: async () => {
      toast.success("تم تحديث اشتراك العميل");
      setSubscriptionTenant(null);
      await refreshAll();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث الاشتراك"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ tenant, status }: { tenant: SaaSTenantControl; status: SubscriptionStatus }) =>
      setTenantSubscriptionStatus(
        tenant.tenant_id,
        status,
        status === "suspended" ? "إيقاف يدوي من SaaS Control Center" : "استرجاع يدوي من SaaS Control Center",
      ),
    onSuccess: async (_, variables) => {
      toast.success(variables.status === "suspended" ? "تم إيقاف الاشتراك" : "تم استرجاع الاشتراك");
      await refreshAll();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تغيير حالة الاشتراك"),
  });

  const tenants = useMemo(() => query.data?.tenants || [], [query.data?.tenants]);
  const plans = useMemo(() => query.data?.plans || [], [query.data?.plans]);

  const requestToggle = (tenant: SaaSTenantControl, definition: (typeof controlDefinitions)[number], nextValue: boolean) => {
    setPending({ tenant, key: definition.key, patchKey: definition.patchKey, nextValue, label: definition.label });
    if (!nextValue) {
      const defaultReason = definition.key === "app_access_enabled" ? "إيقاف النظام من إدارة المنصة" : `إيقاف ${definition.label}`;
      setReason(defaultReason);
      setMessage(definition.key === "online_sales_enabled" ? "الطلبات الأونلاين متوقفة مؤقتًا. يمكنك تصفح التطبيق والمحاولة لاحقًا." : "الخدمة متوقفة مؤقتًا بواسطة إدارة المنصة.");
    } else {
      setReason("");
      setMessage("");
    }
  };

  const openPlanEditor = (plan?: SaaSPlan) => {
    const featureKeys = query.data?.feature_catalog.map((item) => item.feature_key) || [];
    const limitKeys = query.data?.limit_catalog.map((item) => item.limit_key) || [];
    const features = Object.fromEntries(featureKeys.map((key) => [key, plan?.features?.[key] ?? false]));
    const limits = Object.fromEntries(limitKeys.map((key) => [key, plan?.limits?.[key] ?? null]));
    setPlanDraft({
      planId: plan?.id || null,
      code: plan?.code || "",
      nameAr: plan?.name_ar || "",
      nameEn: plan?.name_en || "",
      descriptionAr: plan?.description_ar || "",
      monthlyPrice: Number(plan?.monthly_price || 0),
      yearlyPrice: Number(plan?.yearly_price || 0),
      currency: plan?.currency || "EGP",
      isActive: plan?.is_active ?? true,
      features,
      limits,
    });
    setPlanEditorOpen(true);
  };

  const openSubscription = (tenant: SaaSTenantControl) => {
    setSubscriptionTenant(tenant);
    setSubscriptionPlanId(tenant.subscription?.plan_id || plans.find((plan) => plan.is_active && !plan.is_internal)?.id || "");
    setBillingCycle("monthly");
    setGraceDays(3);
    setAutoSuspend(true);
  };

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6 pb-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black text-slate-950">SaaS Control Center</h1>
              <Badge className="bg-slate-950 hover:bg-slate-950">Platform Super Admin</Badge>
              <Badge variant="outline">Phase 11</Badge>
            </div>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">إدارة تشغيل العملاء، الباقات، المزايا، الحدود وحالة الاشتراك من مكان واحد. حدود الباقات وإيقاف الاشتراك أصبحت Server-enforced وليست مجرد إعدادات واجهة.</p>
          </div>
          <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث
          </Button>
        </div>

        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">Platform Override + Subscription Enforcement</p>
            <p className="mt-1 text-sm leading-6 text-amber-800">الـKill Switch يظل أعلى صلاحية، لكن انتهاء أو إيقاف الاشتراك يغلق الخدمة كذلك. الباقة تحدد ما إذا كانت POS / Online / Delivery وغيرها متاحة أصلًا.</p>
          </div>
        </div>

        {query.isLoading && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}</div>}
        {query.isError && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-800">{query.error instanceof Error ? query.error.message : "تعذر تحميل منصة SaaS"}</div>}

        {query.data && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <Summary label="عملاء SaaS" value={query.data.summary.tenant_count} note="كل الشركات المسجلة." />
              <Summary label="أنظمة تعمل" value={query.data.summary.active_tenant_count} note="مسموح لها بالتشغيل حاليًا." />
              <Summary label="أنظمة موقوفة" value={query.data.summary.suspended_tenant_count} note="Platform أو Subscription." />
              <Summary label="Online يعمل" value={query.data.summary.online_sales_enabled_count} note="مسموح لها بالطلب الأونلاين." />
              <Summary label="متأخر دفع" value={query.data.summary.past_due_count} note="داخل فترة السماح إن وجدت." />
              <Summary label="Subscription blocked" value={query.data.summary.subscription_blocked_count} note="موقوفة بواسطة دورة الاشتراك." />
            </section>

            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-black text-slate-950">الباقات</h2>
                  <p className="mt-1 text-sm text-slate-500">المزايا والحدود الفعلية التي يفرضها السيرفر على كل اشتراك.</p>
                </div>
                <Button onClick={() => openPlanEditor()} className="bg-[#005931] hover:bg-[#004426]"><Plus className="ml-2 h-4 w-4" />باقة جديدة</Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {plans.map((plan) => {
                  const enabledFeatures = Object.values(plan.features || {}).filter(Boolean).length;
                  return (
                    <Card key={plan.id} className={`border-slate-200 bg-white ${plan.is_internal ? "ring-1 ring-emerald-200" : ""}`}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-black text-slate-950">{plan.name_ar}</h3>
                              {plan.is_internal && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Internal</Badge>}
                              {!plan.is_active && <Badge variant="outline">غير مفعلة</Badge>}
                            </div>
                            <p className="mt-1 text-xs text-slate-500">{plan.code}</p>
                          </div>
                          {!plan.is_internal && <Button size="icon" variant="ghost" onClick={() => openPlanEditor(plan)}><Pencil className="h-4 w-4" /></Button>}
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">شهري</p><p className="mt-1 font-black">{formatMoney(plan.monthly_price, plan.currency)}</p></div>
                          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">سنوي</p><p className="mt-1 font-black">{formatMoney(plan.yearly_price, plan.currency)}</p></div>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{enabledFeatures} ميزة مفعلة</span><Layers3 className="h-4 w-4" /></div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">العملاء والاشتراكات</h2>
                <p className="mt-1 text-sm text-slate-500">راقب الاستخدام، غيّر الباقة أو أوقف الاشتراك مع بقاء Platform Kill Switch متاحًا بشكل مستقل.</p>
              </div>

              {tenants.map((tenant) => {
                const subscription = tenant.subscription;
                const effectiveStatus = subscription?.effective_status || tenant.subscription_effective_status || "legacy_unmanaged";
                const isSuspended = ["suspended", "expired", "cancelled"].includes(effectiveStatus);
                return (
                  <Card key={tenant.tenant_id} className="overflow-hidden border-slate-200 bg-white">
                    <CardContent className="p-0">
                      <div className="flex flex-col gap-5 border-b border-slate-100 p-5 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-black text-slate-950">{tenant.tenant_name}</h2>
                            {statusBadge(tenant)}
                            {subscriptionBadge(effectiveStatus)}
                            <Badge variant="outline">{tenant.subdomain}</Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                            <span>الباقة: <b className="text-slate-800">{subscription?.plan_name || tenant.plan_name || "غير محددة"}</b></span>
                            <span>تنتهي: {formatDate(subscription?.ends_at)}</span>
                            {subscription?.days_remaining !== null && subscription?.days_remaining !== undefined && <span>المتبقي: {subscription.days_remaining} يوم</span>}
                            <span>Revision #{tenant.revision}</span>
                          </div>
                          {tenant.block_reason && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">سبب Platform block: {tenant.block_reason}</p>}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" onClick={() => openSubscription(tenant)}><CreditCard className="ml-2 h-4 w-4" />تغيير الباقة</Button>
                          {subscription?.managed && !subscription?.plan_code?.includes("platform_internal") && (
                            <Button
                              variant="outline"
                              className={isSuspended ? "border-emerald-200 text-emerald-800" : "border-red-200 text-red-700"}
                              disabled={statusMutation.isPending}
                              onClick={() => statusMutation.mutate({ tenant, status: isSuspended ? "active" : "suspended" })}
                            >
                              {isSuspended ? <Power className="ml-2 h-4 w-4" /> : <Ban className="ml-2 h-4 w-4" />}
                              {isSuspended ? "استرجاع الاشتراك" : "إيقاف الاشتراك"}
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-3">
                        <UsageBar label="الفروع" icon={Store} used={tenant.usage?.branches?.used || 0} limit={tenant.usage?.branches?.limit ?? null} />
                        <UsageBar label="المستخدمون" icon={Users} used={tenant.usage?.users?.used || 0} limit={tenant.usage?.users?.limit ?? null} />
                        <UsageBar label="المنتجات" icon={Layers3} used={tenant.usage?.products?.used || 0} limit={tenant.usage?.products?.limit ?? null} />
                      </div>

                      <div className="grid gap-px bg-slate-100 md:grid-cols-2 xl:grid-cols-3">
                        {controlDefinitions.map((definition) => {
                          const Icon = definition.icon;
                          const checked = Boolean(tenant[definition.key]);
                          const globalBlocked = definition.key !== "app_access_enabled" && !tenant.app_access_enabled;
                          const subscriptionBlocked = !tenant.subscription?.allowed;
                          return (
                            <div key={definition.key} className="flex items-center gap-4 bg-white p-4">
                              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${checked ? "bg-emerald-50 text-[#005931]" : "bg-red-50 text-red-700"}`}><Icon className="h-5 w-5" /></span>
                              <div className="min-w-0 flex-1">
                                <p className="font-black text-slate-900">{definition.label}</p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">{subscriptionBlocked ? "موقوف بسبب حالة الاشتراك" : globalBlocked ? "موقوف بسبب Kill Switch الرئيسي" : definition.description}</p>
                              </div>
                              <Switch
                                checked={checked}
                                disabled={platformMutation.isPending || globalBlocked || subscriptionBlocked}
                                onCheckedChange={(value) => requestToggle(tenant, definition, value)}
                                aria-label={`${definition.label} - ${tenant.tenant_name}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {!tenants.length && <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">لا يوجد عملاء SaaS حتى الآن.</div>}
            </section>
          </>
        )}

        <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && !platformMutation.isPending && setPending(null)}>
          <DialogContent dir="rtl" className="sm:max-w-lg">
            <DialogHeader className="text-right">
              <DialogTitle>{pending?.nextValue ? "تأكيد تشغيل الخدمة" : "تأكيد إيقاف الخدمة"}</DialogTitle>
              <DialogDescription className="text-right leading-6">{pending ? `${pending.tenant.tenant_name} — ${pending.label}` : ""}</DialogDescription>
            </DialogHeader>
            {!pending?.nextValue && (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>نوع الإيقاف</Label>
                  <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value as typeof reasonCode)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400">
                    <option value="manual">يدوي</option><option value="billing">تحصيل / اشتراك</option><option value="maintenance">صيانة</option><option value="security">أمان</option><option value="policy">سياسة استخدام</option><option value="other">أخرى</option>
                  </select>
                </div>
                <div className="space-y-2"><Label>سبب الإيقاف</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="سبب واضح يسجل في Audit Log" /></div>
                <div className="space-y-2"><Label>الرسالة التي تظهر للمحل</Label><Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="الخدمة متوقفة مؤقتًا..." /></div>
              </div>
            )}
            {pending?.nextValue && <div className="rounded-2xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">سيتم إعادة إتاحة Platform override. حالة الاشتراك والباقة ستظل مطبقة بشكل مستقل.</div>}
            <DialogFooter className="gap-2 sm:justify-start">
              <Button onClick={() => platformMutation.mutate()} disabled={platformMutation.isPending || (!pending?.nextValue && !reason.trim())} className={pending?.nextValue ? "bg-[#005931] hover:bg-[#004426]" : "bg-red-700 hover:bg-red-800"}>{platformMutation.isPending ? "جاري التنفيذ..." : pending?.nextValue ? "تشغيل" : "إيقاف"}</Button>
              <Button variant="outline" onClick={() => setPending(null)} disabled={platformMutation.isPending}>إلغاء</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={planEditorOpen} onOpenChange={(open) => !planMutation.isPending && setPlanEditorOpen(open)}>
          <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader className="text-right">
              <DialogTitle>{planDraft?.planId ? "تعديل الباقة" : "إنشاء باقة جديدة"}</DialogTitle>
              <DialogDescription className="text-right">حدد السعر، المزايا والحدود. أي Tenant على هذه الباقة سيأخذ التغييرات فورًا.</DialogDescription>
            </DialogHeader>
            {planDraft && (
              <div className="space-y-5 py-2">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2"><Label>اسم الباقة</Label><Input value={planDraft.nameAr} onChange={(e) => setPlanDraft({ ...planDraft, nameAr: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Code</Label><Input dir="ltr" disabled={Boolean(planDraft.planId)} value={planDraft.code} onChange={(e) => setPlanDraft({ ...planDraft, code: e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() })} placeholder="starter" /></div>
                  <div className="space-y-2"><Label>السعر الشهري</Label><Input type="number" min="0" value={planDraft.monthlyPrice} onChange={(e) => setPlanDraft({ ...planDraft, monthlyPrice: Number(e.target.value) })} /></div>
                  <div className="space-y-2"><Label>السعر السنوي</Label><Input type="number" min="0" value={planDraft.yearlyPrice} onChange={(e) => setPlanDraft({ ...planDraft, yearlyPrice: Number(e.target.value) })} /></div>
                </div>
                <div className="space-y-2"><Label>وصف الباقة</Label><Input value={planDraft.descriptionAr || ""} onChange={(e) => setPlanDraft({ ...planDraft, descriptionAr: e.target.value })} /></div>

                <div>
                  <p className="mb-3 font-black text-slate-900">المزايا</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {query.data?.feature_catalog.map((feature) => (
                      <div key={feature.feature_key} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                        <div><p className="text-sm font-bold">{feature.name_ar}</p><p className="mt-1 text-xs text-slate-500">{feature.description_ar}</p></div>
                        <Switch checked={Boolean(planDraft.features[feature.feature_key])} onCheckedChange={(checked) => setPlanDraft({ ...planDraft, features: { ...planDraft.features, [feature.feature_key]: checked } })} />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-3 font-black text-slate-900">الحدود</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {query.data?.limit_catalog.map((limit) => (
                      <div key={limit.limit_key} className="space-y-2 rounded-xl border border-slate-200 p-3">
                        <Label>{limit.name_ar}</Label>
                        <Input type="number" min="0" placeholder="فارغ = غير محدود" value={planDraft.limits[limit.limit_key] ?? ""} onChange={(e) => setPlanDraft({ ...planDraft, limits: { ...planDraft.limits, [limit.limit_key]: e.target.value === "" ? null : Number(e.target.value) } })} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><div><p className="font-bold">الباقة متاحة للاشتراكات الجديدة</p><p className="text-xs text-slate-500">إيقافها لا يلغي الاشتراكات الحالية.</p></div><Switch checked={planDraft.isActive} onCheckedChange={(checked) => setPlanDraft({ ...planDraft, isActive: checked })} /></div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:justify-start">
              <Button className="bg-[#005931] hover:bg-[#004426]" onClick={() => planMutation.mutate()} disabled={planMutation.isPending || !planDraft?.nameAr.trim() || !planDraft?.code.trim()}>{planMutation.isPending ? "جاري الحفظ..." : "حفظ الباقة"}</Button>
              <Button variant="outline" onClick={() => setPlanEditorOpen(false)} disabled={planMutation.isPending}>إلغاء</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(subscriptionTenant)} onOpenChange={(open) => !open && !subscriptionMutation.isPending && setSubscriptionTenant(null)}>
          <DialogContent dir="rtl" className="sm:max-w-lg">
            <DialogHeader className="text-right">
              <DialogTitle>تغيير باقة العميل</DialogTitle>
              <DialogDescription className="text-right">{subscriptionTenant?.tenant_name} — سيتم إنهاء الاشتراك الحالي واستبداله بالاشتراك الجديد مع الاحتفاظ بالسجل.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>الباقة</Label>
                <select value={subscriptionPlanId} onChange={(e) => setSubscriptionPlanId(e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
                  <option value="">اختر الباقة</option>
                  {plans.filter((plan) => plan.is_active || plan.id === subscriptionTenant?.subscription?.plan_id).map((plan) => <option key={plan.id} value={plan.id}>{plan.name_ar} — {formatMoney(plan.monthly_price, plan.currency)}/شهر</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>دورة الفوترة</Label><select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as "monthly" | "yearly")} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="monthly">شهري</option><option value="yearly">سنوي</option></select></div>
                <div className="space-y-2"><Label>فترة السماح بالأيام</Label><Input type="number" min="0" value={graceDays} onChange={(e) => setGraceDays(Math.max(0, Number(e.target.value || 0)))} /></div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><div><p className="font-bold">إيقاف تلقائي بعد السماح</p><p className="text-xs text-slate-500">بعد انتهاء الاشتراك + Grace Period.</p></div><Switch checked={autoSuspend} onCheckedChange={setAutoSuspend} /></div>
              <div className="rounded-xl bg-blue-50 p-3 text-xs leading-6 text-blue-900"><CalendarClock className="ml-2 inline h-4 w-4" />إذا لم تحدد تواريخ يدويًا، النظام ينشئ شهرًا أو سنة كاملة من وقت التعيين ويضبط تاريخ التجديد تلقائيًا.</div>
            </div>
            <DialogFooter className="gap-2 sm:justify-start">
              <Button className="bg-[#005931] hover:bg-[#004426]" onClick={() => subscriptionMutation.mutate()} disabled={subscriptionMutation.isPending || !subscriptionPlanId}>{subscriptionMutation.isPending ? "جاري التحديث..." : "تأكيد الاشتراك"}</Button>
              <Button variant="outline" onClick={() => setSubscriptionTenant(null)} disabled={subscriptionMutation.isPending}>إلغاء</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
