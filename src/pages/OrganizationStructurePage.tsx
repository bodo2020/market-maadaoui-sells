import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, BriefcaseBusiness, Network, Plus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getHrStructure, saveHrDepartment, saveHrJobTitle, saveHrTeam, WorkMode } from "@/services/hrCompanyService";

const workModeLabels: Record<WorkMode, string> = {
  onsite: "من مقر العمل",
  remote: "عن بُعد",
  hybrid: "هجين",
  field: "ميداني",
};

export default function OrganizationStructurePage() {
  const branchId = localStorage.getItem("currentBranchId");
  const storedUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
  }, []);
  const canEditStructure = storedUser?.role === "super_admin" || storedUser?.role === "admin";
  const queryClient = useQueryClient();
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [titleOpen, setTitleOpen] = useState(false);
  const [department, setDepartment] = useState({ code: "", nameAr: "", description: "" });
  const [team, setTeam] = useState({ departmentId: "", nameAr: "", description: "" });
  const [jobTitle, setJobTitle] = useState({ departmentId: "", code: "", nameAr: "", grade: "", workMode: "onsite" as WorkMode });

  const structureQuery = useQuery({
    queryKey: ["hr-structure", branchId],
    queryFn: () => getHrStructure(branchId),
  });
  const structure = structureQuery.data;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["hr-structure"] });
  const departmentMutation = useMutation({
    mutationFn: () => saveHrDepartment({ code: department.code, nameAr: department.nameAr, description: department.description }),
    onSuccess: () => { toast.success("تم إنشاء القسم"); setDepartmentOpen(false); setDepartment({ code: "", nameAr: "", description: "" }); refresh(); },
    onError: (e: any) => toast.error(e?.message || "تعذر إنشاء القسم"),
  });
  const teamMutation = useMutation({
    mutationFn: () => saveHrTeam({ branchId, departmentId: team.departmentId, nameAr: team.nameAr, description: team.description }),
    onSuccess: () => { toast.success("تم إنشاء الفريق"); setTeamOpen(false); setTeam({ departmentId: "", nameAr: "", description: "" }); refresh(); },
    onError: (e: any) => toast.error(e?.message || "تعذر إنشاء الفريق"),
  });
  const titleMutation = useMutation({
    mutationFn: () => saveHrJobTitle({ departmentId: jobTitle.departmentId || null, code: jobTitle.code, nameAr: jobTitle.nameAr, grade: jobTitle.grade, defaultWorkMode: jobTitle.workMode }),
    onSuccess: () => { toast.success("تم إنشاء المسمى الوظيفي"); setTitleOpen(false); setJobTitle({ departmentId: "", code: "", nameAr: "", grade: "", workMode: "onsite" }); refresh(); },
    onError: (e: any) => toast.error(e?.message || "تعذر إنشاء المسمى الوظيفي"),
  });

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2"><Building2 className="h-7 w-7 text-[#005931]" /><h1 className="text-3xl font-black">الهيكل التنظيمي</h1></div>
            <p className="mt-2 text-sm text-muted-foreground">الشركة ← الأقسام ← الفرق ← المسميات الوظيفية. الصلاحيات تظل مستقلة عن المسمى الوظيفي.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEditStructure && <Button variant="outline" onClick={() => setDepartmentOpen(true)}><Plus className="ml-2 h-4 w-4" />قسم</Button>}
            <Button variant="outline" onClick={() => setTeamOpen(true)}><Plus className="ml-2 h-4 w-4" />فريق</Button>
            {canEditStructure && <Button onClick={() => setTitleOpen(true)} className="bg-[#005931] hover:bg-[#004426]"><Plus className="ml-2 h-4 w-4" />مسمى وظيفي</Button>}
          </div>
        </div>

        {structureQuery.isLoading ? <div className="py-16 text-center text-muted-foreground">جاري تحميل الهيكل التنظيمي...</div> : structureQuery.error ? (
          <Card><CardContent className="py-10 text-center text-destructive">ليس لديك صلاحية لعرض الهيكل التنظيمي أو حدث خطأ أثناء التحميل.</CardContent></Card>
        ) : <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card><CardContent className="flex items-center gap-3 p-5"><Building2 className="h-9 w-9 text-[#005931]" /><div><div className="text-2xl font-black">{structure?.departments.length || 0}</div><div className="text-xs text-muted-foreground">قسم وإدارة</div></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-5"><UsersRound className="h-9 w-9 text-[#005931]" /><div><div className="text-2xl font-black">{structure?.teams.length || 0}</div><div className="text-xs text-muted-foreground">فريق</div></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-5"><BriefcaseBusiness className="h-9 w-9 text-[#005931]" /><div><div className="text-2xl font-black">{structure?.job_titles.length || 0}</div><div className="text-xs text-muted-foreground">مسمى وظيفي</div></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-5"><Network className="h-9 w-9 text-[#005931]" /><div className="min-w-0"><div className="truncate font-black">{structure?.organization?.name_ar || "المعداوي ماركت"}</div><div className="text-xs text-muted-foreground">المؤسسة الحالية</div></div></CardContent></Card>
          </div>

          <Tabs defaultValue="departments" className="space-y-4">
            <TabsList className="grid w-full max-w-xl grid-cols-3"><TabsTrigger value="departments">الأقسام</TabsTrigger><TabsTrigger value="teams">الفرق</TabsTrigger><TabsTrigger value="titles">المسميات</TabsTrigger></TabsList>
            <TabsContent value="departments" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {structure?.departments.map((item) => {
                const titles = structure.job_titles.filter((x) => x.department_id === item.id).length;
                const teams = structure.teams.filter((x) => x.department_id === item.id).length;
                return <Card key={item.id}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">{item.name_ar}</CardTitle><CardDescription className="mt-1">{item.description || "بدون وصف"}</CardDescription></div><Badge variant={item.active ? "default" : "secondary"}>{item.active ? "نشط" : "متوقف"}</Badge></div></CardHeader><CardContent className="flex gap-4 text-sm"><span>{teams} فريق</span><span>{titles} مسمى وظيفي</span><code className="mr-auto text-xs text-muted-foreground">{item.code}</code></CardContent></Card>;
              })}
            </TabsContent>
            <TabsContent value="teams" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {structure?.teams.length ? structure.teams.map((item) => <Card key={item.id}><CardHeader><CardTitle className="text-lg">{item.name_ar}</CardTitle><CardDescription>{item.description || "فريق تشغيلي"}</CardDescription></CardHeader><CardContent className="text-sm text-muted-foreground">القسم: {structure.departments.find((d) => d.id === item.department_id)?.name_ar || "—"}{item.manager_name ? ` • المسؤول: ${item.manager_name}` : ""}</CardContent></Card>) : <Card className="md:col-span-2"><CardContent className="py-12 text-center text-muted-foreground">لم يتم إنشاء فرق بعد. الأقسام موجودة ويمكن تقسيم كل قسم إلى فرق حسب الحاجة.</CardContent></Card>}
            </TabsContent>
            <TabsContent value="titles" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {structure?.job_titles.map((item) => <Card key={item.id}><CardHeader><div className="flex items-center justify-between"><CardTitle className="text-lg">{item.name_ar}</CardTitle>{item.grade && <Badge variant="outline">{item.grade}</Badge>}</div><CardDescription>{structure.departments.find((d) => d.id === item.department_id)?.name_ar || "على مستوى الشركة"}</CardDescription></CardHeader><CardContent className="flex items-center justify-between text-sm"><span>{workModeLabels[item.default_work_mode]}</span><code className="text-xs text-muted-foreground">{item.code}</code></CardContent></Card>)}
            </TabsContent>
          </Tabs>
        </>}
      </div>

      <Dialog open={departmentOpen} onOpenChange={setDepartmentOpen}><DialogContent dir="rtl"><DialogHeader><DialogTitle>إضافة قسم</DialogTitle><DialogDescription>القسم مستوى تنظيمي ثابت داخل الشركة.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label>اسم القسم</Label><Input value={department.nameAr} onChange={(e) => setDepartment({ ...department, nameAr: e.target.value })} /></div><div><Label>الكود</Label><Input dir="ltr" value={department.code} onChange={(e) => setDepartment({ ...department, code: e.target.value })} placeholder="customer_service" /></div><div><Label>الوصف</Label><Textarea value={department.description} onChange={(e) => setDepartment({ ...department, description: e.target.value })} /></div></div><DialogFooter><Button disabled={!department.nameAr.trim() || !department.code.trim() || departmentMutation.isPending} onClick={() => departmentMutation.mutate()}>حفظ القسم</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={teamOpen} onOpenChange={setTeamOpen}><DialogContent dir="rtl"><DialogHeader><DialogTitle>إضافة فريق</DialogTitle><DialogDescription>الفريق يتبع قسمًا ويمكن ربطه بالفرع الحالي.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label>القسم</Label><Select value={team.departmentId} onValueChange={(v) => setTeam({ ...team, departmentId: v })}><SelectTrigger><SelectValue placeholder="اختر القسم" /></SelectTrigger><SelectContent>{structure?.departments.filter((d) => d.active).map((d) => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}</SelectContent></Select></div><div><Label>اسم الفريق</Label><Input value={team.nameAr} onChange={(e) => setTeam({ ...team, nameAr: e.target.value })} /></div><div><Label>الوصف</Label><Textarea value={team.description} onChange={(e) => setTeam({ ...team, description: e.target.value })} /></div></div><DialogFooter><Button disabled={!team.departmentId || !team.nameAr.trim() || teamMutation.isPending} onClick={() => teamMutation.mutate()}>حفظ الفريق</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={titleOpen} onOpenChange={setTitleOpen}><DialogContent dir="rtl"><DialogHeader><DialogTitle>إضافة مسمى وظيفي</DialogTitle><DialogDescription>المسمى يصف وظيفة الموظف، بينما الصلاحيات تظل في نظام Roles & Permissions.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label>القسم</Label><Select value={jobTitle.departmentId} onValueChange={(v) => setJobTitle({ ...jobTitle, departmentId: v })}><SelectTrigger><SelectValue placeholder="اختر القسم" /></SelectTrigger><SelectContent>{structure?.departments.filter((d) => d.active).map((d) => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-3"><div><Label>المسمى</Label><Input value={jobTitle.nameAr} onChange={(e) => setJobTitle({ ...jobTitle, nameAr: e.target.value })} /></div><div><Label>الكود</Label><Input dir="ltr" value={jobTitle.code} onChange={(e) => setJobTitle({ ...jobTitle, code: e.target.value })} /></div></div><div className="grid grid-cols-2 gap-3"><div><Label>الدرجة</Label><Input value={jobTitle.grade} onChange={(e) => setJobTitle({ ...jobTitle, grade: e.target.value })} placeholder="S1" /></div><div><Label>نمط العمل الافتراضي</Label><Select value={jobTitle.workMode} onValueChange={(v) => setJobTitle({ ...jobTitle, workMode: v as WorkMode })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(workModeLabels).map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div></div></div><DialogFooter><Button disabled={!jobTitle.nameAr.trim() || !jobTitle.code.trim() || titleMutation.isPending} onClick={() => titleMutation.mutate()}>حفظ المسمى</Button></DialogFooter></DialogContent></Dialog>
    </MainLayout>
  );
}
