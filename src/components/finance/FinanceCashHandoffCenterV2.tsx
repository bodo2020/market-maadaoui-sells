import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, RefreshCw, ShieldCheck, TriangleAlert, UserRoundCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { siteConfig } from "@/config/site";
import { useToast } from "@/hooks/use-toast";
import {
  fetchFinanceCashHandoffWorkspaceV2,
  receiveFinanceCashHandoffV2,
  type FinanceCashHandoffPendingV2,
} from "@/services/supabase/financeCashHandoffV2Service";
import { useBranchStore } from "@/stores/branchStore";

const money = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;

export default function FinanceCashHandoffCenterV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<FinanceCashHandoffPendingV2 | null>(null);
  const [receivedAmount, setReceivedAmount] = useState("");
  const [varianceReason, setVarianceReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const query = useQuery({
    queryKey: ["finance-cash-handoff-v2", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchFinanceCashHandoffWorkspaceV2(currentBranchId!, 100),
    staleTime: 10_000,
  });

  const expected = Number(selected?.expected_amount || 0);
  const received = Number(receivedAmount || 0);
  const validAmount = receivedAmount.trim() !== "" && Number.isFinite(received) && received >= 0;
  const variance = validAmount ? Math.round((received - expected) * 100) / 100 : 0;
  const hasVariance = validAmount && Math.abs(variance) >= 0.01;
  const canSubmit = Boolean(selected && query.data?.permissions.can_manage && validAmount && (!hasVariance || varianceReason.trim().length >= 3));

  const pendingTotal = useMemo(
    () => (query.data?.pending || []).reduce((sum, row) => sum + Number(row.expected_amount || 0), 0),
    [query.data?.pending],
  );

  const openReceive = (row: FinanceCashHandoffPendingV2) => {
    setSelected(row);
    setReceivedAmount(Number(row.expected_amount || 0).toFixed(2));
    setVarianceReason("");
  };

  const closeDialog = () => {
    if (submitting) return;
    setSelected(null);
    setReceivedAmount("");
    setVarianceReason("");
  };

  const confirmReceive = async () => {
    if (!selected || !canSubmit) return;
    try {
      setSubmitting(true);
      const result = await receiveFinanceCashHandoffV2({
        handoffId: selected.handoff_id,
        receivedAmount: received,
        varianceReason,
      });
      toast({
        title: "تم استلام وتوريد نقدية الوردية",
        description: `${selected.cashier_name} · تم توريد ${money(result.received_amount)} للخزنة${Math.abs(result.variance_amount) >= 0.01 ? ` · فرق ${money(result.variance_amount)}` : ""}`,
      });
      setSelected(null);
      setReceivedAmount("");
      setVarianceReason("");
      await Promise.all([
        query.refetch(),
        queryClient.invalidateQueries({ queryKey: ["financialSummary"] }),
        queryClient.invalidateQueries({ queryKey: ["reporting-shifts-v2", currentBranchId] }),
        queryClient.invalidateQueries({ queryKey: ["reporting-overview-v2", currentBranchId] }),
      ]);
    } catch (error: any) {
      toast({ title: "تعذر استلام النقدية", description: error.message || "راجع المبلغ وحاول مرة أخرى.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentBranchId) return null;

  return (
    <section dir="rtl" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <UserRoundCheck className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-black">استلام نقدية الورديات</h2>
            <Badge variant="secondary">Cash Handoff V2</Badge>
          </div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
            بعد ما الكاشير يقفل الوردية ويؤكد العد الفعلي، المبلغ يفضل عهدة معلقة على درج الكاشير. المالية تستلم النقدية فعليًا هنا، وبعد التأكيد تنتقل للخزنة ويصبح الدرج صفرًا قبل الوردية التالية.
          </p>
        </div>
        <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      {query.isError && (
        <Alert variant="destructive"><AlertDescription>{query.error instanceof Error ? query.error.message : "تعذر تحميل تسليمات الورديات."}</AlertDescription></Alert>
      )}

      {!query.isLoading && query.data && !query.data.permissions.can_manage && (
        <Alert><ShieldCheck className="h-4 w-4" /><AlertDescription>يمكنك متابعة التسليمات، لكن تأكيد استلام النقدية يحتاج صلاحية إدارة المالية.</AlertDescription></Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-slate-100 shadow-sm"><CardContent className="p-4"><p className="text-xs text-slate-500">تسليمات معلقة</p><strong className="mt-1 block text-2xl text-slate-950">{query.data?.pending.length || 0}</strong></CardContent></Card>
        <Card className="border-slate-100 shadow-sm"><CardContent className="p-4"><p className="text-xs text-slate-500">نقدية منتظرة الاستلام</p><strong className="mt-1 block text-xl text-amber-700">{money(pendingTotal)}</strong></CardContent></Card>
        <Card className="border-slate-100 shadow-sm"><CardContent className="p-4"><p className="text-xs text-slate-500">رصيد خزنة الفرع</p><strong className="mt-1 block text-xl text-emerald-700">{query.data?.safe ? money(query.data.safe.balance) : "—"}</strong><p className="mt-1 truncate text-[11px] text-slate-400">{query.data?.safe?.name || "تُنشأ عند أول استلام عند الحاجة"}</p></CardContent></Card>
      </div>

      <Card className="border-slate-100 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Banknote className="h-5 w-5 text-primary" />تسليمات تنتظر المالية</CardTitle></CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" /> جاري التحميل</div>
          ) : (query.data?.pending || []).length === 0 ? (
            <div className="rounded-2xl border border-dashed py-10 text-center text-sm text-slate-500">لا توجد نقدية ورديات معلقة للتسليم حاليًا.</div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {query.data!.pending.map((row) => {
                const drawerChanged = Math.abs(Number(row.drawer_balance) - Number(row.expected_amount)) >= 0.01;
                return (
                  <div key={row.handoff_id} className={`rounded-2xl border p-4 ${drawerChanged ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/30"}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2"><strong>{row.cashier_name}</strong><Badge variant="outline">{row.device_name}</Badge><Badge className="bg-amber-600">بانتظار الاستلام</Badge></div>
                        <p className="mt-2 text-xs text-slate-500">أُغلقت {new Date(row.closed_at).toLocaleString("ar-EG")}</p>
                      </div>
                      <div className="text-left"><p className="text-xs text-slate-500">تسليم الكاشير</p><strong className="text-xl">{money(row.expected_amount)}</strong></div>
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-white/80 px-3 py-2 text-sm"><span className="text-slate-500">رصيد الدرج بالنظام الآن</span><strong className={drawerChanged ? "text-red-700" : "text-emerald-700"}>{money(row.drawer_balance)}</strong></div>
                    {drawerChanged && <p className="mt-2 text-xs text-red-700">رصيد الدرج اتغير بعد إغلاق الوردية؛ النظام سيمنع الاستلام حتى تتم مراجعة الحركة.</p>}
                    <Button className="mt-4 w-full" disabled={!query.data?.permissions.can_manage || drawerChanged} onClick={() => openReceive(row)}>استلام وتوريد للخزنة</Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {(query.data?.recent || []).length > 0 && (
        <Card className="border-slate-100 shadow-sm">
          <CardHeader><CardTitle className="text-base">آخر التسليمات المستلمة</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead><tr className="border-b text-slate-500"><th className="px-3 py-3 text-right">الكاشير</th><th className="px-3 py-3 text-right">الجهاز</th><th className="px-3 py-3 text-left">المتوقع</th><th className="px-3 py-3 text-left">المستلم</th><th className="px-3 py-3 text-left">الفرق</th><th className="px-3 py-3 text-right">استلمها</th><th className="px-3 py-3 text-right">الوقت</th></tr></thead>
              <tbody>{query.data!.recent.map((row) => <tr key={row.handoff_id} className="border-b last:border-0"><td className="px-3 py-3 font-semibold">{row.cashier_name}</td><td className="px-3 py-3">{row.device_name}</td><td className="px-3 py-3 text-left">{money(row.expected_amount)}</td><td className="px-3 py-3 text-left font-semibold">{money(row.received_amount)}</td><td className={`px-3 py-3 text-left font-semibold ${Math.abs(row.variance_amount) >= 0.01 ? "text-red-700" : "text-emerald-700"}`}>{money(row.variance_amount)}{row.variance_reason && <div className="mt-1 max-w-[220px] text-[11px] font-normal text-slate-500">{row.variance_reason}</div>}</td><td className="px-3 py-3">{row.received_by_name}</td><td className="px-3 py-3">{new Date(row.received_at).toLocaleString("ar-EG")}</td></tr>)}</tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader><DialogTitle>استلام نقدية الوردية</DialogTitle><DialogDescription>{selected?.cashier_name} · {selected?.device_name} · {currentBranchName || "الفرع الحالي"}</DialogDescription></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <Alert className="border-amber-200 bg-amber-50"><Banknote className="h-4 w-4" /><AlertDescription>الكاشير أكد عند الإغلاق أن عهدته النقدية {money(selected.expected_amount)}. عدّ المبلغ الذي استلمته فعليًا قبل التأكيد.</AlertDescription></Alert>

              <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">المتوقع من الكاشير</p><strong>{money(selected.expected_amount)}</strong></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">رصيد الدرج بالنظام</p><strong>{money(selected.drawer_balance)}</strong></div></div>

              <div className="space-y-2"><Label htmlFor="handoff-received">المبلغ المستلم فعليًا</Label><div className="flex gap-2"><Input id="handoff-received" inputMode="decimal" value={receivedAmount} onChange={(event) => setReceivedAmount(event.target.value)} /><Button type="button" variant="outline" onClick={() => setReceivedAmount(expected.toFixed(2))}><Check className="h-4 w-4" /> مطابق</Button></div></div>

              {validAmount && <div className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${hasVariance ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}><span>{hasVariance ? "فرق الاستلام" : "المبلغ مطابق"}</span><strong>{money(variance)}</strong></div>}

              {hasVariance && <div className="space-y-2"><Label htmlFor="handoff-reason" className="flex items-center gap-1"><TriangleAlert className="h-4 w-4" /> سبب الفرق — إجباري</Label><Textarea id="handoff-reason" value={varianceReason} onChange={(event) => setVarianceReason(event.target.value)} placeholder="مثال: عجز أثناء التسليم، خطأ عد تم تأكيده بحضور المسؤول..." /></div>}

              <Alert><ShieldCheck className="h-4 w-4" /><AlertDescription>بعد التأكيد، النظام يسوي أي فرق مسجل بسبب واضح ثم يحول المبلغ المستلم من درج الكاشير إلى خزنة الفرع ذرّيًا. لا يمكن فتح وردية جديدة على الجهاز قبل إنهاء هذا التسليم.</AlertDescription></Alert>
              <Button className="h-12 w-full" disabled={!canSubmit || submitting} onClick={() => void confirmReceive()}>{submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserRoundCheck className="h-4 w-4" />} تأكيد الاستلام والتوريد</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
