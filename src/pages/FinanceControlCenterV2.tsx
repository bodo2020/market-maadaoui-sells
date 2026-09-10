import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  Building2,
  History,
  Landmark,
  RefreshCw,
  ReceiptText,
  UserRound,
  Vault,
  WalletCards,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useBranchStore } from "@/stores/branchStore";
import { fetchFinanceControlCenterV2 } from "@/services/supabase/financeControlCenterV2Service";

const money = (value?: number | null) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const dt = (value?: string | null) => value ? new Date(value).toLocaleString("ar-EG") : "—";

function accountTypeLabel(type: string) {
  if (type === "branch_safe") return "خزنة الفرع";
  if (type === "pos_drawer") return "درج POS";
  if (type === "online_collection") return "تحصيل أونلاين";
  if (type === "bank") return "بنك";
  if (type === "gateway_clearing") return "تسوية إلكترونية";
  return type;
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    draft: "مسودة",
    submitted: "تحت المراجعة",
    hr_approved: "اعتماد HR",
    locked: "مقفل وجاهز للصرف",
    paid: "مدفوع",
    active: "نشطة",
    settled: "مسددة",
    claimed: "بانتظار المسؤول",
    in_progress: "قيد التنفيذ",
    completed: "مكتملة",
    failed: "مرفوضة/متعذرة",
  };
  return map[status] || status;
}

