import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CalendarCheck2, Clock3, Loader2, Pencil, Plus, RefreshCw, Users } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBranchStore } from "@/stores/branchStore";
import {
  getHrShiftScheduler,
  saveHrShiftAssignment,
  saveHrShiftTemplate,
  type HrShiftAssignment,
  type HrShiftEmployee,
  type HrShiftTemplate,
} from "@/services/hrShiftSchedulingService";

const weekdayMeta = [
  { value: 6, label: "السبت" },
  { value: 0, label: "الأحد" },
  { value: 1, label: "الاثنين" },
  { value: 2, label: "الثلاثاء" },
  { value: 3, label: "الأربعاء" },
  { value: 4, label: "الخميس" },
  { value: 5, label: "الجمعة" },
];

const weekdayLabel = (days: number[]) => weekdayMeta.filter(day => days.includes(day.value)).map(day => day.label).join("، ");
const shortTime = (value?: string | null) => value ? value.slice(0, 5) : "—";

export default function HrShiftSchedulingPage() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [templateDialog, setTemplateDialog] = useState<HrShiftTemplate | "new" | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [lateGrace, setLateGrace] = useState("10");
  const [earlyGrace, setEarlyGrace] = useState("5");
  const [templateActive, setTemplateActive] = useState(true);

  const [assignmentDialog, setAssignmentDialog] = useState<{ employee: HrShiftEmployee; assignment?: HrShiftAssignment | null } | null>(null);
  const [shiftTemplateId, setShiftTemplateId] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([6, 0, 1, 2, 3, 4]);
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState("");
  const [assignmentActive, setAssignmentActive] = useState(true);

  const query = useQuery({
    queryKey: ["hr-shift-scheduler-v1", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => getHrShiftScheduler(currentBranchId as string),
    refetchOnWindowFocus: true,
    retry: false,
  });

  const data = query.data;
  const templates = data?.templates || [];
  const assignments = data?.assignments || [];
  const employees = data?.employees || [];
  const activeTemplates = useMemo(() => templates.filter(item => item.active), [templates]);
  const activeAssignments = useMemo(() => assignments.filter(item => item.active && item.template_active && (!item.effective_to || item.effective_to >= new Date().toISOString().slice(0, 10))), [assignments]);
  const scheduledEmployees = useMemo(() => employees.filter(item => item.active_assignment_count > 0).length, [employees]);
  const unscheduledEmployees = Math.max(employees.length - scheduledEmployees, 0);

  const templateMutation = useMutation({
    mutationFn: async () => {
      if (!currentBranchId) throw new Error("اختر الفرع أولًا.");
      if (templateName.trim().length < 2) throw new Error("اكتب اسم الوردية.");
      return saveHrShiftTemplate({
        branchId: currentBranchId,
        templateId: templateDialog && templateDialog !== "new" ? templateDialog.id : null,
        nameAr: templateName,
        startTime,
        endTime,
        breakMinutes: Number(breakMinutes) || 0,
        lateGraceMinutes: Number(lateGrace) || 0,
        earlyDepartureGraceMinutes: Number(earlyGrace) || 0,
        active: templateActive,
      });
    },
    onSuccess: async () => { toast.success("تم حفظ قالب الوردية."); setTemplateDialog(null); await query.refetch(); },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر حفظ الوردية"),
  });

  const assignmentMutation = useMutation({
    mutationFn: async () => {
      if (!currentBranchId || !assignmentDialog) throw new Error("بيانات الإسناد غير مكتملة.");
      if (!shiftTemplateId) throw new Error("اختر قالب الوردية.");
      if (!weekdays.length) throw new Error("اختر يوم عمل واحدًا على الأقل.");
      return saveHrShiftAssignment({
        branchId: currentBranchId,
        assignmentId: assignmentDialog.assignment?.id || null,
        employeeId: assignmentDialog.employee.employee_id,
        shiftTemplateId,
        weekdays,
        effectiveFrom,
        effectiveTo: effectiveTo || null,
        active: assignmentActive,
      });
    },
    onSuccess: async () => { toast.success("تم حفظ جدول الموظف. سيستخدمه الحضور ومسير الرواتب من تاريخ السريان."); setAssignmentDialog(null); await query.refetch(); },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر حفظ إسناد الوردية"),
  });

  const openNewTemplate = () => {
    setTemplateDialog("new"); setTemplateName(""); setStartTime("09:00"); setEndTime("17:00"); setBreakMinutes("0"); setLateGrace("10"); setEarlyGrace("5"); setTemplateActive(true);
  };

  const openTemplate = (template: HrShiftTemplate) => {
    setTemplateDialog(template); setTemplateName(template.name_ar); setStartTime(shortTime(template.start_time)); setEndTime(shortTime(template.end_time)); setBreakMinutes(String(template.break_minutes)); setLateGrace(String(template.late_grace_minutes)); setEarlyGrace(String(template.early_departure_grace_minutes)); setTemplateActive(template.active);
  };

  const openAssignment = (employee: HrShiftEmployee, assignment?: HrShiftAssignment | null) => {
    setAssignmentDialog({ employee, assignment });
    setShiftTemplateId(assignment?.shift_template_id || activeTemplates[0]?.id || "");
    setWeekdays(assignment?.weekdays?.length ? assignment.weekdays : [6, 0, 1, 2, 3, 4]);
    setEffectiveFrom(assignment?.effective_from || new Date().toISOString().slice(0, 10));
    setEffectiveTo(assignment?.effective_to || "");
    setAssignmentActive(assignment?.active ?? true);
  };

  const toggleDay = (day: number) => setWeekdays(current => current.includes(day) ? current.filter(value => value !== day) : [...current, day]);

  if (query.isLoading) return <MainLayout><div className="flex min-h-[480px] items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-[#005931]" /></div></MainLayout>;

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-[1500px] space-y-5 py-5">
        <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><div className="flex items-center gap-2"><CalendarCheck2 className="h-7 w-7 text-[#005931]" /><h1 className="text-2xl font-black">جدولة الورديات</h1></div><p className="mt-2 text-sm text-muted-foreground">{currentBranchName || "الفرع الحالي"} · المرجع الموحد للحضور والتأخير والغياب ومسير الرواتب.</p></div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button><Button onClick={openNewTemplate}><Plus className="ml-2 h-4 w-4" />قالب وردية</Button></div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="قوالب نشطة" value={activeTemplates.length} icon={<Clock3 className="h-4 w-4" />} />
            <Metric label="الموظفون" value={employees.length} icon={<Users className="h-4 w-4" />} />
            <Metric label="لديهم جدول" value={scheduledEmployees} icon={<CalendarCheck2 className="h-4 w-4" />} />
            <Metric label="بدون جدول" value={unscheduledEmployees} icon={<AlertTriangle className="h-4 w-4" />} warn={unscheduledEmployees > 0} />
          </div>
        </section>

        {query.isError ? <Card className="border-red-200 bg-red-50"><CardContent className="p-6 text-red-800">{query.error instanceof Error ? query.error.message : "تعذر تحميل جدول الورديات."}</CardContent></Card> : (
          <Tabs defaultValue="employees" dir="rtl">
            <TabsList className="h-auto flex-wrap rounded-2xl p-1.5"><TabsTrigger value="employees">جداول الموظفين</TabsTrigger><TabsTrigger value="templates">قوالب الورديات</TabsTrigger></TabsList>

            <TabsContent value="employees" className="mt-5 space-y-3">
              {unscheduledEmployees > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><div className="font-black">{unscheduledEmployees.toLocaleString("ar-EG")} موظف بدون جدول ورديات</div><p className="mt-1">لن يخصم Payroll غيابًا تلقائيًا لهؤلاء الموظفين حتى يتم إسناد جدول صالح، حمايةً من الخصم الخاطئ.</p></div>}
              {employees.map(employee => {
                const employeeAssignments = assignments.filter(item => item.employee_id === employee.employee_id);
                const currentAssignments = employeeAssignments.filter(item => item.active);
                return <Card key={employee.employee_id}><CardContent className="p-4 md:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-black">{employee.employee_name}</span><Badge variant="outline">{employee.employee_code || "بدون كود"}</Badge>{employee.active_assignment_count > 0 ? <Badge className="bg-emerald-700">مجدول</Badge> : <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">بدون جدول</Badge>}</div><div className="mt-3 space-y-2">{currentAssignments.length === 0 ? <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">لا توجد وردية نشطة.</div> : currentAssignments.map(assignment => <button type="button" key={assignment.id} onClick={() => openAssignment(employee, assignment)} className="block w-full rounded-xl border bg-slate-50 p-3 text-right transition hover:border-[#005931]/40"><div className="flex flex-wrap items-center gap-2"><b>{assignment.shift_name}</b><span className="text-xs text-muted-foreground">{shortTime(assignment.start_time)} — {shortTime(assignment.end_time)}</span></div><div className="mt-1 text-xs text-muted-foreground">{weekdayLabel(assignment.weekdays)} · من {assignment.effective_from}{assignment.effective_to ? ` حتى ${assignment.effective_to}` : " · مستمرة"}</div></button>)}</div></div><Button variant="outline" onClick={() => openAssignment(employee, null)} disabled={activeTemplates.length === 0}><Plus className="ml-2 h-4 w-4" />إسناد وردية</Button></div></CardContent></Card>;
              })}
            </TabsContent>

            <TabsContent value="templates" className="mt-5 space-y-3">
              {templates.length === 0 ? <Card className="border-dashed"><CardContent className="p-10 text-center"><Clock3 className="mx-auto h-9 w-9 text-[#005931]" /><h2 className="mt-3 font-black">ابدأ بإنشاء قالب وردية</h2><p className="mt-1 text-sm text-muted-foreground">مثال: صباحي 09:00–17:00، مع فترة سماح وراحة.</p><Button className="mt-4" onClick={openNewTemplate}><Plus className="ml-2 h-4 w-4" />إنشاء قالب</Button></CardContent></Card> : templates.map(template => <Card key={template.id} className={!template.active ? "opacity-70" : ""}><CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-black">{template.name_ar}</span><Badge variant="outline" className={template.active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}>{template.active ? "نشطة" : "متوقفة"}</Badge><Badge variant="outline">{template.active_assignments.toLocaleString("ar-EG")} إسناد نشط</Badge></div><div className="mt-2 text-sm">{shortTime(template.start_time)} — {shortTime(template.end_time)}</div><div className="mt-1 text-xs text-muted-foreground">راحة {template.break_minutes.toLocaleString("ar-EG")} د · سماح تأخير {template.late_grace_minutes.toLocaleString("ar-EG")} د · سماح انصراف مبكر {template.early_departure_grace_minutes.toLocaleString("ar-EG")} د</div></div><Button variant="outline" onClick={() => openTemplate(template)}><Pencil className="ml-2 h-4 w-4" />تعديل</Button></CardContent></Card>)}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <Dialog open={Boolean(templateDialog)} onOpenChange={open => !open && setTemplateDialog(null)}>
        <DialogContent dir="rtl" className="max-w-lg"><DialogHeader><DialogTitle>{templateDialog === "new" ? "قالب وردية جديد" : "تعديل قالب الوردية"}</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>اسم الوردية</Label><Input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="مثال: الوردية الصباحية" /></div><div className="grid grid-cols-2 gap-3"><div><Label>البداية</Label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div><div><Label>النهاية</Label><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div></div><div className="grid grid-cols-3 gap-3"><div><Label>الراحة/دقيقة</Label><Input type="number" min="0" max="360" value={breakMinutes} onChange={e => setBreakMinutes(e.target.value)} /></div><div><Label>سماح التأخير</Label><Input type="number" min="0" max="180" value={lateGrace} onChange={e => setLateGrace(e.target.value)} /></div><div><Label>سماح الانصراف</Label><Input type="number" min="0" max="180" value={earlyGrace} onChange={e => setEarlyGrace(e.target.value)} /></div></div><label className="flex cursor-pointer items-center gap-2 rounded-xl border p-3"><input type="checkbox" checked={templateActive} onChange={e => setTemplateActive(e.target.checked)} /><span className="text-sm font-bold">القالب نشط</span></label>{templateDialog !== "new" && !templateActive && <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">لن يسمح النظام بتعطيل القالب إذا ما زال له إسناد نشط.</div>}</div><DialogFooter><Button variant="outline" onClick={() => setTemplateDialog(null)}>إلغاء</Button><Button onClick={() => templateMutation.mutate()} disabled={templateMutation.isPending}>{templateMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ القالب</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(assignmentDialog)} onOpenChange={open => !open && setAssignmentDialog(null)}>
        <DialogContent dir="rtl" className="max-w-xl"><DialogHeader><DialogTitle>جدول {assignmentDialog?.employee.employee_name}</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>قالب الوردية</Label><Select value={shiftTemplateId} onValueChange={setShiftTemplateId}><SelectTrigger><SelectValue placeholder="اختر الوردية" /></SelectTrigger><SelectContent>{activeTemplates.map(template => <SelectItem key={template.id} value={template.id}>{template.name_ar} · {shortTime(template.start_time)}–{shortTime(template.end_time)}</SelectItem>)}</SelectContent></Select></div><div><Label className="mb-2 block">أيام العمل</Label><div className="flex flex-wrap gap-2">{weekdayMeta.map(day => <Button type="button" key={day.value} size="sm" variant={weekdays.includes(day.value) ? "default" : "outline"} onClick={() => toggleDay(day.value)}>{day.label}</Button>)}</div></div><div className="grid grid-cols-2 gap-3"><div><Label>ساري من</Label><Input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} /></div><div><Label>ساري حتى (اختياري)</Label><Input type="date" value={effectiveTo} onChange={e => setEffectiveTo(e.target.value)} /></div></div><label className="flex cursor-pointer items-center gap-2 rounded-xl border p-3"><input type="checkbox" checked={assignmentActive} onChange={e => setAssignmentActive(e.target.checked)} /><span className="text-sm font-bold">الإسناد نشط</span></label><div className="rounded-xl bg-blue-50 p-3 text-xs text-blue-900">أي تداخل في نفس الأيام والفترة لنفس الموظف سيتم رفضه. بعد الحفظ سيستخدم الحضور والـPayroll الجدول من تاريخ السريان.</div></div><DialogFooter><Button variant="outline" onClick={() => setAssignmentDialog(null)}>إلغاء</Button><Button onClick={() => assignmentMutation.mutate()} disabled={assignmentMutation.isPending}>{assignmentMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ الجدول</Button></DialogFooter></DialogContent>
      </Dialog>
    </MainLayout>
  );
}

function Metric({ label, value, icon, warn = false }: { label: string; value: number; icon: React.ReactNode; warn?: boolean }) {
  return <Card className={warn ? "border-amber-200 bg-amber-50" : ""}><CardContent className="p-4"><div className={`flex items-center gap-2 text-xs ${warn ? "text-amber-800" : "text-muted-foreground"}`}>{icon}{label}</div><div className="mt-2 text-2xl font-black">{value.toLocaleString("ar-EG")}</div></CardContent></Card>;
}
