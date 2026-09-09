import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, Bike, Boxes, Headphones, PackageCheck, ReceiptText, ShoppingBag, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getHrManagerOperationsPerformance } from "@/services/hrManagerOperationsPerformanceService";

const num = (value: number) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
const money = (value: number) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

export default function ManagerOperationsPerformancePanel({ branchId, from, to }: { branchId: string; from: string; to: string }) {
  const query = useQuery({
    queryKey: ["hr-manager-team-operations-v1", branchId, from, to],
    enabled: Boolean(branchId && from && to && from <= to),
    queryFn: () => getHrManagerOperationsPerformance({ branchId, from, to }),
    refetchOnWindowFocus: true,
  });

  const activeEmployees = useMemo(() => (query.data?.employees || []).filter((row) =>
    row.cashier_invoices + row.cashier_shifts + row.inventory_counts_assigned + row.inventory_recounts_assigned +
    row.delivery_assigned + row.online_transitions + row.followups_assigned > 0
  ), [query.data?.employees]);
  const attentionEmployees = useMemo(() => (query.data?.employees || []).filter((row) => row.needs_attention), [query.data?.employees]);

  if (query.isLoading) return <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">جاري تجميع تشغيل الفريق حسب التخصص...</CardContent></Card>;
  if (query.isError || !query.data) return null;
  const s = query.data.summary;

  return (
    <Card className="overflow-hidden border-[#005931]/15">
      <CardHeader className="border-b bg-gradient-to-l from-[#005931]/8 to-white">
        <CardTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-[#005931]" />تشغيل الفريق حسب التخصص</CardTitle>
        <CardDescription>تجميع للكاشير والجرد والتوصيل والطلبات الإلكترونية وخدمة العملاء من السجلات المرتبطة بهوية الموظف. لا توجد درجة أداء موحدة مصطنعة.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-4 md:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <Metric icon={UsersRound} label="نشاط تخصصي" value={`${num(s.employees_with_specialist_activity)} / ${num(s.employees)}`} />
          <Metric icon={ReceiptText} label="فواتير POS" value={num(s.cashier.invoices)} sub={money(s.cashier.sales)} />
          <Metric icon={Boxes} label="عد جرد منفذ" value={`${num(s.inventory.counts_submitted)} / ${num(s.inventory.counts_assigned)}`} />
          <Metric icon={Bike} label="طلبات موصلة" value={num(s.delivery.delivered)} sub={`${num(s.delivery.active_open)} في العهدة`} />
          <Metric icon={ShoppingBag} label="طلبات أونلاين" value={num(s.online.handled_orders)} sub={`${num(s.online.transitions)} تغيير حالة`} />
          <Metric icon={Headphones} label="متابعات العملاء" value={`${num(s.customer_service.closed)} / ${num(s.customer_service.assigned)}`} sub={`${num(s.customer_service.overdue_open)} متأخرة`} warn={s.customer_service.overdue_open > 0} />
          <Metric icon={AlertTriangle} label="تحتاج تدخل" value={num(s.employees_needing_attention)} warn={s.employees_needing_attention > 0} />
        </div>

        {attentionEmployees.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="mb-3 flex items-center gap-2 font-black text-amber-950"><AlertTriangle className="h-4 w-4" />تحتاج تدخل إداري</div>
            <div className="grid gap-3 lg:grid-cols-2">
              {attentionEmployees.map((employee) => (
                <Link key={employee.user_id} to={`/employees/${employee.user_id}`} className="rounded-xl border border-amber-200 bg-white p-3 transition hover:border-amber-400">
                  <div className="flex items-start justify-between gap-3">
                    <div><div className="font-bold">{employee.name}</div><div className="mt-0.5 text-xs text-muted-foreground">{[employee.job_title_name, employee.department_name].filter(Boolean).join(" • ") || employee.role}</div></div>
                    <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900">فتح Employee 360</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {employee.cash_variance > 0.009 && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700"><Banknote className="ml-1 h-3 w-3" />فرق نقدي {money(employee.cash_variance)}</Badge>}
                    {employee.payment_variance > 0.009 && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">فرق وسائل دفع {money(employee.payment_variance)}</Badge>}
                    {employee.followups_overdue_open > 0 && <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900">{num(employee.followups_overdue_open)} متابعة متأخرة</Badge>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-3 font-black">النشاط المتخصص للموظفين</div>
          {activeEmployees.length === 0 ? (
            <div className="rounded-xl border p-5 text-center text-sm text-muted-foreground">لا يوجد نشاط تخصصي مرتبط بهوية موظف في الفترة الحالية.</div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {activeEmployees.map((employee) => (
                <Link key={employee.user_id} to={`/employees/${employee.user_id}`} className="rounded-2xl border bg-white p-4 transition hover:border-[#005931]/40 hover:shadow-sm">
                  <div className="flex items-start justify-between gap-2"><div><div className="font-black">{employee.name}</div><div className="mt-0.5 text-xs text-muted-foreground">{[employee.job_title_name, employee.department_name].filter(Boolean).join(" • ") || employee.role}</div></div>{employee.needs_attention && <AlertTriangle className="h-4 w-4 text-amber-600" />}</div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    {(employee.cashier_invoices > 0 || employee.cashier_shifts > 0) && <Badge variant="secondary">كاشير: {num(employee.cashier_invoices)} فاتورة • {money(employee.cashier_sales)}</Badge>}
                    {employee.inventory_counts_assigned > 0 && <Badge variant="secondary">جرد: {num(employee.inventory_counts_submitted)}/{num(employee.inventory_counts_assigned)}</Badge>}
                    {employee.inventory_recounts_assigned > 0 && <Badge variant="secondary">Recount: {num(employee.inventory_recounts_submitted)}/{num(employee.inventory_recounts_assigned)}</Badge>}
                    {(employee.delivery_assigned > 0 || employee.delivery_active_open > 0 || employee.delivery_delivered > 0) && <Badge variant="secondary">توصيل: {num(employee.delivery_delivered)} موصل • {num(employee.delivery_active_open)} عهدة</Badge>}
                    {employee.online_transitions > 0 && <Badge variant="secondary">أونلاين: {num(employee.online_handled_orders)} طلب • {num(employee.online_transitions)} حركة</Badge>}
                    {employee.followups_assigned > 0 && <Badge variant="secondary">عملاء: {num(employee.followups_closed)}/{num(employee.followups_assigned)} متابعة</Badge>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-xs leading-5 text-blue-950">قائمة «تحتاج تدخل» لا تعتبر كل فرق أو إلغاء خطأ موظف. حاليًا تدخل فيها فقط فروق النقد/وسائل الدفع والمتابعات المتأخرة المفتوحة لأنها حالات قابلة للإجراء المباشر. فروق الجرد والإلغاءات تظل في Employee 360 للمراجعة بسياقها.</div>
      </CardContent>
    </Card>
  );
}

function Metric({ icon: Icon, label, value, sub, warn = false }: { icon: typeof UsersRound; label: string; value: string; sub?: string; warn?: boolean }) {
  return <div className={`rounded-xl border p-3 ${warn ? "border-amber-200 bg-amber-50" : "bg-white"}`}><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={`h-4 w-4 ${warn ? "text-amber-700" : "text-[#005931]"}`} />{label}</div><div className={`mt-2 text-lg font-black ${warn ? "text-amber-900" : ""}`}>{value}</div>{sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}</div>;
}
