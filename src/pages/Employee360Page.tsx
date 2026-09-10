import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Building2, KeyRound, Save, ShieldCheck, UserRoundCog } from "lucide-react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import { superAdminSetStaffAppPin } from "@/services/staffAppPinService";
import EmployeePerformancePanel from "@/components/employees/EmployeePerformancePanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ContractType,
  EmploymentStatus,
  getHrEmployeeDirectory,
  getHrEmployeeProfile,
  getHrStructure,
  HrEmployeeProfilePayload,
  saveHrEmployeeProfile,
  WorkMode,
} from "@/services/hrCompanyService";

const workModeLabels: Record<WorkMode, string> = { onsite: "من مقر العمل", remote: "عن بُعد", hybrid: "هجين", field: "ميداني" };
const contractLabels: Record<ContractType, string> = { full_time: "دوام كامل", part_time: "دوام جزئي", temporary: "مؤقت", contractor: "متعاقد", intern: "متدرب" };
const statusLabels: Record<EmploymentStatus, string> = { active: "نشط", leave: "إجازة", suspended: "موقوف", terminated: "انتهت الخدمة" };

const emptyForm: HrEmployeeProfilePayload = {
  employee_code: "",
  department_id: null,
  team_id: null,
  job_title_id: null,
  direct_manager_id: null,
  primary_branch_id: null,
  employment_status: "active",
  work_mode: "onsite",
  contract_type: "full_time",
  hire_date: null,
  termination_date: null,
  notes: "",
};

