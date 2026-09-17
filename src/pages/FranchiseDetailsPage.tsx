import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CircleDollarSign,
  FileSignature,
  History,
  Network,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Store,
  XCircle,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  createFranchiseBranch,
  fetchFranchiseDetail,
  FranchiseAgreementAction,
  FranchiseAgreementStatus,
  transitionFranchiseAgreement,
} from "@/services/supabase/franchiseService";
import { toast } from "sonner";

const statusLabels: Record<FranchiseAgreementStatus, string> = {
  draft: "مسودة",
  review: "تحت المراجعة",
  approved: "معتمد",
  active: "نشط",
  suspended: "موقوف",
  expired: "منتهي",
  terminated: "منهى",
};

const statusClasses: Record<FranchiseAgreementStatus, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  review: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-blue-200 bg-blue-50 text-blue-800",
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  suspended: "border-orange-200 bg-orange-50 text-orange-800",
  expired: "border-slate-300 bg-slate-100 text-slate-600",
  terminated: "border-red-200 bg-red-50 text-red-800",
};

const actionLabels: Record<FranchiseAgreementAction, string> = {
  submit_review: "إرسال للمراجعة",
  return_to_draft: "إرجاع لمسودة",
  approve: "اعتماد العقد",
  activate: "تفعيل المشغل",
  suspend: "إيقاف المشغل",
  resume: "استئناف المشغل",
  terminate: "إنهاء العقد",
  expire: "تسجيل انتهاء العقد",
};

const actionTone: Partial<Record<FranchiseAgreementAction, "default" | "destructive" | "outline">> = {
  suspend: "outline",
  terminate: "destructive",
  return_to_draft: "outline",
};

function allowedActions(status: FranchiseAgreementStatus): FranchiseAgreementAction[] {
  if (status === "draft") return ["submit_review"];
  if (status === "review") return ["return_to_draft", "approve"];
  if (status === "approved") return ["activate", "terminate"];
  if (status === "active") return ["suspend", "terminate"];
  if (status === "suspended") return ["resume", "terminate"];
  return [];
}

function Value({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><p className="text-[10px] font-black text-slate-400">{label}</p><div className="mt-1 text-sm font-black text-slate-800">{value ?? "—"}</div></div>;
}

function percent(value?: number | null) {
  return `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })}%`;
}

function money(value?: number | null, currency = "EGP") {
  return new Intl.NumberFormat("ar-EG", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0));
}