function SummaryCard({ title, value, note, icon: Icon, danger = false }: { title: string; value: string; note: string; icon: React.ElementType; danger?: boolean }) {
  return (
    <Card className={danger ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white"}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500">{title}</p>
            <div className={`mt-2 text-2xl font-black ${danger ? "text-red-700" : "text-slate-950"}`}>{value}</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p>
          </div>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${danger ? "bg-red-100 text-red-700" : "bg-emerald-50 text-[#005931]"}`}>
            <Icon className="h-5 w-5" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FinanceControlCenterV2() {
  const navigate = useNavigate();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const branchId = currentBranchId || localStorage.getItem("currentBranchId") || "";

  const query = useQuery({
    queryKey: ["finance-control-center-v2", branchId],
    enabled: Boolean(branchId),
    queryFn: () => fetchFinanceControlCenterV2(branchId, 100),
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const data = query.data;
  const summary = data?.summary;
  const cashAccounts = data?.treasury.cash_accounts || [];
  const paymentAccounts = data?.treasury.payment_accounts || [];
  const advances = data?.salary_advances || [];
  const payroll = data?.payroll_runs || [];
  const movements = data?.treasury.recent_movements || [];
  const tasks = data?.treasury_tasks || [];

  const pendingTasks = useMemo(() => tasks.filter(task => ["claimed", "in_progress", "failed"].includes(task.status)), [tasks]);

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6 pb-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black text-slate-950">مركز الماليات</h1>
              <Badge className="bg-[#005931] hover:bg-[#005931]">V3</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">صورة واحدة لكل جنيه في الفرع: الخزن، أدراج الكاشير، البنوك، الأموال قيد النقل، السلف والرواتب.</p>
            <p className="mt-1 text-xs font-semibold text-slate-400">{currentBranchName || "الفرع الحالي"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/finance/transfers")}><ArrowLeftRight className="ml-2 h-4 w-4" />تحويلات الخزن</Button>
            <Button variant="outline" onClick={() => navigate("/finance")}>التقارير المالية</Button>
            <Button variant="outline" onClick={() => navigate("/tasks")}>مهام الصرف</Button>
            <Button onClick={() => query.refetch()} disabled={query.isFetching} className="bg-[#005931] hover:bg-[#004426]">
              <RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث
            </Button>
          </div>
        </div>

        {!branchId && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-900">اختر الفرع أولًا لعرض مركز الماليات.</div>}
        {query.isError && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">{query.error instanceof Error ? query.error.message : "تعذر تحميل مركز الماليات"}</div>}
        {query.isLoading && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}</div>}

        {data && summary && (
          <>
            {summary.attention_count > 0 && (
              <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div>
                    <div className="font-black text-amber-950">فيه {summary.attention_count} بند مالي يحتاج مراجعة</div>
                    <div className="mt-1 text-sm text-amber-800">
                      {summary.unlinked_salary_advance_count ? `${summary.unlinked_salary_advance_count} سلفة بلا مصدر صرف (${money(summary.unlinked_salary_advance_amount)}). ` : ""}
                      {summary.failed_treasury_tasks ? `${summary.failed_treasury_tasks} مهمة صرف مرفوضة أو متعذرة. ` : ""}
                      {summary.transfer_exception_count ? `${summary.transfer_exception_count} تحويل مالي في حالة استثناء ويظل مبلغه قيد النقل.` : ""}
                    </div>
                  </div>
                </div>
                <Button variant="outline" className="border-amber-300 bg-white" onClick={() => navigate(summary.transfer_exception_count ? "/finance/transfers" : "/tasks")}>مراجعة</Button>
              </div>
            )}

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard title="إجمالي الأموال تحت العهدة" value={money(summary.funds_under_custody_total)} note="السيولة الموجودة في الحسابات + أي مبلغ خرج من مصدر وما زال قيد النقل." icon={Banknote} />
              <SummaryCard title="السيولة داخل الحسابات" value={money(summary.liquid_funds_total)} note="خزنة الفرع + أدراج POS + التحصيل النقدي + البنوك فقط." icon={Vault} />
              <SummaryCard title="قيد النقل" value={money(summary.in_transit_amount)} note={`${summary.in_transit_count || 0} تحويل خرج من المصدر ولم يكتمل استلامه بعد.`} icon={ArrowLeftRight} danger={summary.transfer_exception_count > 0} />
              <SummaryCard title="خزنة الفرع" value={money(summary.branch_safe_balance)} note="الرصيد الفعلي من Ledger الخزنة الرئيسية." icon={Vault} />
              <SummaryCard title="أدراج الكاشير" value={money(summary.cashier_drawers_balance)} note="إجمالي أرصدة أدراج POS الحالية." icon={ReceiptText} />
              <SummaryCard title="البنوك" value={money(summary.bank_balance)} note="الأموال الموجودة في حسابات البنك الفعلية." icon={Landmark} />
              <SummaryCard title="تسويات إلكترونية" value={money(summary.gateway_clearing_balance)} note="بطاقات ومحافظ قبل نقلها للبنك أو الخزنة." icon={WalletCards} />
              <SummaryCard title="سلف موظفين قائمة" value={money(summary.active_salary_advance_outstanding)} note="الرصيد المتبقي على السلف النشطة." icon={UserRound} />
              <SummaryCard title="مسير مقفل ينتظر الصرف" value={money(summary.locked_payroll_amount)} note="صافي الرواتب المعتمدة التي لم تصبح Paid بعد." icon={Building2} />
              <SummaryCard title="سلف بلا مصدر صرف" value={money(summary.unlinked_salary_advance_amount)} note="عمليات قديمة لا يوجد لها Ledger مصدر موثوق حتى الآن." icon={AlertTriangle} danger={summary.unlinked_salary_advance_count > 0} />
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h2 className="text-lg font-black">العهد والسيولة</h2><p className="text-xs text-slate-500">كل حساب يظهر رصيده ومسؤول العهدة الحالي.</p></div>
                <Button variant="outline" size="sm" onClick={() => navigate("/finance/transfers")}><ArrowLeftRight className="ml-1 h-4 w-4" />نقل أموال بين العهد</Button>
              </div>
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {cashAccounts.map(account => (
                  <Card key={account.account_id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3"><div><div className="font-black">{account.name}</div><Badge variant="outline" className="mt-1">{accountTypeLabel(account.account_type)}</Badge></div><Vault className="h-5 w-5 text-[#005931]" /></div>
                      <div className="mt-4 text-2xl font-black">{money(account.balance)}</div>
                      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs"><span className="text-slate-500">مسؤول العهدة:</span> <strong>{account.responsible_user_name || "غير محدد"}</strong>{account.account_type === "pos_drawer" && <div className="mt-1 text-slate-500">يتحدد من صاحب الوردية المفتوحة</div>}</div>
                    </CardContent>
                  </Card>
                ))}
                {paymentAccounts.map(account => (
                  <Card key={account.account_id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3"><div><div className="font-black">{account.name}</div><Badge variant="outline" className="mt-1">{accountTypeLabel(account.account_type)}</Badge></div><Landmark className="h-5 w-5 text-[#005931]" /></div>
                      <div className="mt-4 text-2xl font-black">{money(account.balance)}</div>
                      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs"><span className="text-slate-500">المسؤول:</span> <strong>{account.responsible_user_name || (account.account_type === "gateway_clearing" ? "حساب تسوية آلي" : "غير محدد")}</strong></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-black">سلف الموظفين ومصدر الصرف</h2><p className="text-xs text-slate-500">واضح منها السلفة اتصرفت من أنهي خزنة ومين أكد الصرف.</p></div><Button variant="outline" size="sm" onClick={() => navigate("/hr/payroll")}>فتح HR والرواتب</Button></div>
              <div className="overflow-x-auto rounded-2xl border bg-white">
                <table className="min-w-[900px] w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500"><tr><th className="p-3 text-right">الموظف</th><th className="p-3 text-right">السلفة</th><th className="p-3 text-right">المتبقي</th><th className="p-3 text-right">القسط</th><th className="p-3 text-right">مصدر الصرف</th><th className="p-3 text-right">مسؤول العهدة</th><th className="p-3 text-right">الحالة</th></tr></thead>
                  <tbody>{advances.map(row => <tr key={row.advance_id} className="border-t"><td className="p-3 font-bold">{row.employee_name}</td><td className="p-3">{money(row.principal_amount)}</td><td className="p-3 font-bold">{money(row.outstanding_amount)}</td><td className="p-3">{money(row.monthly_deduction)}</td><td className="p-3">{row.source_status === "unlinked" ? <Badge variant="destructive">غير محدد</Badge> : row.payout_account_name || "بانتظار الصرف"}</td><td className="p-3">{row.payout_responsible_user_name || "—"}</td><td className="p-3"><Badge variant="outline">{statusLabel(row.status)}</Badge></td></tr>)}</tbody>
                </table>
                {!advances.length && <div className="p-8 text-center text-sm text-slate-500">لا توجد سلف موظفين في هذا الفرع.</div>}
              </div>
            </section>

            <section className="space-y-3">
              <div><h2 className="text-lg font-black">مسير الرواتب ومصدر الدفع</h2><p className="text-xs text-slate-500">المسير لا يخصم من أي خزنة إلا بعد تأكيد مسؤول العهدة.</p></div>
              <div className="overflow-x-auto rounded-2xl border bg-white">
                <table className="min-w-[780px] w-full text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3 text-right">الفترة</th><th className="p-3 text-right">الصافي</th><th className="p-3 text-right">الخصومات</th><th className="p-3 text-right">مصدر الدفع</th><th className="p-3 text-right">مسؤول العهدة</th><th className="p-3 text-right">الحالة</th></tr></thead><tbody>{payroll.map(run => <tr key={run.run_id} className="border-t"><td className="p-3 font-bold">{run.month}/{run.year}</td><td className="p-3 font-black">{money(run.total_net)}</td><td className="p-3">{money(run.total_deductions)}</td><td className="p-3">{run.payment_account_name || "—"}</td><td className="p-3">{run.payment_responsible_user_name || "—"}</td><td className="p-3"><Badge variant="outline">{statusLabel(run.status)}</Badge>{run.delegated_task_status && <div className="mt-1 text-xs text-slate-500">المهمة: {statusLabel(run.delegated_task_status)}</div>}</td></tr>)}</tbody></table>
                {!payroll.length && <div className="p-8 text-center text-sm text-slate-500">لا يوجد مسير رواتب بعد.</div>}
              </div>
            </section>

            {pendingTasks.length > 0 && <section className="space-y-3"><div><h2 className="text-lg font-black">عمليات صرف تحتاج إجراء</h2><p className="text-xs text-slate-500">الخصم لم يحدث إلا لو المهمة مكتملة.</p></div><div className="grid gap-3 md:grid-cols-2">{pendingTasks.map(task => <Card key={task.task_id} className={task.status === "failed" ? "border-red-200" : "border-amber-200"}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-black">{task.title}</div><div className="mt-1 text-xs text-slate-500">{task.responsible_user_name || "لم يحدد مسؤول"} • {dt(task.created_at)}</div></div><Badge variant={task.status === "failed" ? "destructive" : "outline"}>{statusLabel(task.status)}</Badge></div>{task.failure_reason && <div className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-800">{task.failure_reason}</div>}</CardContent></Card>)}</div></section>}

            <section className="space-y-3">
              <div className="flex items-center gap-2"><History className="h-5 w-5 text-[#005931]" /><div><h2 className="text-lg font-black">آخر حركات الـLedger</h2><p className="text-xs text-slate-500">مصدر واحد للحقيقة المالية، مع الحساب والمنفذ والتوقيت.</p></div></div>
              <div className="overflow-x-auto rounded-2xl border bg-white"><table className="min-w-[900px] w-full text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3 text-right">الوقت</th><th className="p-3 text-right">الحساب</th><th className="p-3 text-right">الحركة</th><th className="p-3 text-right">المبلغ</th><th className="p-3 text-right">المنفذ</th><th className="p-3 text-right">الوصف</th></tr></thead><tbody>{movements.slice(0, 40).map(row => <tr key={`${row.ledger_kind}-${row.id}`} className="border-t"><td className="p-3 text-xs text-slate-500">{dt(row.created_at)}</td><td className="p-3 font-bold">{row.account_name}<div className="text-[11px] font-normal text-slate-400">{accountTypeLabel(row.account_type)}</div></td><td className="p-3">{row.entry_type}</td><td className={`p-3 font-black ${Number(row.signed_amount) < 0 ? "text-red-700" : "text-emerald-700"}`}>{Number(row.signed_amount) > 0 ? "+" : ""}{money(row.signed_amount)}</td><td className="p-3">{row.actor_name || "النظام"}</td><td className="p-3 text-slate-600">{row.description || "—"}</td></tr>)}</tbody></table></div>
            </section>
          </>
        )}
      </div>
    </MainLayout>
  );
}
