import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, ListTodo, Loader2, MessageCircle, Phone, RefreshCw } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useBranchStore } from "@/stores/branchStore";
import { completeCustomerFollowupV2, type CustomerFollowupOutcomeCode } from "@/services/supabase/customerManagementActionsService";
import { fetchMyCustomerFollowupInbox, type MyCustomerFollowupTask } from "@/services/supabase/customerMyTasksService";

const outcomeLabels: Record<CustomerFollowupOutcomeCode, string> = {
  reached: "تم التواصل",
  no_answer: "لم يرد",
  interested: "مهتم",
  not_interested: "غير مهتم",
  issue_resolved: "تم حل المشكلة",
  callback_requested: "طلب إعادة التواصل",
  wrong_number: "رقم غير صحيح",
};
const typeLabels: Record<string, string> = { call: "مكالمة", whatsapp: "WhatsApp", email: "بريد إلكتروني", meeting: "مقابلة" };
const priorityLabels: Record<string, string> = { high: "مهمة", medium: "متوسطة", low: "عادية" };

const dateTime = (value: string) => {
  try {
    return new Intl.DateTimeFormat("ar-EG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "—";
  }
};

const whatsappPhone = (phone?: string | null) => {
  const raw = String(phone || "").replace(/\D/g, "");
  if (!raw) return "";
  if (raw.startsWith("20")) return raw;
  if (raw.startsWith("0")) return `20${raw.slice(1)}`;
  return raw;
};

function priorityClass(priority: string) {
  if (priority === "high") return "border-red-200 bg-red-50 text-red-700";
  if (priority === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function CustomerMyTasksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [selectedTask, setSelectedTask] = useState<MyCustomerFollowupTask | null>(null);
  const [outcome, setOutcome] = useState<CustomerFollowupOutcomeCode>("reached");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["my-customer-followup-inbox", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchMyCustomerFollowupInbox(currentBranchId || null, 30),
    refetchInterval: 120_000,
  });
  const data = query.data;

  const refresh = async () => {
    await Promise.all([
      query.refetch(),
      queryClient.invalidateQueries({ queryKey: ["customer-management-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["customer-opportunity-board"] }),
      queryClient.invalidateQueries({ queryKey: ["customer-operations-center"] }),
      queryClient.invalidateQueries({ queryKey: ["customer-followup-team-workload"] }),
    ]);
  };

  const saveResult = async () => {
    if (!selectedTask || saving) return;
    setSaving(true);
    try {
      await completeCustomerFollowupV2(selectedTask.interaction_id, outcome, note.trim() || undefined, currentBranchId || null);
      toast.success("تم تسجيل النتيجة وإغلاق المهمة.");
      setSelectedTask(null);
      setNote("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل نتيجة المتابعة.");
    } finally {
      setSaving(false);
    }
  };

  const TaskCard = ({ task }: { task: MyCustomerFollowupTask }) => {
    const wa = whatsappPhone(task.customer_phone);
    return (
      <Card className={`overflow-hidden ${task.bucket === "overdue" ? "border-red-200" : ""}`}>
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-black">{task.customer_name || "عميل"}</h3>
                {task.membership_number && <Badge variant="outline">{task.membership_number}</Badge>}
                {task.management_status === "watch" && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">تحت المتابعة</Badge>}
              </div>
              <div className="mt-2 font-bold">{task.subject}</div>
              <div className="mt-1 text-xs text-muted-foreground">{typeLabels[task.type] || task.type} · {dateTime(task.scheduled_at)}</div>
              {task.description && <p className="mt-3 text-sm leading-6 text-muted-foreground">{task.description}</p>}
              {task.bucket === "overdue" && <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700"><AlertTriangle className="h-4 w-4" />متأخرة حوالي {Math.max(1, Number(task.overdue_hours || 0))} ساعة</div>}
            </div>
            <Badge variant="outline" className={priorityClass(task.priority)}>{priorityLabels[task.priority] || task.priority}</Badge>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Button variant="outline" disabled={!task.customer_phone} asChild={Boolean(task.customer_phone)}>{task.customer_phone ? <a href={`tel:${task.customer_phone}`}><Phone className="ml-2 h-4 w-4" />اتصال</a> : <span><Phone className="ml-2 h-4 w-4" />اتصال</span>}</Button>
            <Button variant="outline" disabled={!wa} onClick={() => wa && window.open(`https://wa.me/${wa}`, "_blank", "noopener,noreferrer")}><MessageCircle className="ml-2 h-4 w-4" />WhatsApp</Button>
            <Button variant="outline" onClick={() => navigate(`/customers/${task.customer_id}`)}><ExternalLink className="ml-2 h-4 w-4" />ملف العميل</Button>
            <Button className="bg-[#005931] hover:bg-[#004a29]" onClick={() => { setSelectedTask(task); setOutcome("reached"); setNote(""); }}><CheckCircle2 className="ml-2 h-4 w-4" />سجل النتيجة</Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const TaskList = ({ tasks, empty }: { tasks: MyCustomerFollowupTask[]; empty: string }) => <div className="space-y-3">{tasks.length ? tasks.map(task => <TaskCard key={task.interaction_id} task={task} />) : <div className="rounded-3xl border border-dashed bg-white p-12 text-center text-sm text-muted-foreground">{empty}</div>}</div>;

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-[1300px] space-y-5 p-3 pb-10 md:p-6">
        <section className="rounded-3xl bg-[#005931] p-5 text-white shadow-[0_16px_45px_rgba(0,89,49,.18)] md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-emerald-50"><ListTodo className="h-3.5 w-3.5" /> صندوق العمل الشخصي</div>
              <h1 className="text-2xl font-black md:text-3xl">مهامي مع العملاء</h1>
              <p className="mt-2 text-sm text-emerald-100">{currentBranchName || "الفرع الحالي"} · المهام المسندة لك فقط، مرتبة حسب الموعد والأولوية.</p>
            </div>
            <Button variant="secondary" className="bg-white text-[#005931] hover:bg-emerald-50" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
          </div>
        </section>

        {query.isLoading ? (
          <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#005931]" /></div>
        ) : query.isError || !data ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">{(query.error as Error)?.message || "تعذر تحميل مهامك."}</div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card className="border-red-100"><CardContent className="p-4"><AlertTriangle className="h-5 w-5 text-red-600" /><div className="mt-2 text-2xl font-black">{data.summary.overdue}</div><div className="text-xs text-muted-foreground">متأخرة</div></CardContent></Card>
              <Card className="border-amber-100"><CardContent className="p-4"><CalendarClock className="h-5 w-5 text-amber-600" /><div className="mt-2 text-2xl font-black">{data.summary.today}</div><div className="text-xs text-muted-foreground">مستحقة اليوم</div></CardContent></Card>
              <Card className="border-blue-100"><CardContent className="p-4"><ListTodo className="h-5 w-5 text-blue-600" /><div className="mt-2 text-2xl font-black">{data.summary.upcoming}</div><div className="text-xs text-muted-foreground">قادمة خلال 30 يوم</div></CardContent></Card>
              <Card><CardContent className="p-4"><CheckCircle2 className="h-5 w-5 text-[#005931]" /><div className="mt-2 text-2xl font-black">{data.summary.total}</div><div className="text-xs text-muted-foreground">إجمالي مهامي المفتوحة</div></CardContent></Card>
            </section>

            <Tabs defaultValue={data.summary.overdue ? "overdue" : data.summary.today ? "today" : "upcoming"}>
              <TabsList className="grid h-auto w-full max-w-xl grid-cols-3 rounded-2xl bg-slate-100 p-1">
                <TabsTrigger value="overdue">متأخرة ({data.summary.overdue})</TabsTrigger>
                <TabsTrigger value="today">اليوم ({data.summary.today})</TabsTrigger>
                <TabsTrigger value="upcoming">قادمة ({data.summary.upcoming})</TabsTrigger>
              </TabsList>
              <TabsContent value="overdue" className="mt-4"><TaskList tasks={data.overdue} empty="ممتاز، مفيش مهام متأخرة عليك." /></TabsContent>
              <TabsContent value="today" className="mt-4"><TaskList tasks={data.today} empty="مفيش مهام مستحقة عليك اليوم." /></TabsContent>
              <TabsContent value="upcoming" className="mt-4"><TaskList tasks={data.upcoming} empty="مفيش مهام قادمة خلال 30 يوم." /></TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <Dialog open={Boolean(selectedTask)} onOpenChange={open => !open && setSelectedTask(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader className="text-right"><DialogTitle>نتيجة متابعة العميل</DialogTitle></DialogHeader>
          {selectedTask && <div className="space-y-4"><div className="rounded-2xl bg-slate-50 p-3"><div className="font-black">{selectedTask.customer_name || "عميل"}</div><div className="mt-1 text-xs text-muted-foreground">{selectedTask.subject}</div></div><Select value={outcome} onValueChange={value => setOutcome(value as CustomerFollowupOutcomeCode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(outcomeLabels).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Textarea value={note} onChange={event => setNote(event.target.value)} placeholder="ملاحظة اختيارية..." className="min-h-24" /></div>}
          <DialogFooter className="gap-2 sm:justify-start"><Button variant="outline" onClick={() => setSelectedTask(null)} disabled={saving}>إلغاء</Button><Button className="bg-[#005931] hover:bg-[#004a29]" onClick={() => void saveResult()} disabled={saving}>{saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ وإغلاق المهمة</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
