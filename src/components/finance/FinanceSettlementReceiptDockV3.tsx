import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Landmark, RefreshCw, WalletCards, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  confirmSettlementReceiptV3,
  fetchMySettlementReceiptTasksV3,
  rejectSettlementReceiptV3,
  type MySettlementReceiptTaskV3,
} from "@/services/supabase/financeSettlementV3Service";

const money = (value?: number | null) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

export default function FinanceSettlementReceiptDockV3() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<MySettlementReceiptTaskV3 | null>(null);
  const [mode, setMode] = useState<"confirm" | "reject" | null>(null);
  const [note, setNote] = useState("");

  const query = useQuery({
    queryKey: ["my-payment-settlement-tasks-v3"],
    queryFn: () => fetchMySettlementReceiptTasksV3(40),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selected || !mode) throw new Error("اختر مهمة الاستلام أولًا.");
      return mode === "confirm" ? confirmSettlementReceiptV3(selected.task_id, note) : rejectSettlementReceiptV3(selected.task_id, note);
    },
    onSuccess: async () => {
      toast.success(mode === "confirm" ? "تم تأكيد وصول صافي التسوية وإضافته للعهدة." : "تم تسجيل تعذر/رفض الاستلام، والمبلغ ما زال ظاهرًا قيد التسوية.");
      setSelected(null); setMode(null); setNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-payment-settlement-tasks-v3"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-settlement-workspace-v3"] }),
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
      <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 font-black"><WalletCards className="h-5 w-5 text-blue-700" />استلام تسويات وسائل الدفع</div>
            <p className="mt-1 text-xs text-slate-600">الصافي لن يدخل خزنتك أو حسابك البنكي إلا بعد تأكيدك الفعلي لوصوله.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /></Button>
        </div>
        {query.isLoading && <div className="h-20 animate-pulse rounded-xl bg-white/70" />}
        {query.isError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{query.error instanceof Error ? query.error.message : "تعذر تحميل مهام التسويات"}</div>}
        <div className="grid gap-3 lg:grid-cols-2">
          {tasks.map(task => <Card key={task.task_id} className="shadow-none"><CardContent className="p-4">
            <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Badge className="bg-blue-600">مطلوب استلام</Badge><strong className="text-lg">{money(task.net_amount)}</strong></div><div className="mt-3 font-bold">{task.payment_method_name}</div><div className="mt-1 text-sm text-slate-600">{task.source_account_name} ← {task.target_account_name}</div>{task.provider_reference && <div className="mt-1 text-xs text-slate-500">المرجع: {task.provider_reference}</div>}<div className="mt-2 text-xs text-slate-500">الإجمالي {money(task.gross_amount)} · العمولة {money(task.fee_amount)}</div></div><Landmark className="h-5 w-5 text-blue-700" /></div>
            <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" className="bg-[#005931] hover:bg-[#004426]" onClick={() => { setSelected(task); setMode("confirm"); setNote(""); }}><CheckCircle2 className="ml-1 h-4 w-4" />تأكيد وصول المبلغ</Button><Button size="sm" variant="outline" onClick={() => { setSelected(task); setMode("reject"); setNote(""); }}><XCircle className="ml-1 h-4 w-4" />رفض / لم يصل</Button></div>
          </CardContent></Card>)}
        </div>
      </div>

      <Dialog open={Boolean(selected && mode)} onOpenChange={open => { if (!open) { setSelected(null); setMode(null); setNote(""); } }}>
        <DialogContent dir="rtl"><DialogHeader><DialogTitle>{mode === "confirm" ? "تأكيد استلام التسوية" : "رفض / تعذر استلام التسوية"}</DialogTitle></DialogHeader>{selected && <div className="rounded-xl bg-slate-50 p-3"><div className="text-xl font-black">{money(selected.net_amount)}</div><div className="mt-1 text-sm">{selected.payment_method_name} ← {selected.target_account_name}</div></div>}<div className="space-y-2"><Label>{mode === "confirm" ? "ملاحظة الاستلام" : "سبب الرفض أو عدم الوصول"}</Label><Textarea value={note} onChange={e => setNote(e.target.value)} placeholder={mode === "confirm" ? "مثال: تمت مطابقة التحويل ووصل المبلغ" : "مثال: المبلغ لم يظهر في الحساب حتى الآن"} /></div>{mode === "confirm" ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">بعد التأكيد فقط سيضاف صافي المبلغ إلى Ledger العهدة.</div> : <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">الرفض لا يعيد الصافي إلى حساب الوسيلة؛ سيظل «قيد الاستلام» كاستثناء حتى تعيد المالية المهمة.</div>}<DialogFooter><Button variant="outline" onClick={() => { setSelected(null); setMode(null); }}>رجوع</Button><Button variant={mode === "reject" ? "destructive" : "default"} className={mode === "confirm" ? "bg-[#005931] hover:bg-[#004426]" : ""} disabled={note.trim().length < 3 || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "جاري التنفيذ..." : mode === "confirm" ? "تأكيد الاستلام" : "تسجيل الرفض"}</Button></DialogFooter></DialogContent>
      </Dialog>
    </section>
  );
}
