import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ListTodo,
  Loader2,
  MessageCircle,
  Phone,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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

const typeLabels: Record<string, string> = {
  call: "مكالمة",
  whatsapp: "WhatsApp",
  email: "بريد إلكتروني",
  meeting: "مقابلة",
};

const priorityLabels: Record<string, string> = {
  high: "مهمة",
  medium: "متوسطة",
  low: "عادية",
};

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function normalizeWhatsApp(phone?: string | null) {
  const raw = String(phone || "").replace(/\D/g, "");
  if (!raw) return "";
  if (raw.startsWith("20")) return raw;
  if (raw.startsWith("0")) return `20${raw.slice(1)}`;
  return raw;
}

function priorityClass(priority: string) {
  if (priority === "high") return "border-red-200 bg-red-50 text-red-700";
  if (priority === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function CustomerMyTasksDock() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentBranchId } = useBranchStore();
  const [open, setOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<MyCustomerFollowupTask | null>(null);
  const [outcome, setOutcome] = useState<CustomerFollowupOutcomeCode>("reached");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["my-customer-followup-inbox", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchMyCustomerFollowupInbox(currentBranchId || null, 14),
    refetchInterval: open ? 60_000 : 180_000,
  });

  const data = query.data;
  const badgeCount = Number(data?.summary.overdue || 0) + Number(data?.summary.today || 0);

  const tabCounts = useMemo(() => ({
    overdue: Number(data?.summary.overdue || 0),
    today: Number(data?.summary.today || 0),
    upcoming: Number(data?.summary.upcoming || 0),
  }), [data]);

  const refreshRelated = async () => {
    await Promise.all([
      query.refetch(),
      queryClient.invalidateQueries({ queryKey: ["customer-management-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["customer-opportunity-board"] }),
      queryClient.invalidateQueries({ queryKey: ["customer-operations-center"] }),
      queryClient.invalidateQueries({ queryKey: ["customer-followup-team-workload"] }),
    ]);
  };

  const openResult = (task: MyCustomerFollowupTask) => {
    setSelectedTask(task);
    setOutcome("reached");
    setNote("");
    setResultOpen(true);
  };

  const saveResult = async () => {
    if (!selectedTask || saving) return;
    setSaving(true);
    try {
      await completeCustomerFollowupV2(
        selectedTask.interaction_id,
        outcome,
        note.trim() || undefined,
        currentBranchId || null,
      );
      toast.success("تم تسجيل نتيجة المتابعة وإغلاق المهمة.");
      setResultOpen(false);
      setSelectedTask(null);
      setNote("");
      await refreshRelated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل نتيجة المتابعة.");
    } finally {
      setSaving(false);
    }
  };

  const openCustomer = (customerId: string) => {
    setOpen(false);
    navigate(`/customers/${customerId}`);
  };

  const TaskCard = ({ task }: { task: MyCustomerFollowupTask }) => {
    const whatsapp = normalizeWhatsApp(task.customer_phone);
    return (
      <Card className={task.bucket === "overdue" ? "border-red-200" : ""}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate font-black">{task.customer_name || "عميل"}</div>
                {task.membership_number && <Badge variant="outline">{task.membership_number}</Badge>}
              </div>
              <div className="mt-1 text-sm font-semibold">{task.subject}</div>
              <div className="mt-1 text-xs text-muted-foreground">{typeLabels[task.type] || task.type} · {formatDateTime(task.scheduled_at)}</div>
            </div>
            <Badge variant="outline" className={priorityClass(task.priority)}>{priorityLabels[task.priority] || task.priority}</Badge>
          </div>

          {task.bucket === "overdue" && (
            <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">متأخرة حوالي {Math.max(1, Number(task.overdue_hours || 0))} ساعة</div>
          )}
          {task.description && <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{task.description}</p>}

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button variant="outline" size="sm" disabled={!task.customer_phone} asChild={Boolean(task.customer_phone)}>
              {task.customer_phone ? <a href={`tel:${task.customer_phone}`}><Phone className="ml-1.5 h-4 w-4" />اتصال</a> : <span><Phone className="ml-1.5 h-4 w-4" />اتصال</span>}
            </Button>
            <Button variant="outline" size="sm" disabled={!whatsapp} onClick={() => whatsapp && window.open(`https://wa.me/${whatsapp}`, "_blank", "noopener,noreferrer")}>
              <MessageCircle className="ml-1.5 h-4 w-4" />WhatsApp
            </Button>
            <Button variant="outline" size="sm" onClick={() => openCustomer(task.customer_id)}><ExternalLink className="ml-1.5 h-4 w-4" />العميل</Button>
            <Button size="sm" className="bg-[#005931] hover:bg-[#004a29]" onClick={() => openResult(task)}><CheckCircle2 className="ml-1.5 h-4 w-4" />النتيجة</Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const TaskList = ({ tasks, empty }: { tasks: MyCustomerFollowupTask[]; empty: string }) => (
    <div className="space-y-3">
      {tasks.length ? tasks.map(task => <TaskCard key={task.interaction_id} task={task} />) : <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{empty}</div>}
    </div>
  );

  if (!currentBranchId || query.isError) return null;

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[72] h-12 rounded-full bg-white px-5 text-slate-950 shadow-[0_14px_35px_rgba(15,23,42,.2)] ring-1 ring-slate-200 hover:bg-slate-50"
      >
        <ListTodo className="ml-2 h-5 w-5 text-[#005931]" />
        مهامي
        {badgeCount > 0 && <Badge className="mr-2 bg-red-600 text-white hover:bg-red-600">{badgeCount.toLocaleString("ar-EG")}</Badge>}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" dir="rtl" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="text-right">
            <SheetTitle className="flex items-center gap-2 text-xl"><ListTodo className="h-5 w-5 text-[#005931]" />مهامي مع العملاء</SheetTitle>
            <SheetDescription>المهام المسندة لك فقط في الفرع الحالي. نفّذ التواصل وسجل النتيجة من نفس المكان.</SheetDescription>
          </SheetHeader>

          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="grid flex-1 grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-xl bg-red-50 p-2"><div className="font-black text-red-700">{data?.summary.overdue || 0}</div><div className="text-red-600">متأخرة</div></div>
              <div className="rounded-xl bg-amber-50 p-2"><div className="font-black text-amber-700">{data?.summary.today || 0}</div><div className="text-amber-700">اليوم</div></div>
              <div className="rounded-xl bg-blue-50 p-2"><div className="font-black text-blue-700">{data?.summary.upcoming || 0}</div><div className="text-blue-700">قادمة</div></div>
              <div className="rounded-xl bg-slate-50 p-2"><div className="font-black">{data?.summary.total || 0}</div><div className="text-muted-foreground">الإجمالي</div></div>
            </div>
            <Button variant="outline" size="icon" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /></Button>
          </div>

          {query.isLoading ? (
            <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#005931]" /></div>
          ) : (
            <Tabs defaultValue={tabCounts.overdue ? "overdue" : tabCounts.today ? "today" : "upcoming"} className="mt-5">
              <TabsList className="grid h-auto w-full grid-cols-3 rounded-2xl bg-slate-100 p-1">
                <TabsTrigger value="overdue"><Clock3 className="ml-1.5 h-4 w-4" />متأخرة ({tabCounts.overdue})</TabsTrigger>
                <TabsTrigger value="today"><CalendarClock className="ml-1.5 h-4 w-4" />اليوم ({tabCounts.today})</TabsTrigger>
                <TabsTrigger value="upcoming"><UserRound className="ml-1.5 h-4 w-4" />قادمة ({tabCounts.upcoming})</TabsTrigger>
              </TabsList>
              <TabsContent value="overdue" className="mt-4"><TaskList tasks={data?.overdue || []} empty="ممتاز، مفيش مهام متأخرة عليك." /></TabsContent>
              <TabsContent value="today" className="mt-4"><TaskList tasks={data?.today || []} empty="مفيش مهام مستحقة عليك اليوم." /></TabsContent>
              <TabsContent value="upcoming" className="mt-4"><TaskList tasks={data?.upcoming || []} empty="مفيش مهام قادمة خلال الفترة المحددة." /></TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader className="text-right"><DialogTitle>تسجيل نتيجة المتابعة</DialogTitle></DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-50 p-3 text-sm">
                <div className="font-black">{selectedTask.customer_name || "عميل"}</div>
                <div className="mt-1 text-xs text-muted-foreground">{selectedTask.subject} · {formatDateTime(selectedTask.scheduled_at)}</div>
              </div>
              <Select value={outcome} onValueChange={value => setOutcome(value as CustomerFollowupOutcomeCode)}>
                <SelectTrigger><SelectValue placeholder="اختر النتيجة" /></SelectTrigger>
                <SelectContent>{Object.entries(outcomeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
              <Textarea value={note} onChange={event => setNote(event.target.value)} placeholder="ملاحظة اختيارية عن نتيجة التواصل..." className="min-h-24" />
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-start">
            <Button variant="outline" onClick={() => setResultOpen(false)} disabled={saving}>إلغاء</Button>
            <Button className="bg-[#005931] hover:bg-[#004a29]" onClick={() => void saveResult()} disabled={saving}>{saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ وإغلاق المهمة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
