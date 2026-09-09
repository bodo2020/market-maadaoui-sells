import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Loader2, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useBranchStore } from "@/stores/branchStore";
import { claimOperationsTask, fetchOperationsTasks, startOperationsTask, type OperationsTask } from "@/services/supabase/operationsTaskService";
import { applyHrAttendanceCorrection } from "@/services/hrRequestService";

const activeStatuses = new Set(["open", "claimed", "in_progress", "failed"]);

export default function HrTaskExecutionDock() {
  const location = useLocation();
  const { currentBranchId } = useBranchStore();
  const [selected, setSelected] = useState<OperationsTask | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const query = useQuery({
    queryKey: ["hr-attendance-execution-tasks-v1", currentBranchId],
    enabled: location.pathname === "/tasks" && Boolean(currentBranchId),
    queryFn: () => fetchOperationsTasks(currentBranchId as string, "active", 250),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const tasks = useMemo(() => (query.data || []).filter(task => task.source_kind === "hr_attendance_correction_apply" && activeStatuses.has(task.status)), [query.data]);
  if (location.pathname !== "/tasks" || !currentBranchId) return null;

  const openTask = async (task: OperationsTask) => {
    setBusy(true);
    try {
      if (task.status === "open" && task.can_claim) await claimOperationsTask(task.id);
      try { await startOperationsTask(task.id); } catch { /* specialized RPC can also claim/start safely */ }
      const refreshed = await query.refetch();
      const current = (refreshed.data || []).find(row => row.id === task.id) || task;
      setSelected(current);
      setNote("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر استلام مهمة الموارد البشرية.");
    } finally { setBusy(false); }
  };

  const complete = async () => {
    if (!selected || busy) return;
    if (note.trim().length < 3) return toast.error("اكتب ملاحظة توثيق قبل التنفيذ.");
    setBusy(true);
    try {
      await applyHrAttendanceCorrection(selected.id, note);
      toast.success("تم تطبيق تصحيح الحضور وإغلاق مهمة التنفيذ.");
      setSelected(null);
      setNote("");
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تنفيذ مهمة الموارد البشرية.");
      await query.refetch();
    } finally { setBusy(false); }
  };

  return <>
    <div dir="rtl" className="fixed bottom-5 left-5 z-40 w-[min(92vw,430px)]">
      <Card className="overflow-hidden border-[#005931]/20 shadow-2xl">
        <CardContent className="p-0">
          <button type="button" className="flex w-full items-center justify-between gap-3 bg-white p-4 text-right" onClick={() => setExpanded(value => !value)}>
            <div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-50 p-2 text-[#005931]"><ShieldCheck className="h-5 w-5" /></div><div><div className="font-black">تنفيذ قرارات HR</div><div className="text-xs text-muted-foreground">تطبيق تصحيحات الحضور المعتمدة</div></div></div>
            <Badge className="bg-[#005931]">{tasks.length.toLocaleString("ar-EG")}</Badge>
          </button>
          {expanded && <div className="max-h-[50vh] space-y-2 overflow-auto border-t bg-slate-50 p-3">
            <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`ml-1 h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button></div>
            {query.isLoading ? <div className="flex justify-center p-5"><Loader2 className="h-5 w-5 animate-spin" /></div> : tasks.length === 0 ? <div className="rounded-xl border border-dashed bg-white p-5 text-center text-sm text-muted-foreground">لا توجد مهام تصحيح حضور ضمن صلاحياتك.</div> : tasks.map(task => <div key={task.id} className="rounded-xl border bg-white p-3"><div className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-2 font-black"><Clock3 className="h-4 w-4 text-blue-700" />{task.title}</div><div className="mt-1 text-xs text-muted-foreground">{task.description || "مهمة تنفيذ معتمدة"}</div></div>{task.is_overdue && <Badge variant="destructive">متأخرة</Badge>}</div><Button className="mt-3 w-full" size="sm" disabled={busy || (!task.is_mine && !task.can_claim)} onClick={() => openTask(task)}><Play className="ml-1 h-4 w-4" />{task.is_mine ? "فتح التنفيذ" : "استلام وتنفيذ"}</Button></div>)}
          </div>}
        </CardContent>
      </Card>
    </div>

    <Dialog open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)}>
      <DialogContent dir="rtl" className="max-w-lg"><DialogHeader><DialogTitle>تطبيق تصحيح حضور</DialogTitle></DialogHeader>{selected && <div className="space-y-4"><div className="rounded-2xl border bg-slate-50 p-4"><div className="font-black">{selected.title}</div><p className="mt-1 text-sm text-muted-foreground">{selected.description}</p></div><div className="space-y-2"><Textarea rows={4} value={note} onChange={event => setNote(event.target.value)} placeholder="وثّق ما تم تنفيذه..." /></div></div>}<DialogFooter className="gap-2 sm:justify-start"><Button variant="outline" disabled={busy} onClick={() => setSelected(null)}>إلغاء</Button><Button disabled={busy} onClick={complete}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-2 h-4 w-4" />}تأكيد التنفيذ</Button></DialogFooter></DialogContent>
    </Dialog>
  </>;
}
