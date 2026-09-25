import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpLeft, BellRing, ClipboardList, Package, Receipt, ShoppingBag, ShoppingCart, TrendingUp } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { useBranchStore } from "@/stores/branchStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { fetchReportingOverviewV2 } from "@/services/supabase/reportingV2Service";
import { siteConfig } from "@/config/site";

const money = (value: number) =>
  `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ${siteConfig.currency}`;

const number = (value: number) => Number(value || 0).toLocaleString("ar-EG");

export default function OperationsDashboard() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const { unreadOrders, operationsTaskAlerts, approvalAlerts } = useNotificationStore();
  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }, []);
  const overview = useQuery({
    queryKey: ["operations-dashboard", currentBranchId, range.from.toISOString().slice(0, 10)],
    queryFn: () => fetchReportingOverviewV2(currentBranchId!, range.from, range.to),
    enabled: Boolean(currentBranchId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const metrics = overview.data?.current;
  const daily = overview.data?.daily.slice(-7) || [];
  const maxSales = Math.max(1, ...daily.map((day) => day.net_sales));
  const tasks = [
    { label: "طلبات تحتاج متابعة", count: unreadOrders || 0, href: "/online-orders", icon: ShoppingBag, color: "text-orange-700 bg-orange-50" },
    { label: "مهام التشغيل", count: operationsTaskAlerts || 0, href: "/tasks", icon: ClipboardList, color: "text-sky-700 bg-sky-50" },
    { label: "موافقات معلقة", count: approvalAlerts || 0, href: "/approvals", icon: BellRing, color: "text-violet-700 bg-violet-50" },
  ];

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-[1500px] space-y-6 pb-8 pt-6">
        <header className="rounded-[28px] border border-slate-200/80 bg-white px-5 py-6 shadow-sm md:px-8 md:py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="mb-2 text-sm font-semibold text-emerald-700">مساحة العمل · {currentBranchName || "اختر فرعًا"}</p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">نظرة واضحة على يومك</h1>
              <p className="mt-2 text-sm text-slate-500">المبيعات والطلبات والمهام المهمة في مكان واحد.</p>
            </div>
            <Link to="/pos" className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-emerald-700 px-5 font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
              افتح نقطة البيع <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </header>

        {!currentBranchId ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">اختر فرعًا من أعلى الشاشة لعرض بياناته.</div>
        ) : (
          <>
            <section aria-label="ملخص آخر سبعة أيام" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "صافي المبيعات", value: metrics ? money(metrics.net_sales) : "—", icon: TrendingUp },
                { label: "عدد العمليات", value: metrics ? number(metrics.transactions) : "—", icon: Receipt },
                { label: "متوسط الفاتورة", value: metrics ? money(metrics.average_ticket) : "—", icon: ShoppingCart },
                { label: "المرتجعات", value: metrics ? money(metrics.returns) : "—", icon: Package },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm">
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></div>
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-950">{value}</p>
                  <p className="mt-2 text-xs text-slate-400">آخر 7 أيام</p>
                </div>
              ))}
            </section>

            {overview.isError && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">تعذر تحميل ملخص المبيعات. <button type="button" onClick={() => void overview.refetch()} className="font-bold underline">إعادة المحاولة</button></div>}
            {overview.isLoading && <p role="status" className="text-sm text-slate-500">جاري تحميل ملخص المبيعات…</p>}

            <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm md:p-6">
                <div className="mb-6 flex items-start justify-between gap-3">
                  <div><h2 className="text-lg font-bold text-slate-950">حركة المبيعات</h2><p className="mt-1 text-sm text-slate-500">صافي المبيعات خلال آخر 7 أيام</p></div>
                  <Link to="/reports" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline">التقارير <ArrowUpLeft className="h-4 w-4" /></Link>
                </div>
                <div className="flex h-52 items-end gap-2" aria-label="رسم بياني لصافي المبيعات">
                  {daily.map((day) => (
                    <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2 text-center" title={`${day.date}: ${money(day.net_sales)}`}>
                      <div className="flex flex-1 items-end justify-center rounded-t-xl bg-slate-50">
                        <div className="w-full rounded-t-xl bg-emerald-600 transition-[height] duration-200 motion-reduce:transition-none" style={{ height: `${Math.max(4, day.net_sales / maxSales * 100)}%` }} />
                      </div>
                      <span className="truncate text-[11px] text-slate-500">{new Date(`${day.date}T12:00:00`).toLocaleDateString("ar-EG", { weekday: "short" })}</span>
                    </div>
                  ))}
                  {!daily.length && <p className="m-auto text-sm text-slate-400">لا توجد بيانات للفترة المعروضة.</p>}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm md:p-6">
                <h2 className="text-lg font-bold text-slate-950">تحتاج اهتمامك</h2>
                <p className="mb-4 mt-1 text-sm text-slate-500">اختصارات للعمل الجاري في الفرع.</p>
                <div className="space-y-2">
                  {tasks.map(({ label, count, href, icon: Icon, color }) => (
                    <Link key={href} to={href} className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-slate-100 px-3 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></span>
                      <span className="flex-1 text-sm font-semibold text-slate-800">{label}</span>
                      <strong className="tabular-nums text-lg text-slate-950">{number(count)}</strong>
                      <ArrowUpLeft className="h-4 w-4 text-slate-400" />
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