export default function FranchiseDetailsPage() {
  const { merchantId } = useParams<{ merchantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<FranchiseAgreementAction | null>(null);
  const [reason, setReason] = useState("");
  const [branchOpen, setBranchOpen] = useState(false);
  const [branch, setBranch] = useState({ name: "", code: "", address: "", phone: "", email: "" });

  const query = useQuery({
    queryKey: ["franchise-detail", merchantId],
    queryFn: () => fetchFranchiseDetail(merchantId!),
    enabled: !!merchantId,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const agreement = query.data?.current_agreement;
  const actions = useMemo(() => agreement ? allowedActions(agreement.status) : [], [agreement]);

  const transitionMutation = useMutation({
    mutationFn: ({ action, reason }: { action: FranchiseAgreementAction; reason?: string | null }) => transitionFranchiseAgreement(merchantId!, action, reason),
    onSuccess: async () => {
      toast.success("تم تحديث حالة عقد الـFranchise");
      setAction(null);
      setReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["franchise-detail", merchantId] }),
        queryClient.invalidateQueries({ queryKey: ["business-structure"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث العقد"),
  });

  const branchMutation = useMutation({
    mutationFn: () => createFranchiseBranch(merchantId!, {
      name: branch.name,
      code: branch.code || undefined,
      address: branch.address || undefined,
      phone: branch.phone || undefined,
      email: branch.email || undefined,
    }),
    onSuccess: async (result) => {
      toast.success("تم إنشاء الفرع كفرع متوقف وقنواته مغلقة");
      setBranchOpen(false);
      setBranch({ name: "", code: "", address: "", phone: "", email: "" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["franchise-detail", merchantId] }),
        queryClient.invalidateQueries({ queryKey: ["business-structure"] }),
      ]);
      navigate(`/branches/${result.branch_id}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر إضافة الفرع"),
  });

  const submitTransition = () => {
    if (!action) return;
    if ((action === "suspend" || action === "terminate") && !reason.trim()) return toast.error("سبب الإيقاف أو الإنهاء مطلوب.");
    transitionMutation.mutate({ action, reason: reason.trim() || null });
  };

  const submitBranch = (event: FormEvent) => {
    event.preventDefault();
    if (!branch.name.trim()) return toast.error("اسم الفرع مطلوب.");
    branchMutation.mutate();
  };

  if (query.isLoading) return <MainLayout><div className="grid min-h-[420px] place-items-center"><div className="text-center font-bold text-slate-500"><RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-[#005931]" />جارٍ تحميل Franchise 360…</div></div></MainLayout>;
  if (query.error || !query.data || !agreement) return <MainLayout><div className="rounded-2xl border border-red-200 bg-red-50 p-6 font-bold text-red-800">{query.error instanceof Error ? query.error.message : "تعذر تحميل بيانات الـFranchise"}</div></MainLayout>;

  const data = query.data;
  const profile = data.profile;
  const branchLimit = agreement.max_branches == null ? "غير محدود" : `${data.branches.length} / ${agreement.max_branches}`;

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6 pb-12">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <button type="button" onClick={() => navigate("/branches")} className="mb-3 inline-flex items-center gap-2 text-xs font-black text-[#005931]"><ArrowRight className="h-4 w-4" />مركز الفروع والشبكة</button>
            <div className="flex flex-wrap items-center gap-2"><Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">FRANCHISE 360</Badge><Badge variant="outline" className={statusClasses[agreement.status]}>{statusLabels[agreement.status]}</Badge></div>
            <h1 className="mt-3 text-3xl font-black text-slate-950">{data.merchant.name}</h1>
            <p className="mt-2 text-sm text-slate-500">{profile?.legal_entity_name} • {data.merchant.code} • {data.branches.length} فرع</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => query.refetch()}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
            {!(["terminated", "expired"] as string[]).includes(agreement.status) && <Button variant="outline" onClick={() => setBranchOpen(true)}><Plus className="ml-2 h-4 w-4" />إضافة فرع</Button>}
            {actions.map((item) => <Button key={item} variant={actionTone[item] || "default"} className={item === "approve" || item === "activate" || item === "resume" || item === "submit_review" ? "bg-[#005931] hover:bg-[#004a29]" : ""} onClick={() => { setAction(item); setReason(""); }}>{item === "activate" || item === "resume" ? <PlayCircle className="ml-2 h-4 w-4" /> : item === "suspend" ? <PauseCircle className="ml-2 h-4 w-4" /> : item === "terminate" ? <XCircle className="ml-2 h-4 w-4" /> : <ShieldCheck className="ml-2 h-4 w-4" />}{actionLabels[item]}</Button>)}
          </div>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Value label="حالة المشغل" value={data.merchant.status} />
          <Value label="كود العقد" value={agreement.agreement_code} />
          <Value label="مدة العقد" value={`${agreement.starts_on} → ${agreement.ends_on || "مفتوح"}`} />
          <Value label="الفروع / الحد" value={branchLimit} />
          <Value label="الإقليم" value={profile?.territory_name || "غير محدد"} />
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_1.4fr]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg font-black"><Building2 className="h-5 w-5 text-[#005931]" />الكيان القانوني</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Value label="الاسم القانوني" value={profile?.legal_entity_name} />
              <Value label="السجل التجاري" value={profile?.commercial_registration} />
              <Value label="التسجيل الضريبي" value={profile?.tax_registration} />
              <Value label="المسؤول" value={profile?.contact_name} />
              <Value label="الهاتف" value={profile?.phone} />
              <Value label="البريد" value={profile?.email} />
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg font-black"><CircleDollarSign className="h-5 w-5 text-[#005931]" />الشروط المالية</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Value label="Royalty" value={percent(agreement.royalty_rate)} />
              <Value label="Marketing Fee" value={percent(agreement.marketing_fee_rate)} />
              <Value label="Platform Fee" value={percent(agreement.platform_fee_rate)} />
              <Value label="Monthly Fee" value={money(agreement.monthly_fixed_fee, agreement.currency)} />
              <Value label="Security Deposit" value={money(agreement.security_deposit, agreement.currency)} />
              <Value label="Settlement" value={agreement.settlement_cycle} />
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg font-black"><FileSignature className="h-5 w-5 text-[#005931]" />سياسات الامتياز</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Value label="التسعير" value={agreement.pricing_policy} />
            <Value label="الكتالوج" value={agreement.catalog_policy} />
            <Value label="الموردون" value={agreement.supplier_policy} />
            <Value label="العروض" value={agreement.promotion_policy} />
            <Value label="أقصى خصم" value={percent(agreement.max_discount_percentage)} />
            <Value label="إدارة المخزون" value={agreement.can_manage_inventory ? "مسموح" : "غير مسموح"} />
            <Value label="التحليلات" value={agreement.can_view_analytics ? "مسموح" : "غير مسموح"} />
            <Value label="موافقة الطلبات" value={agreement.requires_order_approval ? "مطلوبة" : "غير مطلوبة"} />
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="flex items-center gap-2 text-lg font-black"><Network className="h-5 w-5 text-[#005931]" />فروع المشغل</CardTitle><span className="text-xs font-bold text-slate-400">تفعيل القنوات يتم من Branch 360</span></CardHeader>
          <CardContent className="space-y-2">
            {data.branches.map((item) => (
              <button key={item.id} type="button" onClick={() => navigate(`/branches/${item.id}`)} className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 text-right transition hover:border-emerald-200 hover:bg-emerald-50/40">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div><div className="flex flex-wrap items-center gap-2"><span className="font-black text-slate-900">{item.name}</span><Badge variant="outline" className={item.active ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-700"}>{item.active ? "نشط" : "متوقف"}</Badge><span className="text-[11px] font-bold text-slate-400">{item.code}</span></div><p className="mt-1 text-xs text-slate-500">{item.address || "لا يوجد عنوان"}</p></div>
                  <div className="flex flex-wrap gap-1.5">{Object.entries(item.channels || {}).map(([key, runtime]) => <span key={key} className={`rounded-full border px-2 py-1 text-[10px] font-black ${runtime.effective_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : runtime.configured_enabled ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-400"}`}>{key}</span>)}</div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg font-black"><History className="h-5 w-5 text-[#005931]" />سجل دورة العقد</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.events.length ? data.events.map((event) => <div key={event.id} className="flex flex-col gap-2 rounded-2xl border border-slate-100 p-4 md:flex-row md:items-center md:justify-between"><div><p className="font-black text-slate-800">{actionLabels[event.event_type as FranchiseAgreementAction] || event.event_type}</p><p className="mt-1 text-xs text-slate-500">{event.from_status || "—"} → {event.to_status || "—"}{event.reason ? ` • ${event.reason}` : ""}</p></div><div className="flex items-center gap-2 text-xs font-bold text-slate-400"><CalendarDays className="h-4 w-4" />{new Date(event.created_at).toLocaleString("ar-EG")}</div></div>) : <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">لا توجد أحداث مسجلة.</div>}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!action} onOpenChange={(open) => { if (!open) { setAction(null); setReason(""); } }}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>{action ? actionLabels[action] : "تحديث العقد"}</DialogTitle><DialogDescription>{action === "suspend" ? "سيتم إيقاف القنوات الفعلية لكل فروع المشغل بدون حذف إعداداتها، ويمكن استعادتها عند الاستئناف." : action === "terminate" ? "الإنهاء إجراء قوي: سيصبح المشغل Inactive وستتوقف الفروع وقنوات البيع." : "سيتم تطبيق الانتقال على العقد الحالي والمشغل."}</DialogDescription></DialogHeader>
          {(action === "suspend" || action === "terminate") && <div className="space-y-2"><Label>السبب *</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="اكتب سبب واضح للتدقيق والمراجعة" /></div>}
          <DialogFooter><Button variant="outline" onClick={() => setAction(null)}>إلغاء</Button><Button variant={action === "terminate" ? "destructive" : "default"} className={action !== "terminate" ? "bg-[#005931] hover:bg-[#004a29]" : ""} disabled={transitionMutation.isPending} onClick={submitTransition}>{transitionMutation.isPending ? "جارٍ التنفيذ…" : "تأكيد"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={branchOpen} onOpenChange={setBranchOpen}>
        <DialogContent dir="rtl">
          <form onSubmit={submitBranch}>
            <DialogHeader><DialogTitle>إضافة فرع Franchise</DialogTitle><DialogDescription>الفرع الجديد سيبدأ Inactive وكل قنواته OFF، وبعد الإنشاء سيتم فتح Branch 360 لإكمال التشغيل.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-5 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label>اسم الفرع *</Label><Input value={branch.name} onChange={(e) => setBranch({ ...branch, name: e.target.value })} /></div>
              <div className="space-y-2"><Label>كود الفرع</Label><Input dir="ltr" value={branch.code} onChange={(e) => setBranch({ ...branch, code: e.target.value })} /></div>
              <div className="space-y-2"><Label>الهاتف</Label><Input dir="ltr" value={branch.phone} onChange={(e) => setBranch({ ...branch, phone: e.target.value })} /></div>
              <div className="space-y-2 sm:col-span-2"><Label>العنوان</Label><Input value={branch.address} onChange={(e) => setBranch({ ...branch, address: e.target.value })} /></div>
              <div className="space-y-2 sm:col-span-2"><Label>البريد الإلكتروني</Label><Input dir="ltr" type="email" value={branch.email} onChange={(e) => setBranch({ ...branch, email: e.target.value })} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setBranchOpen(false)}>إلغاء</Button><Button type="submit" className="bg-[#005931] hover:bg-[#004a29]" disabled={branchMutation.isPending}><Plus className="ml-2 h-4 w-4" />{branchMutation.isPending ? "جارٍ الإضافة…" : "إنشاء الفرع"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
