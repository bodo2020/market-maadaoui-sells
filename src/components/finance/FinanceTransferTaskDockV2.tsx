import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBranchStore } from "@/stores/branchStore";
import {
  confirmFinanceTransferTaskV2,
  fetchMyFinanceTransferTasksV2,
  rejectFinanceTransferTaskV2,
  type FinanceTransferTaskV2,
} from "@/services/supabase/financeTransfersV2Service";

const money = (value?: number | null) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

export default function FinanceTransferTaskDockV2() {
  const queryClient = useQueryClient();
  const { currentBranchId } = useBranchStore();
  const branchId = currentBranchId || localStorage.getItem("currentBranchId") || null;
  const [selected, setSelected] = useState<FinanceTransferTaskV2 | null>(null);
  const [mode, setMode] = useState<"confirm" | "reject" | null>(null);
  const [note, setNote] = useState("");

  const query = useQuery({
    queryKey: ["my-finance-transfer-tasks-v2", branchId],
    queryFn: () => fetchMyFinanceTransferTasksV2(branchId),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selected || !mode) throw new Error("اختر العملية أولًا.");
      return mode === "confirm" ? confirmFinanceTransferTaskV2(selected, note) : rejectFinanceTransferTaskV2(selected, note);
    },
    onSuccess: async () => {
      toast.success(mode === "confirm" ? (selected?.stage === "sender" ? "تم تأكيد التسليم وبدأت مرحلة الاستلام" : "تم تأكيد الاستلام وإضافة المبلغ للوجهة") : "تم تسجيل الرفض بدون إضافة المبلغ للوجهة");
      setSelected(null);
      setMode(null);
      setNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-finance-transfer-tasks-v2"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-transfers-v2"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-control-center-v2"] }),
        queryClient.invalidateQueries({ queryKey: ["operations-tasks"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const tasks = query.data || [];
  if (!query.isLoading && !tasks.length) return null;

  return (
    <section dir="rtl" className="mx-auto mt-5 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 font-black text-slate-950"><ArrowLeftRight className="h-5 w-5 text-[#005931]" />تسليم واستلام أموال</div>
            <p className="mt-1 text-xs text-slate-600">المهام دي مرتبطة بعهدتك أنت. التأكيد يغيّر الرصيد الفعلي في الـLedger.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /></Button>
        </div>

        {query.isLoading && <div className="h-20 animate-pulse rounded-xl bg-white/70" />}
        {query.isError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{query.error instanceof Error ? query.error.message : "تعذر تحميل مهام التحويل"}</div>}
        <div className="grid gap-3 lg:grid-cols-2">
          {tasks.map(task => (
            <Card key={task.task_id} className="border-slate-200 shadow-none">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2"><Badge className={task.stage === "sender" ? "bg-amber-600" : "bg-blue-600"}>{task.stage === "sender" ? "مطلوب تسليم" : task.is_retry ? "إعادة استلام" : "مطلوب استلام"}</Badge><strong className="text-lg">{money(task.amount)}</strong></div>
                    <div className="mt-3 text-sm"><span className="font-bold">{task.source_account_name}</span><span className="mx-2 text-slate-400">←</span><span className="font-bold">{task.destination_account_name}</span></div>
                    {task.reference && <div className="mt-1 text-xs text-slate-500">المرجع: {task.reference}</div>}
                    {task.note && <div className="mt-1 text-xs text-slate-500">{task.note}</div>}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" className="bg-[#005931] hover:bg-[#004426]" onClick={() => { setSelected(task); setMode("confirm"); setNote(""); }}><CheckCircle2 className="ml-1 h-4 w-4" />{task.stage === "sender" ? "تأكيد تسليم المبلغ" : "تأكيد استلام المبلغ"}</Button>
                  <Button size="sm" variant="outline" onClick={() => { setSelected(task); setMode("reject"); setNote(""); }}><XCircle className="ml-1 h-4 w-4" />رفض / تعذر</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={Boolean(selected && mode)} onOpenChange={open => { if (!open) { setSelected(null); setMode(null); setNote(""); } }}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>{mode === "confirm" ? (selected?.stage === "sender" ? "تأكيد تسليم المبلغ" : "تأكيد استلام المبلغ") : "رفض / تعذر التحويل"}</DialogTitle></DialogHeader>
          {selected && <div className="rounded-xl bg-slate-50 p-3 text-sm"><div className="font-black">{money(selected.amount)}</div><div className="mt-1">{selected.source_account_name} ← {selected.destination_account_name}</div></div>}
          <div className="space-y-2 py-2"><Label>{mode === "confirm" ? "ملاحظة التأكيد" : "سبب الرفض أو التعذر"}</Label><Textarea value={note} onChange={e => setNote(e.target.value)} placeholder={mode === "confirm" ? "مثال: تم العد والتسليم يدويًا" : "اكتب السبب بوضوح..."} /></div>
          {mode === "confirm" && selected?.stage === "sender" && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">بمجرد التأكيد سيتم خصم المبلغ من عهدتك ويظهر «قيد النقل» حتى يؤكد المستلم.</div>}
          {mode === "confirm" && selected?.stage === "receiver" && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">بمجرد التأكيد سيتم إضافة المبلغ إلى عهدتك وإغلاق التحويل.</div>}
          {mode === "reject" && selected?.stage === "receiver" && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-900">الرفض بعد تسليم المصدر لا يعيد المبلغ تلقائيًا؛ سيظل ظاهرًا كاستثناء «قيد النقل» حتى تتدخل المالية.</div>}
          <DialogFooter><Button variant="outline" onClick={() => { setSelected(null); setMode(null); }}>رجوع</Button><Button variant={mode === "reject" ? "destructive" : "default"} className={mode === "confirm" ? "bg-[#005931] hover:bg-[#004426]" : ""} disabled={note.trim().length < 3 || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "جاري التنفيذ..." : mode === "confirm" ? "تأكيد" : "تسجيل الرفض"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
