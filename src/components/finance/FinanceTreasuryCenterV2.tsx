import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, Building2, Landmark, Loader2, RefreshCw, ShieldCheck, Vault, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBranchStore } from "@/stores/branchStore";
import {
  delegateLegacySalaryAdvanceSource,
  fetchFinancePayoutSourcesV2,
  fetchFinanceTreasuryWorkspaceV2,
  setFinanceAccountCustodian,
  type FinancePayoutSourceV2,
  type TreasuryCashAccount,
  type TreasuryPaymentAccount,
  type UnlinkedSalaryAdvance,
} from "@/services/supabase/financeTreasuryV2Service";

const money = (value?: number | null) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const dt = (value?: string | null) => value ? new Date(value).toLocaleString("ar-EG") : "—";

function accountTypeLabel(type: string) {
  if (type === "branch_safe") return "خزنة الفرع";
  if (type === "pos_drawer") return "درج كاشير";
  if (type === "online_collection") return "تحصيل أونلاين";
  if (type === "bank") return "حساب بنكي";
  if (type === "gateway_clearing") return "تسوية وسيلة دفع";
  return type;
}

export default function FinanceTreasuryCenterV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [open, setOpen] = useState(false);
  const [linkAdvance, setLinkAdvance] = useState<UnlinkedSalaryAdvance | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [linkReference, setLinkReference] = useState("");

  const query = useQuery({
    queryKey: ["finance-treasury-v2", currentBranchId],
    enabled: Boolean(currentBranchId && open),
    queryFn: () => fetchFinanceTreasuryWorkspaceV2(currentBranchId as string, 120),
    refetchInterval: open ? 20_000 : false,
    refetchOnWindowFocus: true,
  });

  const sourcesQuery = useQuery({
    queryKey: ["finance-payout-sources-v2", currentBranchId, linkAdvance?.advance_id],
    enabled: Boolean(currentBranchId && linkAdvance),
    queryFn: () => fetchFinancePayoutSourcesV2(currentBranchId as string),
    staleTime: 10_000,
  });

  useEffect(() => {
    const openTreasury = () => setOpen(true);
    window.addEventListener("finance:open-treasury", openTreasury);
    return () => window.removeEventListener("finance:open-treasury", openTreasury);
  }, []);

  const data = query.data;
  const cashAccounts = data?.cash_accounts || [];
  const paymentAccounts = data?.payment_accounts || [];
  const staff = data?.eligible_staff || [];
  const canManage = Boolean(data?.permissions.can_manage);

  const totals = useMemo(() => {
    const branchSafe = cashAccounts.filter(a => a.account_type === "branch_safe").reduce((s, a) => s + Number(a.balance || 0), 0);
    const drawers = cashAccounts.filter(a => a.account_type === "pos_drawer").reduce((s, a) => s + Number(a.balance || 0), 0);
    const onlineCash = cashAccounts.filter(a => a.account_type === "online_collection").reduce((s, a) => s + Number(a.balance || 0), 0);
    const banks = paymentAccounts.filter(a => a.account_type === "bank").reduce((s, a) => s + Number(a.balance || 0), 0);
    const clearing = paymentAccounts.filter(a => a.account_type === "gateway_clearing").reduce((s, a) => s + Number(a.balance || 0), 0);
    return { branchSafe, drawers, onlineCash, banks, clearing };
  }, [cashAccounts, paymentAccounts]);

  const custodianMutation = useMutation({
    mutationFn: (input: { accountKind: "cash" | "payment"; accountId: string; userId?: string | null }) => {
      if (!currentBranchId) throw new Error("اختر الفرع أولًا.");
      return setFinanceAccountCustodian({ branchId: currentBranchId, ...input });
    },
    onSuccess: async result => {
      toast.success(result.custodian_user_name ? `تم تعيين ${result.custodian_user_name} مسؤولًا عن ${result.account_name}.` : `تم إلغاء مسؤول ${result.account_name}.`);
      await query.refetch();
    },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر تحديث مسؤول الخزنة"),
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!linkAdvance) throw new Error("السلفة غير محددة.");
      const source = (sourcesQuery.data || []).find(item => item.account_id === sourceId);
      if (!source) throw new Error("اختر مصدر الصرف.");
      if (!source.assignable) throw new Error("مصدر الصرف لا يوجد له مسؤول حاليًا.");
      if (Number(source.balance || 0) + 0.005 < Number(linkAdvance.amount || 0)) throw new Error("رصيد المصدر أقل من قيمة السلفة.");
      if (linkNote.trim().length < 3) throw new Error("اكتب ملاحظة توضح مراجعة مصدر الصرف القديم.");
      return delegateLegacySalaryAdvanceSource({ advanceId: linkAdvance.advance_id, sourceKind: source.source_kind, sourceAccountId: source.account_id, note: linkNote.trim(), reference: linkReference.trim() || linkAdvance.payout_reference || null });
    },
    onSuccess: async result => {
      toast.success(`تم إرسال مهمة مراجعة الصرف إلى ${result.responsible_user_name}. لن يُخصم المبلغ إلا بعد تأكيده.`);
      setLinkAdvance(null); setSourceId(""); setLinkNote(""); setLinkReference("");
      await query.refetch();
    },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر ربط مصدر السلفة"),
  });

  const selectedSource: FinancePayoutSourceV2 | undefined = (sourcesQuery.data || []).find(item => item.account_id === sourceId);

  const renderCashAccount = (account: TreasuryCashAccount) => (
    <div key={account.account_id} className="rounded-2xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex flex-wrap items-center gap-2"><strong>{account.name}</strong><Badge variant="outline">{accountTypeLabel(account.account_type)}</Badge></div><div className="mt-2 text-2xl font-black">{money(account.balance)}</div><div className="mt-1 text-xs text-muted-foreground">آخر حركة: {dt(account.last_movement_at)}</div></div>
        <div className="min-w-[220px] text-sm">
          <div className="mb-1 text-xs font-semibold text-muted-foreground">المسؤول عن العهدة</div>
          {account.account_type === "pos_drawer" ? <div className="rounded-xl bg-slate-50 p-3"><div className="font-bold">{account.responsible_user_name || "لا توجد وردية مفتوحة"}</div><div className="mt-1 text-xs text-muted-foreground">يتحدد تلقائيًا من صاحب الوردية المفتوحة</div></div> : account.account_type === "branch_safe" && canManage ? <Select value={account.responsible_user_id || "__none__"} onValueChange={value => custodianMutation.mutate({ accountKind: "cash", accountId: account.account_id, userId: value === "__none__" ? null : value })} disabled={custodianMutation.isPending}><SelectTrigger><SelectValue placeholder="حدد مسؤول الخزنة" /></SelectTrigger><SelectContent><SelectItem value="__none__">بدون مسؤول</SelectItem>{staff.map(user => <SelectItem key={user.user_id} value={user.user_id}>{user.name}</SelectItem>)}</SelectContent></Select> : <div className="rounded-xl bg-slate-50 p-3 font-bold">{account.responsible_user_name || "غير محدد"}</div>}
        </div>
      </div>
    </div>
  );

  const renderPaymentAccount = (account: TreasuryPaymentAccount) => (
    <div key={account.account_id} className="rounded-2xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex flex-wrap items-center gap-2"><strong>{account.name}</strong><Badge variant="outline">{accountTypeLabel(account.account_type)}</Badge></div><div className="mt-2 text-2xl font-black">{money(account.balance)}</div><div className="mt-1 text-xs text-muted-foreground">آخر حركة: {dt(account.last_movement_at)}</div></div>
        {account.account_type === "bank" ? <div className="min-w-[220px]"><div className="mb-1 text-xs font-semibold text-muted-foreground">المسؤول عن الحساب</div>{canManage ? <Select value={account.responsible_user_id || "__none__"} onValueChange={value => custodianMutation.mutate({ accountKind: "payment", accountId: account.account_id, userId: value === "__none__" ? null : value })} disabled={custodianMutation.isPending}><SelectTrigger><SelectValue placeholder="حدد المسؤول" /></SelectTrigger><SelectContent><SelectItem value="__none__">بدون مسؤول</SelectItem>{staff.map(user => <SelectItem key={user.user_id} value={user.user_id}>{user.name}</SelectItem>)}</SelectContent></Select> : <div className="rounded-xl bg-slate-50 p-3 font-bold">{account.responsible_user_name || "غير محدد"}</div>}</div> : <div className="max-w-[240px] rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-800">حساب تسوية إلكترونية، وليس خزنة صرف. يتم نقله للبنك أو الخزنة من مركز التسويات.</div>}
      </div>
    </div>
  );

  return <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Vault className="h-5 w-5" />مركز الخزن والأرصدة — {currentBranchName || "الفرع الحالي"}</DialogTitle></DialogHeader>
        {!currentBranchId ? <div className="p-8 text-center text-muted-foreground">اختر الفرع أولًا.</div> : query.isLoading ? <div className="flex justify-center p-10"><Loader2 className="h-8 w-8 animate-spin" /></div> : query.isError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">{query.error instanceof Error ? query.error.message : "تعذر تحميل مركز الخزن"}</div> : <div className="space-y-6">
          <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Vault className="h-4 w-4" />خزنة الفرع</div><div className="mt-2 text-xl font-black">{money(totals.branchSafe)}</div></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Banknote className="h-4 w-4" />أدراج الكاشير</div><div className="mt-2 text-xl font-black">{money(totals.drawers)}</div></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><WalletCards className="h-4 w-4" />تحصيل أونلاين نقدي</div><div className="mt-2 text-xl font-black">{money(totals.onlineCash)}</div></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Landmark className="h-4 w-4" />البنوك</div><div className="mt-2 text-xl font-black">{money(totals.banks)}</div></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Building2 className="h-4 w-4" />تسويات إلكترونية</div><div className="mt-2 text-xl font-black">{money(totals.clearing)}</div></CardContent></Card></div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"><strong>قاعدة العهدة:</strong> اختيار خزنة لا يخصم المبلغ. يتم إنشاء مهمة تلقائيًا لمسؤول الخزنة، والخصم من الـLedger يحدث فقط بعد أن يؤكد أنه صرف الفلوس فعليًا. درج الـPOS يتبع الكاشير صاحب الوردية المفتوحة.</div>
          <section className="space-y-3"><div className="flex items-center gap-2"><Vault className="h-5 w-5" /><h3 className="font-black">الخزن النقدية وأدراج الكاشير</h3></div><div className="grid gap-3 lg:grid-cols-2">{cashAccounts.map(renderCashAccount)}</div></section>
          <section className="space-y-3"><div className="flex items-center gap-2"><Landmark className="h-5 w-5" /><h3 className="font-black">البنوك وحسابات التسوية</h3></div><div className="grid gap-3 lg:grid-cols-2">{paymentAccounts.length ? paymentAccounts.map(renderPaymentAccount) : <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">لا توجد حسابات بنكية/تسوية ظاهرة للفرع.</div>}</div></section>
          {(data?.pending_disbursements?.length || 0) > 0 && <section className="space-y-3"><h3 className="font-black">عمليات صرف بانتظار مسؤول الخزنة</h3><div className="space-y-2">{data?.pending_disbursements.map(item => <div key={item.task_id} className="flex flex-col gap-2 rounded-2xl border bg-amber-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-bold">{item.employee_name} · {money(item.amount)}</div><div className="mt-1 text-xs text-muted-foreground">{item.source_account_name} → المسؤول: {item.responsible_user_name}</div></div><Badge variant="outline">{item.status}</Badge></div>)}</div></section>}
          {(data?.unlinked_salary_advances?.length || 0) > 0 && <section className="space-y-3"><div className="flex items-center gap-2 text-amber-800"><AlertTriangle className="h-5 w-5" /><h3 className="font-black">سلف قديمة بدون مصدر صرف</h3></div><div className="space-y-2">{data?.unlinked_salary_advances.map(advance => <div key={advance.advance_id} className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-black">{advance.employee_name} · {money(advance.amount)}</div><div className="mt-1 text-xs text-amber-800">مصروفة بتاريخ {dt(advance.paid_at)} لكن لا يوجد قيد يوضح خرجت من أي خزنة. المرجع: {advance.payout_reference || "—"}</div></div>{canManage && <Button size="sm" variant="outline" onClick={() => { setLinkAdvance(advance); setSourceId(""); setLinkNote(""); setLinkReference(advance.payout_reference || ""); }}>تحديد المصدر ومراجعته</Button>}</div>)}</div></section>}
          <section className="space-y-3"><h3 className="font-black">آخر الحركات على الخزن والحسابات</h3><div className="max-h-72 space-y-2 overflow-y-auto">{(data?.recent_movements || []).map(item => <div key={`${item.ledger_kind}-${item.id}`} className="flex items-start justify-between gap-3 rounded-xl border p-3"><div><div className="font-semibold">{item.account_name}</div><div className="mt-1 text-xs text-muted-foreground">{item.description || item.entry_type} · {dt(item.created_at)}{item.actor_name ? ` · ${item.actor_name}` : ""}</div></div><div className={`font-black ${Number(item.signed_amount) < 0 ? "text-red-700" : "text-emerald-700"}`}>{Number(item.signed_amount) > 0 ? "+" : ""}{money(item.signed_amount)}</div></div>)}{(data?.recent_movements || []).length === 0 && <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">لا توجد حركات مسجلة.</div>}</div></section>
        </div>}
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(linkAdvance)} onOpenChange={value => { if (!value) setLinkAdvance(null); }}>
      <DialogContent dir="rtl" className="max-w-xl"><DialogHeader><DialogTitle>تسوية مصدر صرف سلفة سابقة</DialogTitle></DialogHeader>{linkAdvance && <div className="space-y-4"><div className="rounded-2xl border bg-amber-50 p-4"><div className="font-black">{linkAdvance.employee_name}</div><div className="mt-2 text-2xl font-black">{money(linkAdvance.amount)}</div><p className="mt-2 text-xs text-amber-800">لن يتم الخصم الآن. بعد اختيار المصدر ستصل مهمة لمسؤول الخزنة، وعند تأكيده فقط يتسجل قيد الخروج.</p></div><div className="space-y-2"><Label>مصدر الصرف الحقيقي</Label><Select value={sourceId} onValueChange={setSourceId}><SelectTrigger><SelectValue placeholder={sourcesQuery.isLoading ? "جاري تحميل الخزن..." : "اختر الخزنة/الدرج/البنك"} /></SelectTrigger><SelectContent>{(sourcesQuery.data || []).map(source => <SelectItem key={source.account_id} value={source.account_id} disabled={!source.assignable || Number(source.balance || 0) + 0.005 < Number(linkAdvance.amount || 0)}>{source.name} · {money(source.balance)} · {source.responsible_user_name || "بدون مسؤول"}</SelectItem>)}</SelectContent></Select>{selectedSource && <div className="rounded-xl bg-slate-50 p-3 text-xs"><div>المسؤول: <strong>{selectedSource.responsible_user_name || "غير محدد"}</strong></div><div className="mt-1">الرصيد الحالي: <strong>{money(selectedSource.balance)}</strong></div></div>}</div><div className="space-y-2"><Label>مرجع الصرف</Label><Input value={linkReference} onChange={e => setLinkReference(e.target.value)} placeholder="مرجع/سند/رقم تحويل" /></div><div className="space-y-2"><Label>ملاحظة المراجعة</Label><Textarea rows={4} value={linkNote} onChange={e => setLinkNote(e.target.value)} placeholder="اكتب كيف تأكدت أن هذا هو مصدر الصرف الصحيح..." /></div></div>}<DialogFooter className="gap-2 sm:justify-start"><Button variant="outline" onClick={() => setLinkAdvance(null)} disabled={linkMutation.isPending}>إلغاء</Button><Button onClick={() => linkMutation.mutate()} disabled={linkMutation.isPending || !sourceId}>{linkMutation.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="ml-2 h-4 w-4" />}إرسال لمسؤول الخزنة</Button></DialogFooter></DialogContent>
    </Dialog>
  </>;
}
