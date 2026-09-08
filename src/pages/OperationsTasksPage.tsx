import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  History,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  UserRoundCheck,
  WalletCards,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useBranchStore } from "@/stores/branchStore";
import { siteConfig } from "@/config/site";
import {
  claimOperationsTask,
  completeRefundTransferTask,
  failOperationsTask,
  fetchOperationsTaskEvents,
  fetchOperationsTasks,
  releaseOperationsTask,
  startOperationsTask,
  type OperationsTask,
  type OperationsTaskEvent,
} from "@/services/supabase/operationsTaskService";

const formatMoney = (value: number) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;
const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "—";
  }
};

const statusLabel: Record<string, string> = {
  open: "متاحة للجميع",
  claimed: "تم الاستلام",
  in_progress: "جاري التحويل",
  completed: "تم التحويل",
  failed: "تعذر التحويل",
  cancelled: "ملغاة",
};

const statusClass: Record<string, string> = {
  open: "border-emerald-200 bg-emerald-50 text-emerald-800",
  claimed: "border-blue-200 bg-blue-50 text-blue-800",
  in_progress: "border-amber-200 bg-amber-50 text-amber-800",
  completed: "border-slate-200 bg-slate-50 text-slate-700",
  failed: "border-red-200 bg-red-50 text-red-800",
  cancelled: "border-slate-200 bg-slate-50 text-slate-500",
};

