import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, MonitorCog, Power, RefreshCw, ShieldAlert, ShoppingCart, Smartphone, Truck } from "lucide-react";
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
  fetchSaaSControlCenter,
  SaaSTenantControl,
  TenantPlatformControlPatch,
  updateTenantPlatformControls,
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
  icon: React.ElementType;
}> = [
  { key: "app_access_enabled", patchKey: "appAccessEnabled", label: "تشغيل النظام بالكامل", description: "Kill Switch أعلى من كل التطبيقات والخدمات.", icon: Power },
  { key: "online_sales_enabled", patchKey: "onlineSalesEnabled", label: "البيع أونلاين", description: "يمنع إنشاء طلبات Online وMarketplace.", icon: ShoppingCart },
  { key: "pos_enabled", patchKey: "posEnabled", label: "نقطة البيع POS", description: "يفتح أو يغلق واجهة الـPOS لهذا العميل.", icon: MonitorCog },
  { key: "admin_enabled", patchKey: "adminEnabled", label: "لوحة الإدارة", description: "المنتجات والمخزون والمالية والإدارة.", icon: Building2 },
  { key: "customer_app_enabled", patchKey: "customerAppEnabled", label: "تطبيق العميل", description: "إتاحة تطبيق التسوق الخاص بالعميل.", icon: Smartphone },
  { key: "delivery_enabled", patchKey: "deliveryEnabled", label: "تطبيق التوصيل", description: "إتاحة تشغيل المندوبين والتوصيل.", icon: Truck },
];

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

