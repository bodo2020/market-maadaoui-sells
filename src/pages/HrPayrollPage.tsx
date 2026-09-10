import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Banknote,
  Calculator,
  CheckCircle2,
  Clock3,
  Landmark,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  UserRoundCog,
  Vault,
  WalletCards,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import PayrollPayDayCard from "@/components/hr/PayrollPayDayCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useBranchStore } from "@/stores/branchStore";
import {
  addPayrollAdjustment,
  decideFinancePayroll,
  decideHrPayroll,
  generatePayrollRun,
  getPayrollWorkspace,
  saveCompensationProfile,
  submitPayrollForHrReview,
  type CompensationDirectoryItem,
  type PayrollItem,
  type PayrollStatus,
} from "@/services/hrPayrollService";
import {
  delegateHrPayrollPayment,
  fetchFinancePayoutSourcesV2,
  type FinancePayoutSourceV2,
} from "@/services/supabase/financeTreasuryV2Service";

const months = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const statusMeta: Record<PayrollStatus, { label: string; className: string }> = {
  draft: { label: "مسودة", className: "border-slate-200 bg-slate-50 text-slate-700" },
  hr_review: { label: "مراجعة HR", className: "border-blue-200 bg-blue-50 text-blue-800" },
  finance_review: { label: "مراجعة مالية", className: "border-violet-200 bg-violet-50 text-violet-800" },
  locked: { label: "معتمد ومقفل", className: "border-amber-200 bg-amber-50 text-amber-800" },
  paid: { label: "تم الصرف", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  cancelled: { label: "ملغي", className: "border-red-200 bg-red-50 text-red-700" },
};

const warningLabels: Record<string, string> = {
  COMPENSATION_MISSING: "الراتب الأساسي غير مسجل",
  SCHEDULE_MISSING_NO_ABSENCE_DEDUCTION: "لا يوجد جدول ورديات؛ لم يتم خصم غياب تلقائيًا",
};

const money = (value?: number | null) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const num = (value?: number | null) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
const minutes = (value?: number | null) => Number(value || 0).toLocaleString("ar-EG");
const sourceLabel = (source: FinancePayoutSourceV2) => source.source_kind === "branch_safe" ? "خزنة فرع" : source.source_kind === "pos_drawer" ? "درج POS" : "حساب بنكي";

export default function HrPayrollPage() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [compEmployee, setCompEmployee] = useState<CompensationDirectoryItem | null>(null);
  const [baseSalary, setBaseSalary] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(`${year}-${String(month).padStart(2, "0")}-01`);
  const [adjustItem, setAdjustItem] = useState<PayrollItem | null>(null);
  const [adjustType, setAdjustType] = useState<"earning" | "deduction">("earning");
  const [adjustCode, setAdjustCode] = useState("manual");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [decision, setDecision] = useState<{ stage: "hr" | "finance"; value: "approved" | "rejected" } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [paymentSourceId, setPaymentSourceId] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const query = useQuery({
    queryKey: ["hr-payroll-v2", currentBranchId, month, year],
    enabled: Boolean(currentBranchId),
    queryFn: () => getPayrollWorkspace(currentBranchId as string, month, year),
    refetchOnWindowFocus: true,
    retry: false,
  });

  const data = query.data;
  const run = data?.run;
  const items = data?.items || [];
  const compensation = data?.compensation?.items || [];
  const missingCompensation = useMemo(() => compensation.filter(item => !item.configured), [compensation]);
  const scheduleWarnings = useMemo(() => items.filter(item => !item.schedule_ready).length, [items]);

  const payoutSourcesQuery = useQuery({
    queryKey: ["finance-payout-sources-v2", currentBranchId, "payroll", run?.id],
    enabled: Boolean(currentBranchId && payOpen && run?.status === "locked" && !run?.payment_delegated_task_id),
    queryFn: () => fetchFinancePayoutSourcesV2(currentBranchId as string),
    staleTime: 10_000,
    retry: false,
  });
  const selectedPaySource = (payoutSourcesQuery.data || []).find(source => source.account_id === paymentSourceId);

  const refresh = async () => { await query.refetch(); };

  const saveCompMutation = useMutation({
    mutationFn: async () => {
      if (!currentBranchId || !compEmployee) throw new Error("بيانات الموظف غير مكتملة.");
      const amount = Number(baseSalary);
      if (!Number.isFinite(amount) || amount < 0) throw new Error("أدخل راتبًا أساسيًا صحيحًا.");
      return saveCompensationProfile(compEmployee.employee_id, currentBranchId, amount, effectiveFrom);
    },
    onSuccess: async () => {
      toast.success("تم حفظ الراتب الأساسي مع تاريخ السريان.");
      setCompEmployee(null);
      await refresh();
    },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر حفظ الراتب"),
  });

  const generateMutation = useMutation({
    mutationFn: () => generatePayrollRun(currentBranchId as string, month, year),
    onSuccess: async () => { toast.success("تم إنشاء/تحديث مسودة المسير من بيانات HR الحالية."); await refresh(); },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر حساب المسير"),
  });

  const submitMutation = useMutation({
    mutationFn: () => submitPayrollForHrReview(run!.id),
    onSuccess: async () => { toast.success("تم إرسال المسير لمراجعة الموارد البشرية."); await refresh(); },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر إرسال المسير"),
  });

  const adjustmentMutation = useMutation({
    mutationFn: async () => {
      if (!adjustItem) throw new Error("اختر الموظف.");
      const amount = Number(adjustAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("أدخل قيمة تسوية صحيحة.");
      if (adjustNote.trim().length < 3) throw new Error("اكتب سبب التسوية.");
      return addPayrollAdjustment(adjustItem.id, adjustType, adjustCode, amount, adjustNote.trim());
    },
    onSuccess: async () => {
      toast.success("تمت إضافة التسوية وإعادة حساب صافي الموظف.");
      setAdjustItem(null); setAdjustAmount(""); setAdjustNote("");
      await refresh();
    },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر إضافة التسوية"),
  });

  const decisionMutation = useMutation({
    mutationFn: async () => {
      if (!run || !decision) throw new Error("المسير غير جاهز.");
      if (decision.value === "rejected" && decisionNote.trim().length < 3) throw new Error("اكتب سبب الإرجاع.");
      return decision.stage === "hr"
        ? decideHrPayroll(run.id, decision.value, decisionNote.trim())
        : decideFinancePayroll(run.id, decision.value, decisionNote.trim());
    },
    onSuccess: async () => {
      toast.success(decision?.value === "approved" ? "تم اعتماد المرحلة بنجاح." : "تم إرجاع المسير إلى المسودة للمراجعة.");
      setDecision(null); setDecisionNote("");
      await refresh();
    },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر تسجيل القرار"),
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!run || run.status !== "locked") throw new Error("المسير غير جاهز للصرف.");
      if (run.payment_delegated_task_id) throw new Error("المسير مرسل بالفعل لمسؤول العهدة.");
      if (!selectedPaySource) throw new Error("اختر مصدر الصرف.");
      if (!selectedPaySource.assignable || !selectedPaySource.responsible_user_id) throw new Error("مصدر الصرف لا يوجد له مسؤول عهدة حالي.");
      if (Number(selectedPaySource.balance || 0) + 0.005 < Number(run.total_net || 0)) throw new Error("رصيد المصدر أقل من صافي المسير.");
      if (paymentReference.trim().length < 2) throw new Error("أدخل مرجع الصرف.");
      if (paymentNote.trim().length < 3) throw new Error("اكتب ملاحظة لمسؤول العهدة.");
      return delegateHrPayrollPayment({
        runId: run.id,
        sourceKind: selectedPaySource.source_kind,
        sourceAccountId: selectedPaySource.account_id,
        reference: paymentReference.trim(),
        note: paymentNote.trim(),
      });
    },
    onSuccess: async result => {
      toast.success(`تم إرسال مسير الرواتب إلى ${result.responsible_user_name}. لن يُخصم أي مبلغ قبل تأكيده الفعلي.`);
      setPayOpen(false); setPaymentSourceId(""); setPaymentReference(""); setPaymentNote("");
      await refresh();
    },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر إرسال المسير للصرف"),
  });

  const openComp = (employee: CompensationDirectoryItem) => {
    setCompEmployee(employee);
    setBaseSalary(employee.base_salary == null ? "" : String(employee.base_salary));
    setEffectiveFrom(employee.effective_from || `${year}-${String(month).padStart(2, "0")}-01`);
  };

  const openPay = () => {
    if (!run) return;
    setPaymentSourceId("");
    setPaymentReference(run.payment_reference || `PAYROLL-${run.year}-${String(run.month).padStart(2, "0")}`);
    setPaymentNote("");
    setPayOpen(true);
  };

  if (query.isLoading) return <MainLayout><div className="flex min-h-[480px] items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-[#005931]" /></div></MainLayout>;

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-[1500px] space-y-5 py-5">
        <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2"><Banknote className="h-7 w-7 text-[#005931]" /><h1 className="text-2xl font-black">مسير الرواتب</h1></div>
              <p className="mt-2 text-sm text-muted-foreground">{currentBranchName || "الفرع الحالي"} · الراتب والحضور والإجازات والسلف والتسويات، ثم HR → Finance → Lock → عهدة الصرف → Paid.</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-36"><Label className="mb-1 block text-xs">الشهر</Label><Select value={String(month)} onValueChange={v => setMonth(Number(v))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{months.map((label, i) => <SelectItem key={label} value={String(i + 1)}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div className="w-28"><Label className="mb-1 block text-xs">السنة</Label><Input type="number" min="2020" max="2200" value={year} onChange={e => setYear(Number(e.target.value) || now.getFullYear())} /></div>
              <Button variant="outline" onClick={refresh} disabled={query.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
            </div>
          </div>
        </section>

        {currentBranchId && data && <PayrollPayDayCard branchId={currentBranchId} value={data.policy?.pay_day_of_month} onSaved={refresh} />}

        {query.isError ? <Card className="border-red-200 bg-red-50"><CardContent className="p-6 text-red-800">{query.error instanceof Error ? query.error.message : "تعذر تحميل مسير الرواتب."}</CardContent></Card> : (
          <Tabs defaultValue="payroll" dir="rtl">
            <TabsList className="h-auto flex-wrap rounded-2xl p-1.5"><TabsTrigger value="payroll">المسير</TabsTrigger><TabsTrigger value="compensation">إعداد رواتب الموظفين ({missingCompensation.length.toLocaleString("ar-EG")} ناقص)</TabsTrigger></TabsList>

            <TabsContent value="payroll" className="mt-5 space-y-5">
              {!run ? (
                <Card className="border-dashed"><CardContent className="flex flex-col gap-4 p-7 md:flex-row md:items-center md:justify-between"><div><h2 className="font-black">لا يوجد مسير لـ{months[month - 1]} {year}</h2><p className="mt-1 text-sm text-muted-foreground">أنشئ مسودة ليتم أخذ Snapshot من بيانات الموظفين والحضور والإجازات والسلف الحالية.</p></div><Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}><Calculator className="ml-2 h-4 w-4" />إنشاء المسير</Button></CardContent></Card>
              ) : (
                <>
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black">مسير {months[run.month - 1]} {run.year}</h2><Badge variant="outline" className={statusMeta[run.status].className}>{statusMeta[run.status].label}</Badge>{run.status === "locked" && run.payment_delegated_task_id && <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">بانتظار مسؤول العهدة</Badge>}</div>
                          <p className="mt-1 text-xs text-muted-foreground">الفترة: {run.period_start} ← {run.period_end}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {run.status === "draft" && <Button variant="outline" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}><Calculator className="ml-2 h-4 w-4" />إعادة الحساب</Button>}
                          {run.status === "draft" && <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending || missingCompensation.length > 0}><Send className="ml-2 h-4 w-4" />إرسال لـHR</Button>}
                          {run.status === "hr_review" && <><Button variant="destructive" onClick={() => setDecision({ stage: "hr", value: "rejected" })}>إرجاع للمراجعة</Button><Button onClick={() => setDecision({ stage: "hr", value: "approved" })}><ShieldCheck className="ml-2 h-4 w-4" />اعتماد HR</Button></>}
                          {run.status === "finance_review" && <><Button variant="destructive" onClick={() => setDecision({ stage: "finance", value: "rejected" })}>إرجاع للمراجعة</Button><Button onClick={() => setDecision({ stage: "finance", value: "approved" })}><LockKeyhole className="ml-2 h-4 w-4" />اعتماد وقفل مالي</Button></>}
                          {run.status === "locked" && !run.payment_delegated_task_id && <Button onClick={openPay}><WalletCards className="ml-2 h-4 w-4" />إرسال للصرف</Button>}
                          {run.status === "locked" && run.payment_delegated_task_id && <Button variant="outline" disabled><Clock3 className="ml-2 h-4 w-4" />بانتظار تأكيد العهدة</Button>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {run.status === "locked" && run.payment_delegated_task_id && <Card className="border-blue-200 bg-blue-50"><CardContent className="p-5"><div className="flex items-center gap-2 font-black text-blue-900"><Vault className="h-5 w-5" />تم إسناد صرف المسير</div><p className="mt-1 text-sm text-blue-800">المصدر: <strong>{run.payment_account_name_snapshot || "مصدر العهدة المحدد"}</strong> · المرجع: {run.payment_reference || "—"}. لم يتم خصم المبلغ بعد؛ يتحول المسير إلى Paid فقط بعد تأكيد مسؤول العهدة.</p></CardContent></Card>}

                  {missingCompensation.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><div className="flex items-center gap-2 font-black"><AlertTriangle className="h-5 w-5" />المسير غير جاهز للمراجعة</div><p className="mt-1">يوجد {missingCompensation.length.toLocaleString("ar-EG")} موظف بدون راتب أساسي. أدخل الرواتب من تبويب إعداد رواتب الموظفين ثم أعد الحساب.</p></div>}
                  {scheduleWarnings > 0 && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><div className="flex items-center gap-2 font-black"><Clock3 className="h-5 w-5" />حماية من خصم غياب خاطئ</div><p className="mt-1">{scheduleWarnings.toLocaleString("ar-EG")} موظف ليس لديه جدول ورديات صالح للفترة؛ النظام لم يطبق عليهم خصم غياب تلقائيًا.</p></div>}

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Metric title="إجمالي الأساسي" value={money(run.total_base)} />
                    <Metric title="إضافات" value={money(run.total_earnings)} />
                    <Metric title="خصومات" value={money(run.total_deductions)} />
                    <Metric title="صافي المسير" value={money(run.total_net)} strong />
                  </div>

                  <div className="space-y-3">
                    {items.map(item => <PayrollEmployeeCard key={item.id} item={item} editable={run.status === "draft"} onAdjustment={() => setAdjustItem(item)} />)}
                  </div>

                  {run.status === "paid" && <Card className="border-emerald-200 bg-emerald-50"><CardContent className="p-5"><div className="flex items-center gap-2 font-black text-emerald-900"><CheckCircle2 className="h-5 w-5" />تم صرف المسير وتسجيل الحركة المالية</div><p className="mt-1 text-sm text-emerald-800">المصدر: {run.payment_account_name_snapshot || "—"} · مرجع الصرف: {run.payment_reference || "—"} · تم تثبيت الرواتب وتحديث أقساط السلف المستحقة.</p></CardContent></Card>}
                </>
              )}
            </TabsContent>

            <TabsContent value="compensation" className="mt-5 space-y-3">
              <Card><CardHeader><CardTitle>الراتب الأساسي</CardTitle><CardDescription>يُحفظ بتاريخ سريان، والمسيرات القديمة تعتمد Snapshot فلا تتغير لو عُدّل راتب الموظف لاحقًا.</CardDescription></CardHeader></Card>
              {compensation.map(employee => <Card key={employee.employee_id}><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-black">{employee.employee_name}</span><Badge variant="outline">{employee.employee_code || "بدون كود"}</Badge>{employee.configured ? <Badge className="bg-emerald-700">مُعد</Badge> : <Badge variant="destructive">الراتب ناقص</Badge>}</div><div className="mt-2 text-sm text-muted-foreground">{employee.configured ? `${money(employee.base_salary)} · ساري من ${employee.effective_from}` : "لا يوجد راتب أساسي فعال لهذا الفرع."}</div></div><Button variant="outline" onClick={() => openComp(employee)}><UserRoundCog className="ml-2 h-4 w-4" />{employee.configured ? "تعديل الراتب" : "إعداد الراتب"}</Button></CardContent></Card>)}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <Dialog open={Boolean(compEmployee)} onOpenChange={open => !open && setCompEmployee(null)}>
        <DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>إعداد راتب {compEmployee?.employee_name}</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>الراتب الأساسي الشهري</Label><Input type="number" min="0" step="0.01" value={baseSalary} onChange={e => setBaseSalary(e.target.value)} /></div><div><Label>تاريخ السريان</Label><Input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} /></div><div className="rounded-xl bg-slate-50 p-3 text-xs text-muted-foreground">تعديل الراتب لا يغير أي مسير سبق قفله؛ كل مسير يحتفظ بقيمته التاريخية.</div></div><DialogFooter><Button variant="outline" onClick={() => setCompEmployee(null)}>إلغاء</Button><Button onClick={() => saveCompMutation.mutate()} disabled={saveCompMutation.isPending}>{saveCompMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(adjustItem)} onOpenChange={open => !open && setAdjustItem(null)}>
        <DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>تسوية يدوية · {adjustItem?.employee_name}</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>النوع</Label><Select value={adjustType} onValueChange={v => setAdjustType(v as "earning" | "deduction")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="earning">إضافة</SelectItem><SelectItem value="deduction">خصم</SelectItem></SelectContent></Select></div><div><Label>كود/نوع التسوية</Label><Input value={adjustCode} onChange={e => setAdjustCode(e.target.value)} placeholder="مثال: bonus أو penalty" /></div><div><Label>القيمة</Label><Input type="number" min="0.01" step="0.01" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} /></div><div><Label>السبب</Label><Textarea value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="سبب واضح وقابل للمراجعة..." /></div></div><DialogFooter><Button variant="outline" onClick={() => setAdjustItem(null)}>إلغاء</Button><Button onClick={() => adjustmentMutation.mutate()} disabled={adjustmentMutation.isPending}><Plus className="ml-2 h-4 w-4" />إضافة وإعادة الحساب</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(decision)} onOpenChange={open => !open && setDecision(null)}>
        <DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>{decision?.stage === "hr" ? "قرار مراجعة الموارد البشرية" : "قرار المراجعة المالية"}</DialogTitle></DialogHeader><div className="space-y-3"><div className={`rounded-xl p-3 text-sm ${decision?.value === "approved" ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>{decision?.value === "approved" ? (decision.stage === "finance" ? "الاعتماد المالي سيقفل المسير ويمنع إعادة الحساب." : "اعتماد HR سيرسل المسير للمراجعة المالية.") : "رفض المرحلة سيعيد المسير إلى Draft للتصحيح وإعادة الحساب."}</div><div><Label>{decision?.value === "rejected" ? "سبب الإرجاع" : "ملاحظة (اختياري)"}</Label><Textarea value={decisionNote} onChange={e => setDecisionNote(e.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setDecision(null)}>إلغاء</Button><Button variant={decision?.value === "rejected" ? "destructive" : "default"} onClick={() => decisionMutation.mutate()} disabled={decisionMutation.isPending}>{decisionMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}{decision?.value === "approved" ? "اعتماد" : "إرجاع للمسودة"}</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={payOpen} onOpenChange={open => { if (!payMutation.isPending) setPayOpen(open); }}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader><DialogTitle>إرسال مسير الرواتب للصرف</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center justify-between gap-3"><div><div className="font-black text-emerald-950">صافي المسير</div><div className="mt-1 text-xs text-emerald-800">{run ? `${months[run.month - 1]} ${run.year}` : ""}</div></div><div className="text-2xl font-black text-emerald-950">{money(run?.total_net)}</div></div></div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>اختيار المصدر لا يخصم الفلوس.</strong> سيتم إنشاء مهمة لمسؤول الخزنة/الحساب، وفقط عند تأكيده بعد التسليم أو التحويل يتم إنشاء القيد المالي وتحويل المسير إلى Paid.</div>
            <div className="space-y-2">
              <Label>مصدر صرف الرواتب</Label>
              <Select value={paymentSourceId} onValueChange={setPaymentSourceId} disabled={payoutSourcesQuery.isLoading || payMutation.isPending}>
                <SelectTrigger><SelectValue placeholder={payoutSourcesQuery.isLoading ? "جاري تحميل الخزن والحسابات..." : "اختر خزنة / درج POS / بنك"} /></SelectTrigger>
                <SelectContent>{(payoutSourcesQuery.data || []).map(source => <SelectItem key={source.account_id} value={source.account_id} disabled={!source.assignable || Number(source.balance || 0) + 0.005 < Number(run?.total_net || 0)}>{source.name} · {sourceLabel(source)} · {money(source.balance)} · {source.responsible_user_name || "بدون مسؤول"}</SelectItem>)}</SelectContent>
              </Select>
              {payoutSourcesQuery.isError && <div className="rounded-xl bg-red-50 p-3 text-xs text-red-800">{payoutSourcesQuery.error instanceof Error ? payoutSourcesQuery.error.message : "تعذر تحميل مصادر الصرف."}</div>}
              {selectedPaySource && <div className="grid gap-2 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-3"><div><span className="block text-xs text-muted-foreground">النوع</span><strong>{sourceLabel(selectedPaySource)}</strong></div><div><span className="block text-xs text-muted-foreground">المسؤول</span><strong>{selectedPaySource.responsible_user_name || "غير محدد"}</strong></div><div><span className="block text-xs text-muted-foreground">الرصيد الحالي</span><strong className={Number(selectedPaySource.balance || 0) + 0.005 >= Number(run?.total_net || 0) ? "text-emerald-700" : "text-red-700"}>{money(selectedPaySource.balance)}</strong></div>{selectedPaySource.source_kind === "pos_drawer" && <div className="sm:col-span-3 text-xs text-amber-700">مسؤول درج POS هو صاحب الوردية المفتوحة حاليًا؛ لو انتهت ورديته قبل التأكيد سيُرفض الخصم تلقائيًا.</div>}</div>}
            </div>
            <div className="space-y-2"><Label>مرجع الصرف</Label><Input value={paymentReference} onChange={e => setPaymentReference(e.target.value)} placeholder="مثال: PAYROLL-2026-09 / رقم التحويل" disabled={payMutation.isPending} /></div>
            <div className="space-y-2"><Label>ملاحظة لمسؤول العهدة</Label><Textarea rows={4} value={paymentNote} onChange={e => setPaymentNote(e.target.value)} placeholder="طريقة التسليم أو التحويل والتعليمات التي يجب مراجعتها قبل التأكيد..." disabled={payMutation.isPending} /></div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start"><Button variant="outline" onClick={() => setPayOpen(false)} disabled={payMutation.isPending}>إلغاء</Button><Button onClick={() => payMutation.mutate()} disabled={payMutation.isPending || !selectedPaySource || !selectedPaySource.assignable || Number(selectedPaySource.balance || 0) + 0.005 < Number(run?.total_net || 0) || paymentReference.trim().length < 2 || paymentNote.trim().length < 3}>{payMutation.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : selectedPaySource?.source_kind === "bank" ? <Landmark className="ml-2 h-4 w-4" /> : <Vault className="ml-2 h-4 w-4" />}إرسال لمسؤول العهدة</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

function Metric({ title, value, strong = false }: { title: string; value: string; strong?: boolean }) {
  return <Card className={strong ? "border-emerald-200 bg-emerald-50" : ""}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{title}</div><div className={`mt-1 text-xl font-black ${strong ? "text-emerald-900" : ""}`}>{value}</div></CardContent></Card>;
}

function PayrollEmployeeCard({ item, editable, onAdjustment }: { item: PayrollItem; editable: boolean; onAdjustment: () => void }) {
  return <Card><CardContent className="p-4 md:p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{item.employee_name}</h3><Badge variant="outline">{item.employee_code || "بدون كود"}</Badge>{!item.schedule_ready && <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">بدون جدول ورديات</Badge>}</div>{item.warnings?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{item.warnings.map(w => <Badge key={w} variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">{warningLabels[w] || w}</Badge>)}</div>}<div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"><Mini label="الأساسي" value={money(item.base_salary)} /><Mini label="حضور" value={`${num(item.attended_days)} يوم`} /><Mini label="إجازة مدفوعة" value={`${num(item.paid_leave_days)} يوم`} /><Mini label="إجازة غير مدفوعة" value={`${num(item.unpaid_leave_days)} يوم`} /><Mini label="غياب" value={`${num(item.absent_days)} يوم`} /><Mini label="تأخير" value={`${minutes(item.late_minutes)} د`} /><Mini label="سلفة" value={money(item.advance_deduction)} /></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6"><Mini label="خصم غياب" value={money(item.absence_deduction)} /><Mini label="خصم إجازة" value={money(item.unpaid_leave_deduction)} /><Mini label="خصم تأخير" value={money(item.late_deduction + item.early_deduction)} /><Mini label="إضافي" value={money(item.overtime_amount)} /><Mini label="تسويات" value={`${money(item.manual_earnings)} / -${money(item.manual_deductions)}`} /><Mini label="إجمالي الخصم" value={money(item.total_deductions)} /></div></div><div className="min-w-44 rounded-2xl bg-emerald-50 p-4 text-center"><div className="text-xs text-emerald-800">صافي المستحق</div><div className="mt-1 text-2xl font-black text-emerald-950">{money(item.net_amount)}</div>{editable && <Button size="sm" variant="outline" className="mt-3 bg-white" onClick={onAdjustment}><Plus className="ml-1 h-4 w-4" />تسوية</Button>}</div></div></CardContent></Card>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-2.5"><div className="text-[11px] text-muted-foreground">{label}</div><div className="mt-1 text-sm font-bold">{value}</div></div>;
}