export default function OperationsTasksPage() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [completeTask, setCompleteTask] = useState<OperationsTask | null>(null);
  const [failTask, setFailTask] = useState<OperationsTask | null>(null);
  const [historyTask, setHistoryTask] = useState<OperationsTask | null>(null);
  const [providerReference, setProviderReference] = useState("");
  const [failureReason, setFailureReason] = useState("");

  const query = useQuery({
    queryKey: ["operations-tasks", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchOperationsTasks(currentBranchId as string, "all", 250),
    refetchInterval: 30_000,
  });

  const historyQuery = useQuery({
    queryKey: ["operations-task-events", historyTask?.id],
    enabled: Boolean(historyTask?.id),
    queryFn: () => fetchOperationsTaskEvents(historyTask!.id),
  });

  const data = query.data || [];
  const available = useMemo(() => data.filter(task => task.status === "open"), [data]);
  const mine = useMemo(() => data.filter(task => task.is_mine && ["claimed", "in_progress", "failed"].includes(task.status)), [data]);
  const inProgress = useMemo(() => data.filter(task => ["claimed", "in_progress", "failed"].includes(task.status)), [data]);
  const overdue = useMemo(() => data.filter(task => task.is_overdue), [data]);
  const completed = useMemo(() => data.filter(task => task.status === "completed"), [data]);

  const run = async (taskId: string, action: () => Promise<unknown>, success: string) => {
    setBusyId(taskId);
    try {
      await action();
      toast.success(success);
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تنفيذ الإجراء.");
      await query.refetch();
    } finally {
      setBusyId(null);
    }
  };

  const submitComplete = async () => {
    if (!completeTask || busyId) return;
    if (providerReference.trim().length < 3) return toast.error("اكتب رقم العملية أو المرجع.");
    const task = completeTask;
    setBusyId(task.id);
    try {
      await completeRefundTransferTask(task.id, providerReference);
      toast.success("تم تأكيد تحويل مبلغ المرتجع وتسجيل الحركة المالية.");
      setCompleteTask(null);
      setProviderReference("");
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تأكيد التحويل.");
      await query.refetch();
    } finally {
      setBusyId(null);
    }
  };

  const submitFailure = async () => {
    if (!failTask || busyId) return;
    if (failureReason.trim().length < 3) return toast.error("اكتب سبب تعذر التحويل.");
    const task = failTask;
    setBusyId(task.id);
    try {
      await failOperationsTask(task.id, failureReason);
      toast.success("تم تسجيل تعذر التحويل. المهمة مازالت عندك ويمكن إعادة المحاولة أو إرجاعها للمجموعة.");
      setFailTask(null);
      setFailureReason("");
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل المشكلة.");
    } finally {
      setBusyId(null);
    }
  };

  const TaskCard = ({ task }: { task: OperationsTask }) => {
    const busy = busyId === task.id;
    return (
      <Card className={`overflow-hidden ${task.is_overdue && task.status !== "completed" ? "border-red-200 shadow-[0_8px_30px_rgba(220,38,38,.08)]" : ""}`}>
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={statusClass[task.status] || ""}>{statusLabel[task.status] || task.status}</Badge>
                <Badge variant="outline">{task.source_kind === "pos_refund" ? "مرتجع POS" : "مرتجع أونلاين"}</Badge>
                {task.is_overdue && task.status !== "completed" && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700"><AlertTriangle className="ml-1 h-3.5 w-3.5" />متأخرة</Badge>}
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-950">{task.title}</h3>
                  <div className="mt-1 text-xs text-muted-foreground">{task.reference_number ? `مرجع: ${task.reference_number}` : "مرتجع إلكتروني"} · أُنشئت {formatDateTime(task.created_at)}</div>
                </div>
                <div className="text-2xl font-black text-[#005931]">{formatMoney(task.amount)}</div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-[11px] text-muted-foreground">وسيلة الرد</div>
                  <div className="mt-1 flex items-center gap-2 font-bold"><WalletCards className="h-4 w-4 text-[#005931]" />{task.payment_method_name || task.payment_method_code || "إلكتروني"}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-[11px] text-muted-foreground">العميل</div>
                  <div className="mt-1 truncate font-bold">{task.customer_name || "غير مرتبط"}</div>
                  {task.customer_phone && <div className="mt-0.5 text-xs text-muted-foreground" dir="ltr">{task.customer_phone}</div>}
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-[11px] text-muted-foreground">المسؤول</div>
                  <div className="mt-1 font-bold">{task.claimed_by_name || "متاحة للفريق"}</div>
                </div>
                <div className={`rounded-2xl p-3 ${task.is_overdue && task.status !== "completed" ? "bg-red-50" : "bg-slate-50"}`}>
                  <div className="text-[11px] text-muted-foreground">الموعد الداخلي</div>
                  <div className={`mt-1 flex items-center gap-2 font-bold ${task.is_overdue && task.status !== "completed" ? "text-red-700" : ""}`}><Clock3 className="h-4 w-4" />{formatDateTime(task.due_at)}</div>
                </div>
              </div>

              {task.failure_reason && <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="ml-2 inline h-4 w-4" />{task.failure_reason}</div>}
              {task.provider_reference && task.status === "completed" && <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">رقم العملية: <span className="font-black" dir="ltr">{task.provider_reference}</span></div>}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
            {task.status === "open" && (
              <Button
                className="bg-[#005931] hover:bg-[#004a29]"
                disabled={busy || !task.can_claim}
                onClick={() => run(task.id, () => claimOperationsTask(task.id), "تم استلام المهمة وأصبحت في «مهامي».")}
              >
                {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <UserRoundCheck className="ml-2 h-4 w-4" />}
                {task.can_claim ? "استلام المهمة" : "غير مخول بالاستلام"}
              </Button>
            )}

            {task.is_mine && task.status === "claimed" && (
              <Button className="bg-[#005931] hover:bg-[#004a29]" disabled={busy} onClick={() => run(task.id, () => startOperationsTask(task.id), "بدأ تنفيذ التحويل.")}>
                <Play className="ml-2 h-4 w-4" />بدء التحويل
              </Button>
            )}

            {task.is_mine && task.status === "failed" && (
              <Button className="bg-[#005931] hover:bg-[#004a29]" disabled={busy} onClick={() => run(task.id, () => startOperationsTask(task.id), "تم فتح محاولة جديدة للتحويل.")}>
                <RotateCcw className="ml-2 h-4 w-4" />إعادة المحاولة
              </Button>
            )}

            {task.is_mine && task.status === "in_progress" && (
              <>
                <Button className="bg-[#005931] hover:bg-[#004a29]" disabled={busy} onClick={() => { setProviderReference(""); setCompleteTask(task); }}>
                  <CheckCircle2 className="ml-2 h-4 w-4" />تأكيد التحويل
                </Button>
                <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" disabled={busy} onClick={() => { setFailureReason(""); setFailTask(task); }}>
                  <AlertTriangle className="ml-2 h-4 w-4" />تعذر التحويل
                </Button>
              </>
            )}

            {task.can_release && ["claimed", "in_progress", "failed"].includes(task.status) && (
              <Button variant="outline" disabled={busy} onClick={() => run(task.id, () => releaseOperationsTask(task.id, "إرجاع للمجموعة"), "رجعت المهمة للمجموعة وأصبحت متاحة للاستلام.")}>
                <RotateCcw className="ml-2 h-4 w-4" />إرجاع للمجموعة
              </Button>
            )}

            <Button variant="ghost" onClick={() => setHistoryTask(task)}><History className="ml-2 h-4 w-4" />السجل</Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const TaskList = ({ tasks, empty }: { tasks: OperationsTask[]; empty: string }) => (
    <div className="space-y-3">{tasks.length ? tasks.map(task => <TaskCard key={task.id} task={task} />) : <div className="rounded-3xl border border-dashed bg-white p-12 text-center text-sm text-muted-foreground">{empty}</div>}</div>
  );

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-[1400px] space-y-5 p-3 pb-10 md:p-6">
        <section className="rounded-3xl bg-[#005931] p-5 text-white shadow-[0_18px_50px_rgba(0,89,49,.18)] md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-emerald-50"><CircleDollarSign className="h-3.5 w-3.5" /> مركز المهام المشترك</div>
              <h1 className="text-2xl font-black md:text-3xl">المهام</h1>
              <p className="mt-2 max-w-2xl text-sm text-emerald-100">{currentBranchName || "الفرع الحالي"} · مهام تحويل مبالغ المرتجعات تظهر لكل الفريق المؤهل حتى يستلمها شخص واحد، وبعدها تتقفل عليه حتى التنفيذ أو الإرجاع للمجموعة.</p>
            </div>
            <Button variant="secondary" className="bg-white text-[#005931] hover:bg-emerald-50" onClick={() => void query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث
            </Button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Card><CardContent className="p-4"><UserRoundCheck className="h-5 w-5 text-[#005931]" /><div className="mt-2 text-2xl font-black">{available.length}</div><div className="text-xs text-muted-foreground">متاحة للجميع</div></CardContent></Card>
          <Card><CardContent className="p-4"><WalletCards className="h-5 w-5 text-blue-600" /><div className="mt-2 text-2xl font-black">{mine.length}</div><div className="text-xs text-muted-foreground">مهامي</div></CardContent></Card>
          <Card><CardContent className="p-4"><Play className="h-5 w-5 text-amber-600" /><div className="mt-2 text-2xl font-black">{inProgress.length}</div><div className="text-xs text-muted-foreground">قيد التنفيذ</div></CardContent></Card>
          <Card className="border-red-100"><CardContent className="p-4"><AlertTriangle className="h-5 w-5 text-red-600" /><div className="mt-2 text-2xl font-black">{overdue.length}</div><div className="text-xs text-muted-foreground">متأخرة</div></CardContent></Card>
          <Card><CardContent className="p-4"><CheckCircle2 className="h-5 w-5 text-slate-600" /><div className="mt-2 text-2xl font-black">{completed.length}</div><div className="text-xs text-muted-foreground">مكتملة</div></CardContent></Card>
        </section>

        {query.isLoading ? (
          <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#005931]" /></div>
        ) : query.isError ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">{(query.error as Error)?.message || "تعذر تحميل المهام."}</div>
        ) : (
          <Tabs defaultValue={available.length ? "available" : mine.length ? "mine" : "active"}>
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 md:grid-cols-5">
              <TabsTrigger value="available">متاحة ({available.length})</TabsTrigger>
              <TabsTrigger value="mine">مهامي ({mine.length})</TabsTrigger>
              <TabsTrigger value="active">قيد التنفيذ ({inProgress.length})</TabsTrigger>
              <TabsTrigger value="overdue">متأخرة ({overdue.length})</TabsTrigger>
              <TabsTrigger value="completed">مكتملة ({completed.length})</TabsTrigger>
            </TabsList>
            <TabsContent className="mt-4" value="available"><TaskList tasks={available} empty="لا توجد مهام تحويل متاحة حاليًا." /></TabsContent>
            <TabsContent className="mt-4" value="mine"><TaskList tasks={mine} empty="لم تستلم أي مهمة حاليًا." /></TabsContent>
            <TabsContent className="mt-4" value="active"><TaskList tasks={inProgress} empty="لا توجد مهام قيد التنفيذ." /></TabsContent>
            <TabsContent className="mt-4" value="overdue"><TaskList tasks={overdue} empty="ممتاز، لا توجد مهام متأخرة." /></TabsContent>
            <TabsContent className="mt-4" value="completed"><TaskList tasks={completed} empty="لا توجد مهام مكتملة لعرضها." /></TabsContent>
          </Tabs>
        )}
      </div>

      <Dialog open={Boolean(completeTask)} onOpenChange={open => !open && setCompleteTask(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader className="text-right"><DialogTitle>تأكيد تحويل مبلغ المرتجع</DialogTitle></DialogHeader>
          {completeTask && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-emerald-50 p-4">
                <div className="text-xs text-emerald-700">المبلغ المطلوب</div>
                <div className="mt-1 text-2xl font-black text-[#005931]">{formatMoney(completeTask.amount)}</div>
                <div className="mt-2 text-sm">{completeTask.payment_method_name || "وسيلة دفع إلكترونية"}</div>
              </div>
              <div>
                <Label>رقم العملية / المرجع</Label>
                <Input className="mt-1" dir="ltr" value={providerReference} onChange={event => setProviderReference(event.target.value)} placeholder="Transaction ID / Reference" autoFocus />
                <p className="mt-1 text-[11px] text-muted-foreground">تأكيد المهمة يسجل رد المبلغ على حساب وسيلة الدفع ويغلق حالة المرتجع المالية.</p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-start">
            <Button className="bg-[#005931] hover:bg-[#004a29]" onClick={() => void submitComplete()} disabled={Boolean(busyId)}>{busyId ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-2 h-4 w-4" />}تأكيد التحويل</Button>
            <Button variant="outline" onClick={() => setCompleteTask(null)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(failTask)} onOpenChange={open => !open && setFailTask(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader className="text-right"><DialogTitle>تعذر تنفيذ التحويل</DialogTitle></DialogHeader>
          <div>
            <Label>سبب المشكلة</Label>
            <Textarea className="mt-1 min-h-28" value={failureReason} onChange={event => setFailureReason(event.target.value)} placeholder="مثال: رقم المحفظة غير صحيح، العملية مرفوضة من المزود..." />
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button variant="destructive" onClick={() => void submitFailure()} disabled={Boolean(busyId)}><AlertTriangle className="ml-2 h-4 w-4" />تسجيل المشكلة</Button>
            <Button variant="outline" onClick={() => setFailTask(null)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(historyTask)} onOpenChange={open => !open && setHistoryTask(null)}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader className="text-right"><DialogTitle>سجل المهمة</DialogTitle></DialogHeader>
          {historyQuery.isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[#005931]" /></div> : (
            <div className="max-h-[55vh] space-y-3 overflow-y-auto">
              {(historyQuery.data || []).length ? (historyQuery.data as OperationsTaskEvent[]).map(event => (
                <div key={event.id} className="rounded-2xl border bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3"><div className="font-bold">{event.actor_name || "النظام"}</div><div className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</div></div>
                  <div className="mt-1 text-xs font-semibold text-[#005931]">{event.event_type}</div>
                  {event.note && <div className="mt-2 text-sm text-slate-700">{event.note}</div>}
                </div>
              )) : <div className="py-10 text-center text-sm text-muted-foreground">لا يوجد سجل إضافي.</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
