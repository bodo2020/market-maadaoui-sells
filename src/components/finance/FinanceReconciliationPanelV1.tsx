import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, WalletCards } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  fetchFinanceReconciliationControl,
  repairOnlineOrderFinancialLedger,
  type FinanceReconciliationIssue,
} from "@/services/supabase/financeReconciliationV1Service";

const money = (value?: number | null) =>
  `${Number(value || 0).toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ج.م`;

const dt = (value?: string | null) =>
  value ? new Date(value).toLocaleString("ar-EG") : "—";

const severityMeta = (severity: string) => {
  if (severity === "critical") {
    return {
      label: "حرج",
      badge: "bg-red-100 text-red-800 hover:bg-red-100",
      border: "border-red-200",
      icon: ShieldAlert,
    };
  }
  if (severity === "high") {
    return {
      label: "مرتفع",
      badge: "bg-amber-100 text-amber-900 hover:bg-amber-100",
      border: "border-amber-200",
      icon: AlertTriangle,
    };
  }
  return {
    label: "متابعة",
    badge: "bg-blue-100 text-blue-800 hover:bg-blue-100",
    border: "border-blue-200",
    icon: AlertCircle,
  };
};

export default function FinanceReconciliationPanelV1({ branchId }: { branchId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [repairIssue, setRepairIssue] = useState<FinanceReconciliationIssue | null>(null);

  const query = useQuery({
    queryKey: ["finance-reconciliation-v1", branchId],
    enabled: Boolean(branchId),
    queryFn: () => fetchFinanceReconciliationControl(branchId, 100),
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const repairMutation = useMutation({
    mutationFn: (issue: FinanceReconciliationIssue) =>
      repairOnlineOrderFinancialLedger(
        issue.source_id,
        `إصلاح مصالحة مالية: ${issue.issue_type}`,
      ),
    onSuccess: async () => {
      toast.success("تم إصلاح قيد الـLedger", {
        description: "تم إنشاء القيد المالي الناقص بشكل idempotent وإعادة فحص المصالحة.",
      });
      setRepairIssue(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance-reconciliation-v1", branchId] }),
        queryClient.invalidateQueries({ queryKey: ["finance-control-center-v2", branchId] }),
      ]);
    },
    onError: (error) => {
      toast.error("تعذر إصلاح القيد", {
        description: error instanceof Error ? error.message : "راجع البيانات وحاول مرة أخرى.",
      });
    },
  });

  const data = query.data;
  const summary = data?.summary;

  const visibleIssues = useMemo(() => data?.issues || [], [data?.issues]);

  if (!branchId) return null;

  if (query.isLoading) {
    return <div className="h-36 animate-pulse rounded-2xl bg-slate-100" />;
  }

  if (query.isError) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div>
            <div className="font-black text-red-900">تعذر فحص المصالحة المالية</div>
            <p className="mt-1 text-xs text-red-700">
              {query.error instanceof Error ? query.error.message : "حدث خطأ غير متوقع."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            <RefreshCw className="ml-2 h-4 w-4" />
            إعادة المحاولة
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data || !summary) return null;

  const clean = summary.attention_count === 0;

  return (
    <>
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-950">المصالحة المالية</h2>
              <Badge variant="outline">M18</Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              مقارنة تلقائية بين الطلبات والـPOS والتحصيلات والتسويات والـLedger لكشف أي مبلغ ناقص أو معلق.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            إعادة الفحص
          </Button>
        </div>

        {clean ? (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <div className="font-black">المصالحة سليمة حاليًا</div>
              <p className="mt-1 text-xs leading-5 text-emerald-800">
                لا توجد فروق Ledger أو توريدات/Refunds/Settlements معلقة ضمن نطاق التدقيق الموثوق.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card className={summary.critical_count ? "border-red-200 bg-red-50/40" : ""}>
                <CardContent className="p-4">
                  <p className="text-xs font-bold text-slate-500">بنود تحتاج مراجعة</p>
                  <div className="mt-2 text-2xl font-black">{summary.attention_count}</div>
                  <p className="mt-1 text-xs text-slate-500">منها {summary.critical_count} حرج</p>
                </CardContent>
              </Card>
              <Card className={summary.online_missing_count ? "border-amber-200 bg-amber-50/40" : ""}>
                <CardContent className="p-4">
                  <p className="text-xs font-bold text-slate-500">تحصيل أونلاين خارج الـLedger</p>
                  <div className="mt-2 text-2xl font-black">{money(summary.online_missing_amount)}</div>
                  <p className="mt-1 text-xs text-slate-500">{summary.online_missing_count} طلب</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-bold text-slate-500">توريدات معلقة</p>
                  <div className="mt-2 text-2xl font-black">{money(summary.pending_handoff_amount)}</div>
                  <p className="mt-1 text-xs text-slate-500">{summary.pending_handoff_count} عملية</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-bold text-slate-500">تسويات إلكترونية معلقة</p>
                  <div className="mt-2 text-2xl font-black">{money(summary.pending_settlement_amount)}</div>
                  <p className="mt-1 text-xs text-slate-500">{summary.pending_settlement_count} عملية</p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-2">
              {visibleIssues.map((issue) => {
                const meta = severityMeta(issue.severity);
                const Icon = meta.icon;
                const canOpenOrder = issue.source_kind === "online_order";
                const canRepair =
                  issue.action === "repair_online_ledger" &&
                  issue.can_repair &&
                  data.permissions.can_manage;

                return (
                  <Card key={`${issue.issue_type}-${issue.source_id}`} className={meta.border}>
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-black text-slate-950">{issue.title}</div>
                              <Badge className={meta.badge}>{meta.label}</Badge>
                            </div>
                            <p className="mt-1 text-sm leading-6 text-slate-600">{issue.description}</p>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                              <span>{dt(issue.occurred_at)}</span>
                              {Number(issue.amount || 0) > 0 && (
                                <span className="font-bold text-slate-800">{money(issue.amount)}</span>
                              )}
                              <span>{issue.issue_type}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          {canOpenOrder && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/online-orders/${issue.source_id}`)}
                            >
                              فتح الطلب
                            </Button>
                          )}
                          {canRepair && (
                            <Button
                              size="sm"
                              className="bg-[#005931] hover:bg-[#004426]"
                              onClick={() => setRepairIssue(issue)}
                            >
                              <WalletCards className="ml-2 h-4 w-4" />
                              إصلاح الـLedger
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {data.data_quality?.legacy_without_receipt_excluded && (
          <p className="text-[11px] leading-5 text-slate-400">
            التدقيق المالي الآلي يعتمد الطلبات الحديثة أو الطلبات التي لديها سجل Receipt موثوق؛ بيانات Legacy القديمة غير الموثقة لا تُنشئ قيودًا تلقائيًا.
          </p>
        )}
      </section>

      <AlertDialog open={Boolean(repairIssue)} onOpenChange={(open) => !open && setRepairIssue(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle>تأكيد إصلاح القيد المالي</AlertDialogTitle>
            <AlertDialogDescription className="text-right leading-6">
              سيضيف النظام قيد التحصيل الناقص لهذا الطلب إلى الـLedger. العملية idempotent ولن تُنشئ قيدًا مكررًا.
              {repairIssue ? ` المبلغ المتوقع: ${money(repairIssue.amount)}.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel disabled={repairMutation.isPending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={!repairIssue || repairMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (repairIssue) repairMutation.mutate(repairIssue);
              }}
              className="bg-[#005931] hover:bg-[#004426]"
            >
              {repairMutation.isPending ? "جاري الإصلاح…" : "تأكيد الإصلاح"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
