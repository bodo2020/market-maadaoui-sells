import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, FileSignature, Network, Save, Store } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchBusinessStructure } from "@/services/supabase/branchControlService";
import { createFranchiseOperator } from "@/services/supabase/franchiseService";
import { toast } from "sonner";

const stepMeta = [
  { id: 1, title: "المشغل والكيان القانوني", icon: Building2 },
  { id: 2, title: "العقد والسياسات", icon: FileSignature },
  { id: 3, title: "أول فرع", icon: Store },
];

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <div className="space-y-2">
    <Label className="font-bold text-slate-700">{label}</Label>
    {children}
    {hint && <p className="text-[11px] leading-5 text-slate-400">{hint}</p>}
  </div>
);

export default function FranchiseOnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const businessQuery = useQuery({ queryKey: ["business-structure"], queryFn: () => fetchBusinessStructure(), staleTime: 30_000 });

  const [profile, setProfile] = useState({
    operator_name: "",
    operator_code: "",
    legal_entity_name: "",
    commercial_registration: "",
    tax_registration: "",
    contact_name: "",
    phone: "",
    email: "",
    territory_name: "",
    notes: "",
  });
  const [agreement, setAgreement] = useState({
    agreement_code: "",
    starts_on: new Date().toISOString().slice(0, 10),
    ends_on: "",
    royalty_rate: 0,
    marketing_fee_rate: 0,
    platform_fee_rate: 0,
    monthly_fixed_fee: 0,
    security_deposit: 0,
    settlement_cycle: "monthly",
    pricing_policy: "bounded",
    catalog_policy: "curated",
    supplier_policy: "approved_plus_local",
    promotion_policy: "approval_required",
    max_branches: 1,
    can_manage_inventory: true,
    can_view_analytics: true,
    max_discount_percentage: 10,
    requires_order_approval: false,
    notes: "",
  });
  const [branch, setBranch] = useState({
    name: "",
    code: "",
    address: "",
    phone: "",
    email: "",
    delivery_fee: 0,
    min_order_amount: 0,
    estimated_delivery_minutes: 45,
  });

  const missingForStep = useMemo(() => {
    if (step === 1) return !profile.operator_name.trim() || !profile.legal_entity_name.trim();
    if (step === 2) return !agreement.starts_on || agreement.max_branches < 1;
    return !branch.name.trim();
  }, [agreement.max_branches, agreement.starts_on, branch.name, profile.legal_entity_name, profile.operator_name, step]);

  const mutation = useMutation({
    mutationFn: async () => {
      const tenantId = businessQuery.data?.tenant.id;
      if (!tenantId) throw new Error("لم يتم تحديد الشركة الحالية.");
      return createFranchiseOperator({
        tenantId,
        profile: {
          ...profile,
          operator_code: profile.operator_code || undefined,
          commercial_registration: profile.commercial_registration || undefined,
          tax_registration: profile.tax_registration || undefined,
          contact_name: profile.contact_name || undefined,
          phone: profile.phone || undefined,
          email: profile.email || undefined,
          territory_name: profile.territory_name || undefined,
          notes: profile.notes || undefined,
        },
        agreement: {
          ...agreement,
          agreement_code: agreement.agreement_code || undefined,
          ends_on: agreement.ends_on || undefined,
          notes: agreement.notes || undefined,
        },
        branch: {
          ...branch,
          code: branch.code || undefined,
          address: branch.address || undefined,
          phone: branch.phone || undefined,
          email: branch.email || undefined,
        },
      });
    },
    onSuccess: async (result) => {
      toast.success("تم إنشاء ملف الـFranchise والعقد وأول فرع كمسودة آمنة");
      await queryClient.invalidateQueries({ queryKey: ["business-structure"] });
      navigate(`/franchise/${result.merchant_id}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر إنشاء الـFranchise"),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (missingForStep) return toast.error("أكمل البيانات المطلوبة قبل المتابعة.");
    if (step < 3) return setStep((current) => current + 1);
    mutation.mutate();
  };

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-6xl space-y-6 pb-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black text-[#005931]"><Network className="h-4 w-4" /> FRANCHISE ONBOARDING</div>
            <h1 className="mt-2 text-3xl font-black text-slate-950">إضافة Franchise جديد</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">إنشاء المشغل والعقد وأول فرع في عملية واحدة. الفرع يبدأ متوقفًا وكل قنواته مغلقة لحين اعتماد العقد وتفعيل الفرع.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/branches")}><ArrowRight className="ml-2 h-4 w-4" />العودة لمركز الفروع</Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {stepMeta.map(({ id, title, icon: Icon }) => (
            <div key={id} className={`rounded-2xl border p-4 transition ${step === id ? "border-[#005931] bg-emerald-50" : step > id ? "border-emerald-200 bg-white" : "border-slate-200 bg-white"}`}>
              <div className="flex items-center gap-3">
                <div className={`grid h-9 w-9 place-items-center rounded-xl ${step >= id ? "bg-[#005931] text-white" : "bg-slate-100 text-slate-400"}`}><Icon className="h-4 w-4" /></div>
                <div><p className="text-[10px] font-black text-slate-400">المرحلة {id}</p><p className="text-sm font-black text-slate-800">{title}</p></div>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={submit}>
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-xl font-black">{stepMeta[step - 1].title}</CardTitle>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">لن يتم فتح البيع تلقائيًا</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5 md:p-7">
              {step === 1 && (
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="اسم مشغل الـFranchise *"><Input value={profile.operator_name} onChange={(e) => setProfile({ ...profile, operator_name: e.target.value })} placeholder="مثال: شركة النيل للتجزئة" /></Field>
                  <Field label="كود المشغل" hint="اختياري، وسيتم توليده تلقائيًا لو تركته فارغًا."><Input dir="ltr" value={profile.operator_code} onChange={(e) => setProfile({ ...profile, operator_code: e.target.value })} placeholder="nile-franchise" /></Field>
                  <Field label="الاسم القانوني للكيان *"><Input value={profile.legal_entity_name} onChange={(e) => setProfile({ ...profile, legal_entity_name: e.target.value })} /></Field>
                  <Field label="السجل التجاري"><Input value={profile.commercial_registration} onChange={(e) => setProfile({ ...profile, commercial_registration: e.target.value })} /></Field>
                  <Field label="البطاقة / التسجيل الضريبي"><Input value={profile.tax_registration} onChange={(e) => setProfile({ ...profile, tax_registration: e.target.value })} /></Field>
                  <Field label="اسم المسؤول"><Input value={profile.contact_name} onChange={(e) => setProfile({ ...profile, contact_name: e.target.value })} /></Field>
                  <Field label="رقم الهاتف"><Input dir="ltr" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Field>
                  <Field label="البريد الإلكتروني"><Input dir="ltr" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></Field>
                  <Field label="الإقليم / منطقة الامتياز"><Input value={profile.territory_name} onChange={(e) => setProfile({ ...profile, territory_name: e.target.value })} placeholder="مثال: غرب القاهرة" /></Field>
                  <Field label="ملاحظات"><Input value={profile.notes} onChange={(e) => setProfile({ ...profile, notes: e.target.value })} /></Field>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-7">
                  <div className="grid gap-5 md:grid-cols-3">
                    <Field label="كود العقد"><Input dir="ltr" value={agreement.agreement_code} onChange={(e) => setAgreement({ ...agreement, agreement_code: e.target.value })} placeholder="يُولد تلقائيًا" /></Field>
                    <Field label="بداية العقد *"><Input type="date" value={agreement.starts_on} onChange={(e) => setAgreement({ ...agreement, starts_on: e.target.value })} /></Field>
                    <Field label="نهاية العقد"><Input type="date" value={agreement.ends_on} onChange={(e) => setAgreement({ ...agreement, ends_on: e.target.value })} /></Field>
                  </div>
                  <div>
                    <h3 className="mb-4 font-black text-slate-900">الرسوم والنسب</h3>
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
                      <Field label="Royalty %"><Input type="number" min="0" max="100" step="0.01" value={agreement.royalty_rate} onChange={(e) => setAgreement({ ...agreement, royalty_rate: Number(e.target.value) })} /></Field>
                      <Field label="Marketing %"><Input type="number" min="0" max="100" step="0.01" value={agreement.marketing_fee_rate} onChange={(e) => setAgreement({ ...agreement, marketing_fee_rate: Number(e.target.value) })} /></Field>
                      <Field label="Platform %"><Input type="number" min="0" max="100" step="0.01" value={agreement.platform_fee_rate} onChange={(e) => setAgreement({ ...agreement, platform_fee_rate: Number(e.target.value) })} /></Field>
                      <Field label="رسوم شهرية"><Input type="number" min="0" value={agreement.monthly_fixed_fee} onChange={(e) => setAgreement({ ...agreement, monthly_fixed_fee: Number(e.target.value) })} /></Field>
                      <Field label="تأمين / Deposit"><Input type="number" min="0" value={agreement.security_deposit} onChange={(e) => setAgreement({ ...agreement, security_deposit: Number(e.target.value) })} /></Field>
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-4 font-black text-slate-900">سياسات التشغيل</h3>
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                      <Field label="التسويات"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={agreement.settlement_cycle} onChange={(e) => setAgreement({ ...agreement, settlement_cycle: e.target.value })}><option value="weekly">أسبوعي</option><option value="biweekly">كل أسبوعين</option><option value="monthly">شهري</option></select></Field>
                      <Field label="سياسة الأسعار"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={agreement.pricing_policy} onChange={(e) => setAgreement({ ...agreement, pricing_policy: e.target.value })}><option value="central">مركزي</option><option value="bounded">حرية بحدود</option><option value="independent">مستقل</option></select></Field>
                      <Field label="سياسة الكتالوج"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={agreement.catalog_policy} onChange={(e) => setAgreement({ ...agreement, catalog_policy: e.target.value })}><option value="central">مركزي</option><option value="curated">معتمد مع مرونة</option><option value="independent">مستقل</option></select></Field>
                      <Field label="سياسة الموردين"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={agreement.supplier_policy} onChange={(e) => setAgreement({ ...agreement, supplier_policy: e.target.value })}><option value="approved_only">موردون معتمدون فقط</option><option value="approved_plus_local">معتمدون + محليون</option><option value="independent">مستقل</option></select></Field>
                      <Field label="سياسة العروض"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={agreement.promotion_policy} onChange={(e) => setAgreement({ ...agreement, promotion_policy: e.target.value })}><option value="central">مركزي</option><option value="approval_required">تحتاج موافقة</option><option value="independent">مستقل</option></select></Field>
                      <Field label="الحد الأقصى للفروع *"><Input type="number" min="1" value={agreement.max_branches} onChange={(e) => setAgreement({ ...agreement, max_branches: Math.max(1, Number(e.target.value)) })} /></Field>
                      <Field label="أقصى خصم %"><Input type="number" min="0" max="100" value={agreement.max_discount_percentage} onChange={(e) => setAgreement({ ...agreement, max_discount_percentage: Number(e.target.value) })} /></Field>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"><input type="checkbox" checked={agreement.can_manage_inventory} onChange={(e) => setAgreement({ ...agreement, can_manage_inventory: e.target.checked })} />إدارة المخزون</label>
                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"><input type="checkbox" checked={agreement.can_view_analytics} onChange={(e) => setAgreement({ ...agreement, can_view_analytics: e.target.checked })} />رؤية التحليلات</label>
                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"><input type="checkbox" checked={agreement.requires_order_approval} onChange={(e) => setAgreement({ ...agreement, requires_order_approval: e.target.checked })} />الطلبات تحتاج موافقة</label>
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><b>قاعدة أمان:</b> أول فرع سيُنشأ Inactive، وكل قنوات POS / Online / Customer / Marketplace / Delivery / Pickup ستبدأ OFF حتى اعتماد العقد ثم تفعيل الفرع يدويًا.</div>
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="اسم أول فرع *"><Input value={branch.name} onChange={(e) => setBranch({ ...branch, name: e.target.value })} /></Field>
                    <Field label="كود الفرع"><Input dir="ltr" value={branch.code} onChange={(e) => setBranch({ ...branch, code: e.target.value })} placeholder="يُولد تلقائيًا" /></Field>
                    <Field label="العنوان"><Input value={branch.address} onChange={(e) => setBranch({ ...branch, address: e.target.value })} /></Field>
                    <Field label="الهاتف"><Input dir="ltr" value={branch.phone} onChange={(e) => setBranch({ ...branch, phone: e.target.value })} /></Field>
                    <Field label="البريد"><Input dir="ltr" type="email" value={branch.email} onChange={(e) => setBranch({ ...branch, email: e.target.value })} /></Field>
                    <Field label="رسوم التوصيل"><Input type="number" min="0" value={branch.delivery_fee} onChange={(e) => setBranch({ ...branch, delivery_fee: Number(e.target.value) })} /></Field>
                    <Field label="الحد الأدنى للطلب"><Input type="number" min="0" value={branch.min_order_amount} onChange={(e) => setBranch({ ...branch, min_order_amount: Number(e.target.value) })} /></Field>
                    <Field label="زمن التوصيل المتوقع بالدقائق"><Input type="number" min="1" value={branch.estimated_delivery_minutes} onChange={(e) => setBranch({ ...branch, estimated_delivery_minutes: Number(e.target.value) })} /></Field>
                  </div>
                  <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-3">
                    <div><p className="text-xs font-bold text-slate-400">المشغل</p><p className="mt-1 font-black">{profile.operator_name || "—"}</p></div>
                    <div><p className="text-xs font-bold text-slate-400">العقد</p><p className="mt-1 font-black">{agreement.agreement_code || "سيُولد تلقائيًا"}</p></div>
                    <div><p className="text-xs font-bold text-slate-400">حد الفروع</p><p className="mt-1 font-black">{agreement.max_branches}</p></div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button type="button" variant="outline" disabled={step === 1 || mutation.isPending} onClick={() => setStep((current) => Math.max(1, current - 1))}><ArrowRight className="ml-2 h-4 w-4" />السابق</Button>
            <Button type="submit" disabled={mutation.isPending || businessQuery.isLoading} className="bg-[#005931] hover:bg-[#004a29]">
              {step < 3 ? <><ArrowLeft className="ml-2 h-4 w-4" />التالي</> : <><Save className="ml-2 h-4 w-4" />{mutation.isPending ? "جارٍ الإنشاء…" : "إنشاء Franchise كمسودة"}</>}
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
