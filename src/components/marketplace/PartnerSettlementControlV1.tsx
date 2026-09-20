import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleDollarSign, RefreshCw, ShieldCheck, WalletCards, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  approveMarketplaceSettlementV1,
  cancelMarketplaceSettlementV1,
  createMarketplaceSettlementV2,
  fetchMarketplaceSettlementControlV1,
  markMarketplaceSettlementPaidV1,
  MarketplaceSettlementControlRowV1,
} from "@/services/supabase/marketplaceAdminService";

const money = (value?: number | null, currency = "EGP") =>
  `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === "EGP" ? "ج.م" : currency}`;

const dt = (value?: string | null) => value ? new Date(value).toLocaleString("ar-EG") : "—";

const statusLabel: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمدة",
  paid: "مدفوعة",
  cancelled: "ملغاة",
};

const entryLabel: Record<string, string> = {
  order_gross: "إجمالي المبيعات",
  commission: "عمولة المنصة",
  payment_fee: "رسوم الدفع",
  delivery_contribution: "مساهمة التوصيل",
  refund: "مرتجعات",
  adjustment: "تسوية يدوية",
  payout_adjustment: "تعديل مستحق",
};

function SettlementRow({ row, busy, onApprove, onPaid, onCancel }: {
  row: MarketplaceSettlementControlRowV1;
  busy: boolean;
  onApprove: () => void;
  onPaid: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <strong className="font-mono text-sm">{row.reference}</strong>
            <Badge variant="outline" className={row.status === "paid" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : row.status === "cancelled" ? "border-red-200 bg-red-50 text-red-700" : row.status === "approved" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-amber-200 bg-amber-50 text-amber-800"}>
              {statusLabel[row.status] || row.status}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">{dt(row.period_start)} — {dt(row.period_end)} · {Number(row.entry_count || 0).toLocaleString("ar-EG")} قيد</p>
        </div>
        <div className="text-left">
          <div className="text-xs text-slate-500">صافي المستحق</div>
          <div className={`text-xl font-black ${row.net_payable < 0 ? "text-red-700" : "text-emerald-800"}`}>{money(row.net_payable, row.currency)}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">إجمالي دائن</div><strong>{money(row.gross_credits, row.currency)}</strong></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">الاستقطاعات</div><strong>{money(row.total_deductions, row.currency)}</strong></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">مرجع الدفع</div><strong className="break-all">{row.external_reference || "—"}</strong></div>
      </div>

      {Object.keys(row.breakdown || {}).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(row.breakdown).map(([key, value]) => <Badge key={key} variant="outline">{entryLabel[key] || key}: {money(value, row.currency)}</Badge>)}
        </div>
      )}

      {row.cancellation_reason && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">سبب الإلغاء: {row.cancellation_reason}</div>}

      <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
        {row.status === "draft" && <Button size="sm" className="bg-[#005931] hover:bg-[#004426]" disabled={busy} onClick={onApprove}><CheckCircle2 className="ml-1 h-4 w-4" />اعتماد</Button>}
        {row.status === "approved" && <Button size="sm" className="bg-blue-700 hover:bg-blue-800" disabled={busy} onClick={onPaid}><WalletCards className="ml-1 h-4 w-4" />تسجيل الدفع</Button>}
        {(row.status === "draft" || row.status === "approved") && <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" disabled={busy} onClick={onCancel}><XCircle className="ml-1 h-4 w-4" />إلغاء</Button>}
        {row.status === "paid" && <span className="flex items-center gap-1 text-xs font-bold text-emerald-700"><ShieldCheck className="h-4 w-4" />تم الدفع {dt(row.paid_at)}</span>}
      </div>
    </div>
  );
}

export default function PartnerSettlementControlV1({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["marketplace-partner-settlements", merchantId];
  const query = useQuery({
    queryKey,
    queryFn: () => fetchMarketplaceSettlementControlV1(merchantId),
    enabled: Boolean(merchantId),
    staleTime: 10_000,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["marketplace-merchant", merchantId] }),
      queryClient.invalidateQueries({ queryKey: ["marketplace-admin-dashboard"] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: () => createMarketplaceSettlementV2(merchantId),
    onSuccess: async (result) => { toast.success(`تم إنشاء ${result.reference} كمسودة`); await refresh(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر إنشاء التسوية"),
  });
  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string | null }) => approveMarketplaceSettlementV1(id, note),
    onSuccess: async () => { toast.success("تم اعتماد التسوية"); await refresh(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر اعتماد التسوية"),
  });
  const paidMutation = useMutation({
    mutationFn: ({ id, reference, note }: { id: string; reference: string; note?: string | null }) => markMarketplaceSettlementPaidV1(id, reference, note),
    onSuccess: async () => { toast.success("تم تسجيل دفع مستحق الشريك"); await refresh(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تسجيل الدفع"),
  });
  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelMarketplaceSettlementV1(id, reason),
    onSuccess: async (result) => { toast.success(`تم إلغاء التسوية وتحرير ${result.released_entries} قيد`); await refresh(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر إلغاء التسوية"),
  });

  const busy = createMutation.isPending || approveMutation.isPending || paidMutation.isPending || cancelMutation.isPending;
  const preview = query.data?.preview;

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-lg"><CircleDollarSign className="h-5 w-5 text-[#005931]" />تسوية مستحقات الشريك</CardTitle>
            <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className={`ml-1 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
          </div>
        </CardHeader>
        <CardContent>
          {query.isLoading && <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />}
          {query.isError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{query.error instanceof Error ? query.error.message : "تعذر تحميل التسويات"}</div>}
          {preview && <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">قيود جاهزة</div><strong className="text-xl">{Number(preview.entry_count).toLocaleString("ar-EG")}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">المبيعات</div><strong>{money(preview.gross_credits)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">الاستقطاعات</div><strong>{money(preview.total_deductions)}</strong></div>
              <div className="rounded-xl bg-emerald-50 p-3"><div className="text-xs text-emerald-800">الصافي</div><strong className="text-xl text-emerald-950">{money(preview.net_payable)}</strong></div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
              <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>إنشاء المسودة يحجز القيود داخل Settlement واحدة. الدفع لا يُسجل إلا بعد الاعتماد وإدخال مرجع التحويل.</span></div>
              <Button className="bg-[#005931] hover:bg-[#004426]" disabled={!preview.eligible || busy} onClick={() => {
                if (window.confirm(`إنشاء تسوية تشمل ${preview.entry_count} قيد بصافي ${money(preview.net_payable)}؟`)) createMutation.mutate();
              }}>{createMutation.isPending ? "جاري الإنشاء..." : "إنشاء مسودة تسوية"}</Button>
            </div>
            {!preview.eligible && <div className="mt-3 flex items-center gap-2 text-sm text-slate-500"><AlertTriangle className="h-4 w-4" />لا توجد قيود مالية غير مسواة حاليًا.</div>}
          </>}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {(query.data?.settlements || []).map((row) => (
          <SettlementRow
            key={row.id}
            row={row}
            busy={busy}
            onApprove={() => {
              const note = window.prompt("ملاحظة الاعتماد (اختياري)", "تمت مراجعة القيود والمستحق");
              if (note !== null) approveMutation.mutate({ id: row.id, note });
            }}
            onPaid={() => {
              const reference = window.prompt("مرجع التحويل أو الدفع");
              if (!reference?.trim()) return;
              const note = window.prompt("ملاحظة الدفع (اختياري)", "تم تحويل مستحق الشريك");
              if (note !== null) paidMutation.mutate({ id: row.id, reference, note });
            }}
            onCancel={() => {
              const reason = window.prompt("سبب إلغاء التسوية (مطلوب)");
              if (reason?.trim()) cancelMutation.mutate({ id: row.id, reason });
            }}
          />
        ))}
        {query.data && query.data.settlements.length === 0 && <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">لا توجد تسويات للشريك حتى الآن.</div>}
      </div>
    </div>
  );
}