function statusBadge(tenant: SaaSTenantControl) {
  if (!tenant.app_access_enabled) return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">موقوف من المنصة</Badge>;
  if (tenant.tenant_status !== "active") return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">{tenant.tenant_status}</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">نشط</Badge>;
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

  const mutation = useMutation({
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
      await queryClient.invalidateQueries({ queryKey: ["saas-control-center"] });
      await queryClient.invalidateQueries({ queryKey: ["tenant-runtime-control"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث حالة الخدمة"),
  });

  const tenants = useMemo(() => query.data?.tenants || [], [query.data?.tenants]);

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

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6 pb-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black text-slate-950">SaaS Control Center</h1>
              <Badge className="bg-slate-950 hover:bg-slate-950">Platform Super Admin</Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">تحكم مركزي في تشغيل كل عميل SaaS. إيقاف المنصة هنا يتغلب على إعدادات المحل نفسه ولا يستطيع Tenant Admin تجاوزه.</p>
          </div>
          <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث
          </Button>
        </div>

        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">الـKill Switch أمر Platform</p>
            <p className="mt-1 text-sm leading-6 text-amber-800">إيقاف النظام بالكامل يعطل POS والإدارة وتطبيق العميل والتوصيل مهما كانت مفاتيحهم الفرعية. Super Admin فقط يستطيع تغيير هذه القيم.</p>
          </div>
        </div>

        {query.isLoading && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}</div>}
        {query.isError && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-800">{query.error instanceof Error ? query.error.message : "تعذر تحميل منصة SaaS"}</div>}

        {query.data && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Summary label="عملاء SaaS" value={query.data.summary.tenant_count} note="كل الشركات المسجلة على منصة التحكم." />
              <Summary label="أنظمة تعمل" value={query.data.summary.active_tenant_count} note="Tenant status + Platform Kill Switch يسمحان بالتشغيل." />
              <Summary label="أنظمة موقوفة" value={query.data.summary.suspended_tenant_count} note="موقوفة إما بحالة الشركة أو من منصة التحكم." />
              <Summary label="البيع أونلاين يعمل" value={query.data.summary.online_sales_enabled_count} note="عملاء يسمح لهم بإنشاء طلبات أونلاين حاليًا." />
            </section>

            <section className="space-y-4">
              {tenants.map((tenant) => (
                <Card key={tenant.tenant_id} className="overflow-hidden border-slate-200 bg-white">
                  <CardContent className="p-0">
                    <div className="flex flex-col gap-4 border-b border-slate-100 p-5 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-black text-slate-950">{tenant.tenant_name}</h2>
                          {statusBadge(tenant)}
                          <Badge variant="outline">{tenant.subdomain}</Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                          <span>{tenant.branch_count} فرع</span>
                          <span>{tenant.user_count} مستخدم نشط</span>
                          <span>الاشتراك: {tenant.subscription_status}</span>
                          {tenant.latest_subscription?.plan_name && <span>الخطة: {tenant.latest_subscription.plan_name}</span>}
                          <span>Revision #{tenant.revision}</span>
                        </div>
                        {tenant.block_reason && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">سبب آخر إيقاف: {tenant.block_reason}</p>}
                      </div>
                    </div>

                    <div className="grid gap-px bg-slate-100 md:grid-cols-2 xl:grid-cols-3">
                      {controlDefinitions.map((definition) => {
                        const Icon = definition.icon;
                        const checked = Boolean(tenant[definition.key]);
                        const globalBlocked = definition.key !== "app_access_enabled" && !tenant.app_access_enabled;
                        return (
                          <div key={definition.key} className="flex items-center gap-4 bg-white p-4">
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${checked ? "bg-emerald-50 text-[#005931]" : "bg-red-50 text-red-700"}`}><Icon className="h-5 w-5" /></span>
                            <div className="min-w-0 flex-1">
                              <p className="font-black text-slate-900">{definition.label}</p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">{globalBlocked ? "موقوف بسبب Kill Switch الرئيسي" : definition.description}</p>
                            </div>
                            <Switch
                              checked={checked}
                              disabled={mutation.isPending || globalBlocked}
                              onCheckedChange={(value) => requestToggle(tenant, definition, value)}
                              aria-label={`${definition.label} - ${tenant.tenant_name}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!tenants.length && <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">لا يوجد عملاء SaaS حتى الآن.</div>}
            </section>
          </>
        )}

        <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && !mutation.isPending && setPending(null)}>
          <DialogContent dir="rtl" className="sm:max-w-lg">
            <DialogHeader className="text-right">
              <DialogTitle>{pending?.nextValue ? "تأكيد تشغيل الخدمة" : "تأكيد إيقاف الخدمة"}</DialogTitle>
              <DialogDescription className="text-right leading-6">
                {pending ? `${pending.tenant.tenant_name} — ${pending.label}` : ""}
              </DialogDescription>
            </DialogHeader>

            {!pending?.nextValue && (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>نوع الإيقاف</Label>
                  <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value as typeof reasonCode)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400">
                    <option value="manual">يدوي</option>
                    <option value="billing">تحصيل / اشتراك</option>
                    <option value="maintenance">صيانة</option>
                    <option value="security">أمان</option>
                    <option value="policy">سياسة استخدام</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>
                <div className="space-y-2"><Label>سبب الإيقاف</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="سبب واضح يسجل في Audit Log" /></div>
                <div className="space-y-2"><Label>الرسالة التي تظهر للمحل</Label><Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="الخدمة متوقفة مؤقتًا..." /></div>
              </div>
            )}

            {pending?.nextValue && <div className="rounded-2xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">سيتم إعادة إتاحة هذه الخدمة فورًا. إذا كان الـKill Switch الرئيسي ما زال مغلقًا فلن تعمل الخدمات الفرعية حتى إعادة تشغيله.</div>}

            <DialogFooter className="gap-2 sm:justify-start">
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || (!pending?.nextValue && !reason.trim())} className={pending?.nextValue ? "bg-[#005931] hover:bg-[#004426]" : "bg-red-700 hover:bg-red-800"}>{mutation.isPending ? "جاري التنفيذ..." : pending?.nextValue ? "تشغيل" : "إيقاف"}</Button>
              <Button variant="outline" onClick={() => setPending(null)} disabled={mutation.isPending}>إلغاء</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
