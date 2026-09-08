import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, Clock3, CreditCard, RefreshCw, ShoppingCart, WalletCards } from "lucide-react";
import PosShiftReconciliationForm, { reconciliationVariance } from "@/components/POS/PosShiftReconciliationForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useBranchStore } from "@/stores/branchStore";
import {
  getManagerPosShiftReconciliationPreview,
  listBranchPosShifts,
  managerClosePosShiftV2,
  type ManagedPosShift,
} from "@/services/supabase/posShiftManagementService";
import type { PosShiftReconciliationPreview } from "@/services/supabase/posShiftService";

function money(value: number | null | undefined) {
  return `${Number(value || 0).toFixed(2)} ج.م`;
}

function duration(openedAt: string, closedAt?: string | null) {
  const start = new Date(openedAt).getTime();
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const minutes = Math.max(0, Math.floor((end - start) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} س ${rest} د` : `${rest} د`;
}

export default function PosShiftManagement() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const { toast } = useToast();
  const [shifts, setShifts] = useState<ManagedPosShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [selected, setSelected] = useState<ManagedPosShift | null>(null);
  const [reconciliationPreview, setReconciliationPreview] = useState<PosShiftReconciliationPreview | null>(null);
  const [reconciliationValues, setReconciliationValues] = useState<Record<string, string>>({});
  const [reconciliationReasons, setReconciliationReasons] = useState<Record<string, string>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async (quiet = false) => {
    if (!currentBranchId) return;
    if (!quiet) setLoading(true);
    try {
      const rows = await listBranchPosShifts(currentBranchId, filter === "all" ? null : filter);
      setShifts(rows);
    } catch (error: any) {
      if (!quiet) toast({ title: "تعذر تحميل الورديات", description: error.message || "حاول مرة تانية", variant: "destructive" });
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [currentBranchId, filter]);
  useEffect(() => {
    if (!currentBranchId) return;
    const timer = window.setInterval(() => void load(true), 15000);
    return () => window.clearInterval(timer);
  }, [currentBranchId, filter]);

  const openShifts = useMemo(() => shifts.filter(shift => shift.status === "open"), [shifts]);
  const openSalesTotal = useMemo(() => openShifts.reduce((sum, shift) => sum + Number(shift.sales_total || 0), 0), [openShifts]);

  const resetManagerClose = () => {
    setSelected(null);
    setReconciliationPreview(null);
    setReconciliationValues({});
    setReconciliationReasons({});
    setReason("");
  };

  const openManagerClose = async (shift: ManagedPosShift) => {
    setSelected(shift);
    setReconciliationPreview(null);
    setReconciliationValues({});
    setReconciliationReasons({});
    setReason("");
    setPreviewLoading(true);
    try {
      const preview = await getManagerPosShiftReconciliationPreview(shift.id);
      setReconciliationPreview(preview);
    } catch (error: any) {
      toast({ title: "تعذر تجهيز تسوية الوردية", description: error.message || "أعد المحاولة", variant: "destructive" });
      setSelected(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmClose = async () => {
    if (!selected || !reconciliationPreview) return;
    if (reason.trim().length < 3) {
      toast({ title: "اكتب سبب الإغلاق الإداري", variant: "destructive" });
      return;
    }

    const reconciliation = [] as Array<{ code: string; counted_amount: number; variance_reason: string | null }>;
    for (const method of reconciliationPreview.methods) {
      const raw = reconciliationValues[method.code] ?? "";
      const counted = Number(raw);
      if (!raw.trim() || !Number.isFinite(counted) || (method.method_type === "cash" && counted < 0)) {
        toast({ title: `راجع المبلغ الفعلي لـ ${method.name}`, description: "لازم كل وسيلة دفع تتأكد قبل الإغلاق الإداري.", variant: "destructive" });
        return;
      }
      const variance = reconciliationVariance(method.expected_amount, raw);
      const varianceReason = (reconciliationReasons[method.code] || "").trim();
      if (variance !== null && Math.abs(variance) >= 0.01 && varianceReason.length < 3) {
        toast({ title: `اكتب سبب الفرق في ${method.name}`, variant: "destructive" });
        return;
      }
      reconciliation.push({
        code: method.code,
        counted_amount: counted,
        variance_reason: varianceReason || null,
      });
    }

    try {
      setSubmitting(true);
      const result = await managerClosePosShiftV2(selected.id, reconciliation, reason);
      const rows = result.payment_reconciliations || [];
      const absoluteVariance = rows.reduce((sum, row) => sum + Math.abs(Number(row.variance_amount || 0)), 0);
      toast({
        title: "تم إغلاق الوردية إداريًا",
        description: `${selected.employee_name} · تمت مطابقة ${rows.length} وسيلة دفع · إجمالي الفروق ${money(absoluteVariance)}`,
      });
      resetManagerClose();
      await load();
    } catch (error: any) {
      toast({ title: "تعذر إغلاق الوردية", description: error.message || "حاول مرة تانية", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentBranchId) return <Alert><AlertDescription>اختار فرع العمل الأول.</AlertDescription></Alert>;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">ورديات POS</h2>
          <p className="mt-1 text-sm text-muted-foreground">{currentBranchName || "الفرع الحالي"} · متابعة الكاشير والأجهزة وإغلاق الورديات المعلقة بأمان.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> تحديث</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">ورديات مفتوحة</div><div className="mt-1 text-2xl font-black text-[#005931]">{openShifts.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">مبيعات الورديات المفتوحة</div><div className="mt-1 text-xl font-black">{money(openSalesTotal)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">أجهزة مستخدمة الآن</div><div className="mt-1 text-2xl font-black">{new Set(openShifts.map(shift => shift.device_id)).size}</div></CardContent></Card>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {([['all','الكل'],['open','المفتوحة'],['closed','المقفولة']] as const).map(([id,label]) => (
          <Button key={id} variant={filter === id ? "default" : "outline"} className={filter === id ? "bg-[#005931] hover:bg-[#004a29]" : ""} onClick={() => setFilter(id)}>{label}</Button>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">سجل الورديات</CardTitle><CardDescription>الأرقام المعروضة محسوبة من الفواتير وCash Ledger، والإغلاق الإداري الحديث يثبت عهدة كل وسيلة دفع بصورة مستقلة.</CardDescription></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> جاري تحميل الورديات</div>
          ) : shifts.length === 0 ? (
            <div className="rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">مفيش ورديات مطابقة للفِلتر الحالي.</div>
          ) : (
            <div className="space-y-3">
              {shifts.map(shift => {
                const diff = Number(shift.cash_difference || 0);
                return (
                  <div key={shift.id} className={`rounded-2xl border p-4 ${shift.status === "open" ? "border-emerald-200 bg-emerald-50/30" : "bg-white"}`}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">{shift.employee_name}</span>
                          <Badge className={shift.status === "open" ? "bg-emerald-600" : "bg-slate-500"}>{shift.status === "open" ? "مفتوحة" : "مقفولة"}</Badge>
                          <Badge variant="outline">{shift.device_name} · {shift.device_code}</Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {duration(shift.opened_at, shift.closed_at)}</span>
                          <span>بدأت {new Date(shift.opened_at).toLocaleString("ar-EG")}</span>
                          {shift.closed_at && <span>انتهت {new Date(shift.closed_at).toLocaleString("ar-EG")}</span>}
                        </div>
                      </div>
                      {shift.status === "open" && <Button variant="destructive" size="sm" onClick={() => void openManagerClose(shift)}>إغلاق إداري</Button>}
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                      <div className="rounded-xl bg-white p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground"><ShoppingCart className="h-3.5 w-3.5" /> المبيعات</div><strong>{money(shift.sales_total)}</strong><div className="text-[10px] text-muted-foreground">{shift.sales_count} فاتورة</div></div>
                      <div className="rounded-xl bg-white p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground"><Banknote className="h-3.5 w-3.5" /> نقدي</div><strong>{money(shift.cash_sales_total)}</strong></div>
                      <div className="rounded-xl bg-white p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground"><CreditCard className="h-3.5 w-3.5" /> بطاقة قديم</div><strong>{money(shift.card_sales_total)}</strong></div>
                      <div className="rounded-xl bg-white p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground"><WalletCards className="h-3.5 w-3.5" /> الدرج {shift.status === "open" ? "الآن" : "عند الإغلاق"}</div><strong>{money(shift.status === "open" ? shift.drawer_balance : shift.closing_cash)}</strong></div>
                      <div className="rounded-xl bg-white p-3"><div className="text-xs text-muted-foreground">فرق الصندوق</div><strong className={diff === 0 ? "text-slate-900" : diff > 0 ? "text-blue-700" : "text-red-700"}>{shift.status === "open" ? "—" : money(diff)}</strong></div>
                    </div>

                    {shift.closing_notes && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{shift.closing_notes}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open && !submitting) resetManagerClose(); }}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>إغلاق وردية إداريًا</DialogTitle>
            <DialogDescription>{selected?.employee_name} · {selected?.device_name}. الإغلاق الإداري الآن يتطلب مطابقة كل وسيلة دفع، وليس النقد فقط.</DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <Alert className="border-amber-300 bg-amber-50">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>استخدم الإغلاق الإداري فقط لو الكاشير غير قادر يقفل ورديته بنفسه. راجع النقد والمحافظ والبطاقات فعليًا؛ أي فرق في أي وسيلة لازم يتسجل له سبب مستقل.</AlertDescription>
              </Alert>

              {previewLoading ? (
                <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> جاري تجهيز عهدة الوردية</div>
              ) : reconciliationPreview ? (
                <PosShiftReconciliationForm
                  preview={reconciliationPreview}
                  values={reconciliationValues}
                  reasons={reconciliationReasons}
                  onValueChange={(code, value) => setReconciliationValues(current => ({ ...current, [code]: value }))}
                  onReasonChange={(code, value) => setReconciliationReasons(current => ({ ...current, [code]: value }))}
                />
              ) : (
                <Alert variant="destructive"><AlertDescription>تعذر تحميل تفاصيل وسائل الدفع. اقفل النافذة وأعد المحاولة.</AlertDescription></Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="manager-close-reason">سبب الإغلاق الإداري — إجباري</Label>
                <Textarea id="manager-close-reason" value={reason} onChange={event => setReason(event.target.value)} placeholder="مثال: جهاز الكاشير توقف وتمت مراجعة العهدة بحضور المدير" />
              </div>

              <Button variant="destructive" className="h-12 w-full" disabled={submitting || previewLoading || !reconciliationPreview || reason.trim().length < 3} onClick={() => void confirmClose()}>
                {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />} تأكيد المطابقة والإغلاق الإداري
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
