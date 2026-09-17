import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  RefreshCw,
  ReceiptText,
  WalletCards,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  accrueFranchisePeriod,
  approveFranchiseSettlement,
  cancelFranchiseSettlement,
  createFranchiseSettlement,
  fetchFranchiseFinanceWorkspace,
  markFranchiseSettlementPaid,
  type FranchiseFinancialEntry,
  type FranchiseSettlement,
} from "@/services/supabase/franchiseFinanceService";
import { toast } from "sonner";

interface Props {
  merchantId: string;
  fallbackCurrency?: string;
}

type SettlementAction =
  | { type: "approve"; settlement: FranchiseSettlement }
  | { type: "pay"; settlement: FranchiseSettlement }
  | { type: "cancel"; settlement: FranchiseSettlement };

const settlementStatus: Record<string, { label: string; className: string }> = {
  draft: { label: "مسودة", className: "border-slate-200 bg-slate-50 text-slate-700" },
  approved: { label: "معتمدة", className: "border-blue-200 bg-blue-50 text-blue-700" },
  paid: { label: "مدفوعة", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  cancelled: { label: "ملغاة", className: "border-red-200 bg-red-50 text-red-700" },
};

const entryLabels: Record<string, string> = {
  franchise_royalty: "Royalty",
  franchise_marketing_fee: "Marketing Fee",
  franchise_platform_fee: "Platform Fee",
  franchise_fixed_fee: "Monthly Fixed Fee",
  franchise_adjustment: "قيد يدوي",
};

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startIso(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function endIso(value: string) {
  return new Date(`${value}T23:59:59.999`).toISOString();
}

function money(value: number | null | undefined, currency: string) {
  return new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: currency || "EGP",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function number(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-[11px] font-bold text-slate-400">{hint}</p> : null}
    </div>
  );
}

function entrySource(entry: FranchiseFinancialEntry) {
  if (entry.source_kind === "pos_sale") return "POS";
  if (entry.source_kind === "online_order") return "Online";
  if (entry.source_kind === "periodic_fee") return "دوري";
  if (entry.source_kind === "manual_adjustment") return "يدوي";
  return entry.source_kind || "—";
}

export default function FranchiseFinancePanel({ merchantId, fallbackCurrency = "EGP" }: Props) {
  const queryClient = useQueryClient();
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => dateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(() => dateInputValue(today));
  const [action, setAction] = useState<SettlementAction | null>(null);
  const [note, setNote] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const period = useMemo(() => ({ start: startIso(from), end: endIso(to) }), [from, to]);
  const queryKey = ["franchise-finance", merchantId, period.start, period.end];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchFranchiseFinanceWorkspace(merchantId, period.start, period.end),
    staleTime: 15_000,
    refetchInterval: 45_000,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["franchise-finance", merchantId] });
  };

  const accrueMutation = useMutation({
    mutationFn: () => accrueFranchisePeriod(merchantId, period.start, period.end),
    onSuccess: async (result) => {
      toast.success(
        `تمت مراجعة الفترة: ${result.pos_sales_scanned} POS + ${result.online_orders_scanned} Online، ورسوم ثابتة ${result.fixed_fees_posted}`,
      );
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر ترحيل المستحقات"),
  });

  const createSettlementMutation = useMutation({
    mutationFn: () => createFranchiseSettlement(merchantId, period.start, period.end),
    onSuccess: async (result) => {
      toast.success(`تم إنشاء التسوية ${result.reference}`);
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر إنشاء التسوية"),
  });

  const settlementMutation = useMutation({
    mutationFn: async (current: SettlementAction) => {
      if (current.type === "approve") {
        return approveFranchiseSettlement(current.settlement.id, note.trim() || null);
      }
      if (current.type === "pay") {
        if (!paymentReference.trim()) throw new Error("رقم مرجع الدفع مطلوب.");
        return markFranchiseSettlementPaid(
          current.settlement.id,
          paymentReference.trim(),
          note.trim() || null,
        );
      }
      if (!cancelReason.trim()) throw new Error("سبب إلغاء التسوية مطلوب.");
      return cancelFranchiseSettlement(current.settlement.id, cancelReason.trim());
    },
    onSuccess: async () => {
      toast.success(action?.type === "pay" ? "تم تسجيل التسوية كمدفوعة" : action?.type === "cancel" ? "تم إلغاء التسوية وإعادة القيود للرصيد المفتوح" : "تم اعتماد التسوية");
      setAction(null);
      setNote("");
      setPaymentReference("");
      setCancelReason("");
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث التسوية"),
  });

  const data = query.data;
  const currency = data?.agreement?.currency || fallbackCurrency;
  const unaccrued = Number(data?.sales.unaccrued_pos_count || 0) + Number(data?.sales.unaccrued_online_count || 0);
  const unsettled = Number(data?.fees.unsettled_balance || 0);
  const balanceLabel = data?.fees.balance_direction === "merchant_owes_platform"
    ? "مستحق للمنصة من الـFranchise"
    : data?.fees.balance_direction === "platform_owes_merchant"
      ? "مستحق للـFranchise من المنصة"
      : "الرصيد متوازن";

  return (
    <>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg font-black">
                <WalletCards className="h-5 w-5 text-[#005931]" />
                المالية والتسويات
              </CardTitle>
              <p className="mt-1 text-xs font-bold text-slate-400">
                Subledger موحد للـRoyalty والـMarketing والـPlatform والرسوم الثابتة، مع Snapshot للعقد وقت الاستحقاق.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
                <RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
                تحديث
              </Button>
              <Button
                variant="outline"
                disabled={accrueMutation.isPending || query.isLoading}
                onClick={() => accrueMutation.mutate()}
              >
                <Calculator className="ml-2 h-4 w-4" />
                {accrueMutation.isPending ? "جارٍ المراجعة…" : "Accrue الفترة"}
              </Button>
              <Button
                className="bg-[#005931] hover:bg-[#004a29]"
                disabled={createSettlementMutation.isPending || query.isLoading}
                onClick={() => createSettlementMutation.mutate()}
              >
                <FileCheck2 className="ml-2 h-4 w-4" />
                {createSettlementMutation.isPending ? "جارٍ الإنشاء…" : "إنشاء Settlement"}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:w-[520px]">
            <div className="space-y-1.5">
              <Label>من</Label>
              <Input type="date" dir="ltr" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>إلى</Label>
              <Input type="date" dir="ltr" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {query.isLoading ? (
            <div className="grid min-h-[180px] place-items-center text-sm font-bold text-slate-400">
              <RefreshCw className="mb-2 h-5 w-5 animate-spin text-[#005931]" />
              جارٍ تحميل البيانات المالية…
            </div>
          ) : query.error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-800">
              {query.error instanceof Error ? query.error.message : "تعذر تحميل البيانات المالية"}
            </div>
          ) : data ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <Metric label="أساس الرسوم" value={money(data.sales.total_fee_basis, currency)} hint={`${number(data.sales.pos_count)} POS • ${number(data.sales.online_delivered_count)} Online`} />
                <Metric label="Royalty" value={money(data.fees.royalty, currency)} />
                <Metric label="Marketing" value={money(data.fees.marketing, currency)} />
                <Metric label="Platform" value={money(data.fees.platform, currency)} />
                <Metric label="Fixed Fee" value={money(data.fees.fixed, currency)} />
                <Metric label="الرصيد المفتوح" value={money(Math.abs(unsettled), currency)} hint={balanceLabel} />
              </div>

              <div className={`flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center md:justify-between ${unaccrued > 0 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
                <div className="flex items-start gap-3">
                  {unaccrued > 0 ? <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />}
                  <div>
                    <p className={`text-sm font-black ${unaccrued > 0 ? "text-amber-900" : "text-emerald-900"}`}>
                      {unaccrued > 0 ? `${unaccrued.toLocaleString("ar-EG")} عملية تحتاج Accrual` : "كل مبيعات الفترة تم ترحيل رسومها"}
                    </p>
                    <p className={`mt-1 text-xs font-bold ${unaccrued > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                      POS غير مُرحل: {data.sales.unaccrued_pos_count.toLocaleString("ar-EG")} • Online غير مُرحل: {data.sales.unaccrued_online_count.toLocaleString("ar-EG")}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="w-fit bg-white text-slate-700">
                  رصيد الفترة: {money(data.fees.period_balance, currency)}
                </Badge>
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><ReceiptText className="h-4 w-4 text-[#005931]" />آخر القيود المالية</h3>
                    <span className="text-[11px] font-bold text-slate-400">آخر {Math.min(data.entries.length, 12).toLocaleString("ar-EG")}</span>
                  </div>
                  {data.entries.length ? data.entries.slice(0, 12).map((entry) => (
                    <div key={entry.id} className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-slate-800">{entryLabels[entry.entry_type] || entry.entry_type}</span>
                          <Badge variant="outline" className="text-[10px]">{entrySource(entry)}</Badge>
                          <Badge variant="outline" className={entry.settled ? "border-emerald-200 text-emerald-700" : "border-amber-200 text-amber-700"}>{entry.settled ? "Settled" : "Open"}</Badge>
                        </div>
                        <p className="mt-1 text-[11px] font-bold text-slate-400">{new Date(entry.occurred_at).toLocaleString("ar-EG")}</p>
                      </div>
                      <span className={`text-sm font-black ${Number(entry.signed_amount) < 0 ? "text-red-700" : "text-emerald-700"}`}>{money(entry.signed_amount, entry.currency || currency)}</span>
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-400">لا توجد قيود مالية حتى الآن.</div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><CircleDollarSign className="h-4 w-4 text-[#005931]" />التسويات</h3>
                    <span className="text-[11px] font-bold text-slate-400">آخر {data.settlements.length.toLocaleString("ar-EG")}</span>
                  </div>
                  {data.settlements.length ? data.settlements.map((settlement) => {
                    const status = settlementStatus[settlement.status] || settlementStatus.draft;
                    return (
                      <div key={settlement.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-black text-slate-900">{settlement.reference}</span>
                              <Badge variant="outline" className={status.className}>{status.label}</Badge>
                            </div>
                            <p className="mt-1 text-[11px] font-bold text-slate-400">
                              {settlement.period_start ? new Date(settlement.period_start).toLocaleDateString("ar-EG") : "—"} → {new Date(settlement.period_end).toLocaleDateString("ar-EG")}
                            </p>
                            {settlement.external_reference ? <p className="mt-1 text-[11px] font-bold text-emerald-700">مرجع الدفع: {settlement.external_reference}</p> : null}
                          </div>
                          <div className="text-left">
                            <p className="text-[10px] font-black text-slate-400">صافي التسوية</p>
                            <p className={`text-base font-black ${Number(settlement.net_payable) < 0 ? "text-red-700" : "text-emerald-700"}`}>{money(settlement.net_payable, settlement.currency || currency)}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {settlement.status === "draft" ? (
                            <Button size="sm" className="bg-[#005931] hover:bg-[#004a29]" onClick={() => setAction({ type: "approve", settlement })}>
                              <CheckCircle2 className="ml-1.5 h-4 w-4" />اعتماد
                            </Button>
                          ) : null}
                          {settlement.status === "approved" ? (
                            <Button size="sm" className="bg-[#005931] hover:bg-[#004a29]" onClick={() => setAction({ type: "pay", settlement })}>
                              <Banknote className="ml-1.5 h-4 w-4" />تسجيل الدفع
                            </Button>
                          ) : null}
                          {settlement.status === "draft" || settlement.status === "approved" ? (
                            <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => setAction({ type: "cancel", settlement })}>
                              <XCircle className="ml-1.5 h-4 w-4" />إلغاء
                            </Button>
                          ) : null}
                          {settlement.status === "paid" && settlement.paid_at ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{new Date(settlement.paid_at).toLocaleString("ar-EG")}</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-400">لم يتم إنشاء تسويات بعد.</div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={!!action} onOpenChange={(open) => {
        if (!open) {
          setAction(null);
          setNote("");
          setPaymentReference("");
          setCancelReason("");
        }
      }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {action?.type === "approve" ? "اعتماد التسوية" : action?.type === "pay" ? "تسجيل دفع التسوية" : "إلغاء التسوية"}
            </DialogTitle>
            <DialogDescription>
              {action?.type === "cancel"
                ? "إلغاء التسوية سيعيد قيودها إلى الرصيد المفتوح لتدخل في تسوية لاحقة."
                : action?.type === "pay"
                  ? "سجل مرجع التحويل أو الإيداع الفعلي. لا يتم تغيير القيود التاريخية."
                  : "بعد الاعتماد تصبح التسوية جاهزة لتسجيل الدفع."}
            </DialogDescription>
          </DialogHeader>

          {action ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-black text-slate-900">{action.settlement.reference}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{new Date(action.settlement.period_end).toLocaleDateString("ar-EG")}</p></div>
                <span className="font-black text-slate-900">{money(action.settlement.net_payable, action.settlement.currency || currency)}</span>
              </div>
            </div>
          ) : null}

          {action?.type === "pay" ? (
            <div className="space-y-2"><Label>مرجع الدفع *</Label><Input dir="ltr" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="BANK-TRX-..." /></div>
          ) : null}
          {action?.type === "cancel" ? (
            <div className="space-y-2"><Label>سبب الإلغاء *</Label><Input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="سبب واضح للمراجعة والتدقيق" /></div>
          ) : (
            <div className="space-y-2"><Label>ملاحظة</Label><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="اختياري" /></div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>رجوع</Button>
            <Button
              variant={action?.type === "cancel" ? "destructive" : "default"}
              className={action?.type !== "cancel" ? "bg-[#005931] hover:bg-[#004a29]" : ""}
              disabled={settlementMutation.isPending}
              onClick={() => action && settlementMutation.mutate(action)}
            >
              {settlementMutation.isPending ? <><Clock3 className="ml-2 h-4 w-4 animate-spin" />جارٍ التنفيذ…</> : action?.type === "approve" ? "اعتماد" : action?.type === "pay" ? "تأكيد الدفع" : "إلغاء التسوية"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