export default function Employee360Page() {
  const { employeeId = "" } = useParams();
  const navigate = useNavigate();
  const branchId = localStorage.getItem("currentBranchId");
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [form, setForm] = useState<HrEmployeeProfilePayload>(emptyForm);
  const [securityPin, setSecurityPin] = useState("");
  const [securityPinConfirm, setSecurityPinConfirm] = useState("");
  const isSuperAdmin = currentUser?.role === "super_admin";

  const profileQuery = useQuery({
    queryKey: ["hr-employee-profile", employeeId, branchId],
    queryFn: () => getHrEmployeeProfile(employeeId, branchId),
    enabled: Boolean(employeeId),
  });
  const structureQuery = useQuery({
    queryKey: ["hr-structure", branchId],
    queryFn: () => getHrStructure(branchId),
  });
  const managersQuery = useQuery({
    queryKey: ["hr-manager-options", branchId],
    queryFn: () => getHrEmployeeDirectory({ branchId, limit: 250 }),
  });

  useEffect(() => {
    const p = profileQuery.data?.profile;
    if (!p) return;
    setForm({
      employee_code: p.employee_code || "",
      department_id: p.department_id || null,
      team_id: p.team_id || null,
      job_title_id: p.job_title_id || null,
      direct_manager_id: p.direct_manager_id || null,
      primary_branch_id: p.primary_branch_id || null,
      employment_status: p.employment_status || "active",
      work_mode: p.work_mode || "onsite",
      contract_type: p.contract_type || "full_time",
      hire_date: p.hire_date || null,
      termination_date: p.termination_date || null,
      notes: p.notes || "",
    });
  }, [profileQuery.data]);

  const filteredTeams = useMemo(
    () => structureQuery.data?.teams.filter((t) => !form.department_id || t.department_id === form.department_id) || [],
    [structureQuery.data, form.department_id],
  );
  const filteredTitles = useMemo(
    () => structureQuery.data?.job_titles.filter((j) => !form.department_id || j.department_id === form.department_id) || [],
    [structureQuery.data, form.department_id],
  );
  const managers = managersQuery.data?.items.filter((m) => m.id !== employeeId && m.employment_status !== "terminated") || [];

  const pinResetMutation = useMutation({
    mutationFn: async () => {
      if (!isSuperAdmin) throw new Error("هذه العملية متاحة لمدير النظام فقط.");
      if (!/^\d{4,6}$/.test(securityPin)) throw new Error("PIN الجديد يجب أن يكون من 4 إلى 6 أرقام.");
      if (securityPin !== securityPinConfirm) throw new Error("تأكيد PIN غير مطابق.");
      return superAdminSetStaffAppPin(employeeId, securityPin);
    },
    onSuccess: () => {
      setSecurityPin("");
      setSecurityPinConfirm("");
      toast.success("تم تعيين PIN جديد للموظف وتحديث PIN نقطة البيع أيضًا.");
    },
    onError: (e: any) => toast.error(e?.message || "تعذر تغيير PIN الموظف."),
  });

  const saveMutation = useMutation({
    mutationFn: () => saveHrEmployeeProfile(employeeId, branchId, form),
    onSuccess: () => {
      toast.success("تم حفظ الملف الوظيفي");
      queryClient.invalidateQueries({ queryKey: ["hr-employee-profile", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["hr-employee-directory"] });
    },
    onError: (e: any) => toast.error(e?.message || "تعذر حفظ الملف الوظيفي"),
  });

  if (profileQuery.isLoading) return <MainLayout><div className="py-20 text-center text-muted-foreground">جاري تحميل ملف الموظف...</div></MainLayout>;
  if (profileQuery.error || !profileQuery.data?.user) return <MainLayout><div className="space-y-4 py-20 text-center"><p className="text-destructive">تعذر فتح ملف الموظف أو ليس لديك صلاحية.</p><Button variant="outline" onClick={() => navigate("/employees")}>العودة للموظفين</Button></div></MainLayout>;

  const data = profileQuery.data;
  const user = data.user;
  const primaryBranch = data.branches?.find((b: any) => b.branch_id === form.primary_branch_id);

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/employees")}><ArrowRight className="h-5 w-5" /></Button>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-black">{user.name}</h1><Badge variant={form.employment_status === "active" ? "default" : "secondary"}>{statusLabels[(form.employment_status || "active") as EmploymentStatus]}</Badge></div>
              <p className="mt-1 text-sm text-muted-foreground">{form.employee_code || "بدون رقم وظيفي"} • {data.job_title?.name_ar || user.role} • {data.department?.name_ar || "غير محدد القسم"}</p>
            </div>
          </div>
          <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()} className="bg-[#005931] hover:bg-[#004426]"><Save className="ml-2 h-4 w-4" />{saveMutation.isPending ? "جاري الحفظ..." : "حفظ الملف الوظيفي"}</Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent className="flex items-center gap-3 p-5"><Building2 className="h-8 w-8 text-[#005931]" /><div><div className="font-black">{data.department?.name_ar || "—"}</div><div className="text-xs text-muted-foreground">القسم</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-5"><BriefcaseBusiness className="h-8 w-8 text-[#005931]" /><div><div className="font-black">{data.job_title?.name_ar || "—"}</div><div className="text-xs text-muted-foreground">المسمى الوظيفي</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-5"><UserRoundCog className="h-8 w-8 text-[#005931]" /><div><div className="font-black">{data.manager?.name || "غير محدد"}</div><div className="text-xs text-muted-foreground">المدير المباشر</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-5"><BadgeCheck className="h-8 w-8 text-[#005931]" /><div><div className="font-black">{workModeLabels[(form.work_mode || "onsite") as WorkMode]}</div><div className="text-xs text-muted-foreground">نمط العمل</div></div></CardContent></Card>
        </div>

        <Tabs defaultValue="employment" className="space-y-4">
          <TabsList className="grid w-full max-w-2xl grid-cols-3"><TabsTrigger value="employment">البيانات الوظيفية</TabsTrigger><TabsTrigger value="contact">الحساب والفروع</TabsTrigger><TabsTrigger value="performance">الأداء والحضور</TabsTrigger></TabsList>

          <TabsContent value="employment">
            <Card><CardHeader><CardTitle>الملف الوظيفي</CardTitle><CardDescription>المسمى الوظيفي منفصل عن صلاحيات النظام. تغيير هذا القسم لا يمنح صلاحية تلقائيًا.</CardDescription></CardHeader><CardContent className="grid gap-5 md:grid-cols-2">
              <div><Label>الرقم الوظيفي</Label><Input value={form.employee_code || ""} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} /></div>
              <div><Label>القسم</Label><Select value={form.department_id || "none"} onValueChange={(v) => setForm({ ...form, department_id: v === "none" ? null : v, team_id: null, job_title_id: null })}><SelectTrigger><SelectValue placeholder="اختر القسم" /></SelectTrigger><SelectContent><SelectItem value="none">غير محدد</SelectItem>{structureQuery.data?.departments.filter((d) => d.active).map((d) => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>الفريق</Label><Select value={form.team_id || "none"} onValueChange={(v) => setForm({ ...form, team_id: v === "none" ? null : v })}><SelectTrigger><SelectValue placeholder="اختر الفريق" /></SelectTrigger><SelectContent><SelectItem value="none">بدون فريق</SelectItem>{filteredTeams.filter((t) => t.active).map((t) => <SelectItem key={t.id} value={t.id}>{t.name_ar}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>المسمى الوظيفي</Label><Select value={form.job_title_id || "none"} onValueChange={(v) => setForm({ ...form, job_title_id: v === "none" ? null : v })}><SelectTrigger><SelectValue placeholder="اختر المسمى" /></SelectTrigger><SelectContent><SelectItem value="none">غير محدد</SelectItem>{filteredTitles.filter((j) => j.active).map((j) => <SelectItem key={j.id} value={j.id}>{j.name_ar}{j.grade ? ` - ${j.grade}` : ""}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>المدير المباشر</Label><Select value={form.direct_manager_id || "none"} onValueChange={(v) => setForm({ ...form, direct_manager_id: v === "none" ? null : v })}><SelectTrigger><SelectValue placeholder="اختر المدير" /></SelectTrigger><SelectContent><SelectItem value="none">غير محدد</SelectItem>{managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}{m.job_title_name ? ` — ${m.job_title_name}` : ""}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>نمط العمل</Label><Select value={form.work_mode || "onsite"} onValueChange={(v) => setForm({ ...form, work_mode: v as WorkMode })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(workModeLabels).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>نوع التعاقد</Label><Select value={form.contract_type || "full_time"} onValueChange={(v) => setForm({ ...form, contract_type: v as ContractType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(contractLabels).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>الحالة الوظيفية</Label><Select value={form.employment_status || "active"} onValueChange={(v) => setForm({ ...form, employment_status: v as EmploymentStatus })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabels).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>تاريخ التعيين</Label><Input type="date" value={form.hire_date || ""} onChange={(e) => setForm({ ...form, hire_date: e.target.value || null })} /></div>
              <div><Label>تاريخ انتهاء الخدمة</Label><Input type="date" value={form.termination_date || ""} onChange={(e) => setForm({ ...form, termination_date: e.target.value || null })} /></div>
              <div className="md:col-span-2"><Label>ملاحظات HR</Label><Textarea rows={4} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="contact">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader><CardTitle>الحساب</CardTitle><CardDescription>بيانات الدخول الأساسية للحساب، بينما الأجهزة الموثوقة تتم إدارتها كطبقة أمان مستقلة.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-4"><div><div className="text-xs text-muted-foreground">اسم المستخدم</div><div className="font-semibold">{user.username}</div></div><div><div className="text-xs text-muted-foreground">Role النظام</div><div className="font-semibold">{user.role}</div></div><div><div className="text-xs text-muted-foreground">الهاتف</div><div className="font-semibold">{user.phone || "—"}</div></div><div><div className="text-xs text-muted-foreground">البريد</div><div className="font-semibold">{user.email || "—"}</div></div></div></CardContent></Card>
              {isSuperAdmin && <Card className="border-emerald-100"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#005931]" />أمان الحساب</CardTitle><CardDescription>مدير النظام يقدر يضع PIN جديد للموظف بدون معرفة الرمز القديم. الرمز موحّد للتطبيق ونقطة البيع وتُسجل العملية في سجل التدقيق.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>PIN الجديد</Label><Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={securityPin} onChange={(e) => setSecurityPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••" /></div><div className="space-y-2"><Label>تأكيد PIN</Label><Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={securityPinConfirm} onChange={(e) => setSecurityPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••" /></div></div><Button className="w-full bg-[#005931] hover:bg-[#004426]" disabled={pinResetMutation.isPending || !securityPin || !securityPinConfirm} onClick={() => pinResetMutation.mutate()}>{pinResetMutation.isPending ? "جاري التغيير..." : <><KeyRound className="ml-2 h-4 w-4" />تعيين PIN جديد</>}</Button></CardContent></Card>}
              <Card><CardHeader><CardTitle>الفروع المسموحة</CardTitle><CardDescription>الفرع الوظيفي الأساسي لا يلغي صلاحيات الوصول للفروع الأخرى.</CardDescription></CardHeader><CardContent className="space-y-3">{data.branches?.map((b: any) => <div key={b.branch_id} className="flex items-center justify-between rounded-lg border p-3"><div><div className="font-semibold">{b.branch_name}</div><div className="text-xs text-muted-foreground">{b.role}</div></div>{b.is_primary && <Badge>أساسي</Badge>}</div>)}{!data.branches?.length && <p className="text-sm text-muted-foreground">لا توجد فروع مرتبطة.</p>}<Separator /><div><Label>الفرع الوظيفي الأساسي</Label><Select value={form.primary_branch_id || "none"} onValueChange={(v) => setForm({ ...form, primary_branch_id: v === "none" ? null : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">غير محدد</SelectItem>{data.branches?.filter((b:any) => b.active).map((b:any) => <SelectItem key={b.branch_id} value={b.branch_id}>{b.branch_name}</SelectItem>)}</SelectContent></Select></div>{primaryBranch && <p className="text-xs text-muted-foreground">الفرع الحالي: {primaryBranch.branch_name}</p>}</CardContent></Card>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <EmployeePerformancePanel employeeId={employeeId} branchId={branchId} />
            <Card><CardHeader><BriefcaseBusiness className="mb-2 h-8 w-8 text-[#005931]" /><CardTitle>الراتب وبطاقة الموظف</CardTitle><CardDescription>Payroll + Employee Wallet + الآجل وبدل الأكل يظلوا طبقات مالية مستقلة قابلة للمراجعة، ولن ندخلهم في Performance Score غامض.</CardDescription></CardHeader></Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
