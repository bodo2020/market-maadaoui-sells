import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  Gift,
  MessageCircleMore,
  ReceiptText,
  RefreshCw,
  Target,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBranchStore } from "@/stores/branchStore";
import {
  fetchCustomerCouponConversionDashboard,
  fetchCustomerFollowupOutcomeDashboard,
  fetchCustomerOperationsCenter,
  type CustomerPrioritySignal,
} from "@/services/supabase/customerOperationsService";

const money = (value: number | null | undefined) => `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
const num = (value: number | null | undefined) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 1 });
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—";

const typeLabel: Record<string, string> = {
  call: "مكالمة",
  whatsapp: "WhatsApp",
  email: "بريد",
  meeting: "مقابلة",
};

const outcomeLabel: Record<string, string> = {
  reached: "تم التواصل",
  no_answer: "لم يرد",
  interested: "مهتم",
  not_interested: "غير مهتم",
  issue_resolved: "تم حل المشكلة",
  callback_requested: "طلب إعادة التواصل",
  wrong_number: "رقم غير صحيح",
  legacy: "نتيجة قديمة غير مصنفة",
};

const signalLabel: Record<string, string> = {
  followup_overdue: "متابعة متأخرة",
  followup_due: "متابعة قريبة",
  abandoned_cart: "سلة متروكة",
  purchase_overdue: "تأخر عن نمط الشراء",
  purchase_due: "موعد شراء قريب",
  under_watch: "تحت المتابعة",
  coupon_ready: "عنده كوبون خصم",
};

const priorityMeta: Record<string, { label: string; className: string }> = {
  critical: { label: "حرج", className: "border-red-200 bg-red-50 text-red-700" },
  high: { label: "مرتفع", className: "border-orange-200 bg-orange-50 text-orange-700" },
  medium: { label: "متوسط", className: "border-amber-200 bg-amber-50 text-amber-700" },
  low: { label: "منخفض", className: "border-slate-200 bg-slate-50 text-slate-700" },
};

function SignalBadge({ signal }: { signal: CustomerPrioritySignal }) {
  return <Badge variant="outline" className="rounded-full bg-white">{signalLabel[signal.type] || signal.type}</Badge>;
}

export default function CustomerOperationsCenterDock() {
  const navigate = useNavigate();
  const { currentBranchId } = useBranchStore();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(30);

  const query = useQuery({
    queryKey: ["customer-operations-center", currentBranchId, days],
    enabled: open,
    queryFn: () => fetchCustomerOperationsCenter(currentBranchId || null, days, 60),
  });

  const couponQuery = useQuery({
    queryKey: ["customer-coupon-conversion-dashboard", currentBranchId, days],
    enabled: open,
    queryFn: () => fetchCustomerCouponConversionDashboard(currentBranchId || null, days, 40),
  });

  const outcomeQuery = useQuery({
    queryKey: ["customer-followup-outcome-dashboard", currentBranchId, days],
    enabled: open,
    queryFn: () => fetchCustomerFollowupOutcomeDashboard(currentBranchId || null, days),
  });

  const data = query.data;
  const coupon = couponQuery.data;
  const outcome = outcomeQuery.data;
  const summary = data?.summary;
  const queue = data?.priority_queue || [];
  const urgentCount = useMemo(() => queue.filter(item => item.priority_level === "critical" || item.priority_level === "high").length, [queue]);

  const openCustomer = (id: string) => {
    setOpen(false);
    navigate(`/customers/${id}`);
  };

  const refresh = () => {
    void query.refetch();
    void couponQuery.refetch();
    void outcomeQuery.refetch();
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 left-5 z-[67] h-12 rounded-full bg-slate-950 px-5 text-white shadow-[0_14px_35px_rgba(15,23,42,.25)] hover:bg-slate-800"
      >
        <Gauge className="ml-2 h-5 w-5" />
        مركز التشغيل
        {urgentCount > 0 && <Badge className="mr-2 bg-white text-slate-950 hover:bg-white">{num(urgentCount)}</Badge>}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader className="text-right">
            <SheetTitle className="flex items-center gap-2 text-xl"><Gauge className="h-5 w-5 text-[#005931]" />مركز تشغيل العملاء</SheetTitle>
            <SheetDescription>ترتيب يومي للفرص وقياس أثر المتابعة وكوبونات الخصم على المبيعات الفعلية.</SheetDescription>
          </SheetHeader>

          <div className="mt-5 flex items-center justify-between gap-3">
            <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">آخر 7 أيام</SelectItem>
                <SelectItem value="30">آخر 30 يوم</SelectItem>
                <SelectItem value="90">آخر 90 يوم</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={refresh} disabled={query.isFetching || couponQuery.isFetching || outcomeQuery.isFetching}>
              <RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching || couponQuery.isFetching || outcomeQuery.isFetching ? "animate-spin" : ""}`} />تحديث
            </Button>
          </div>

          {query.isLoading ? (
            <div className="mt-4 space-y-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>
          ) : query.isError || !data ? (
            <Card className="mt-4"><CardContent className="p-8 text-center text-sm text-muted-foreground">{(query.error as Error)?.message || "تعذر تحميل مركز التشغيل."}</CardContent></Card>
          ) : (
            <div className="mt-4 space-y-4">
              <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card><CardContent className="p-4"><Target className="h-4 w-4 text-[#005931]" /><div className="mt-2 text-2xl font-black">{num(summary?.conversion_rate)}%</div><div className="text-[11px] text-muted-foreground">نسبة تحويل المتابعات</div></CardContent></Card>
                <Card><CardContent className="p-4"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><div className="mt-2 text-2xl font-black">{num(summary?.converted_followups)}</div><div className="text-[11px] text-muted-foreground">متابعات نتج عنها شراء</div></CardContent></Card>
                <Card><CardContent className="p-4"><CircleDollarSign className="h-4 w-4 text-[#005931]" /><div className="mt-2 truncate text-xl font-black">{money(summary?.attributed_revenue)}</div><div className="text-[11px] text-muted-foreground">مبيعات منسوبة للمتابعة</div></CardContent></Card>
                <Card><CardContent className="p-4"><CalendarClock className="h-4 w-4 text-red-600" /><div className="mt-2 text-2xl font-black">{num(summary?.overdue_followups)}</div><div className="text-[11px] text-muted-foreground">متابعات متأخرة الآن</div></CardContent></Card>
              </section>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs leading-5 text-emerald-900">
                المتابعة تُعتبر محوّلة لو حصل شراء خلال {data.attribution_window_days} أيام بعدها، وكل فاتورة تُنسب لأقرب متابعة سابقة فقط. استخدام الكوبون يُقاس مباشرة من الفاتورة أو الطلب المرتبط بالكوبون.
              </div>

              <Tabs defaultValue="queue" className="space-y-3">
                <TabsList className="grid h-auto w-full grid-cols-5 rounded-2xl bg-slate-100 p-1">
                  <TabsTrigger value="queue">الأولوية</TabsTrigger>
                  <TabsTrigger value="channels">المتابعات</TabsTrigger>
                  <TabsTrigger value="outcomes">النتائج</TabsTrigger>
                  <TabsTrigger value="coupons">الكوبونات</TabsTrigger>
                  <TabsTrigger value="team">الفريق</TabsTrigger>
                </TabsList>

                <TabsContent value="queue" className="space-y-2">
                  {queue.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">مفيش فرص تحتاج إجراء حاليًا.</div>
                  ) : queue.map((item, index) => {
                    const meta = priorityMeta[item.priority_level] || priorityMeta.low;
                    return (
                      <button key={item.id} type="button" onClick={() => openCustomer(item.id)} className="w-full rounded-2xl border bg-white p-4 text-right transition hover:border-emerald-200 hover:bg-emerald-50/20">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2"><span className="text-xs font-black text-muted-foreground">#{index + 1}</span><div className="truncate font-black">{item.name || "عميل"}</div></div>
                            <div className="mt-1 text-xs text-muted-foreground">{item.membership_number || "—"}{item.phone ? ` · ${item.phone}` : ""}</div>
                          </div>
                          <div className="flex items-center gap-2"><Badge variant="outline" className={meta.className}>{meta.label}</Badge><div className="min-w-11 rounded-xl bg-slate-950 px-2 py-1 text-center text-sm font-black text-white">{num(item.priority_score)}</div><ArrowLeft className="h-4 w-4 text-muted-foreground" /></div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">{item.signals.map((signal, signalIndex) => <SignalBadge key={`${signal.type}-${signalIndex}`} signal={signal} />)}</div>
                      </button>
                    );
                  })}
                </TabsContent>

                <TabsContent value="channels" className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">المتابعات المكتملة</div><div className="mt-2 text-2xl font-black">{num(summary?.completed_followups)}</div></CardContent></Card>
                    <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">الطلبات المنسوبة</div><div className="mt-2 text-2xl font-black">{num(summary?.attributed_orders)}</div></CardContent></Card>
                  </div>
                  {data.type_performance.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لسه مفيش متابعات مكتملة في الفترة المختارة.</div> : data.type_performance.map(item => (
                    <div key={item.type} className="rounded-2xl border bg-white p-4">
                      <div className="flex items-center justify-between gap-3"><div><div className="font-black">{typeLabel[item.type] || item.type}</div><div className="mt-1 text-xs text-muted-foreground">{num(item.completed)} مكتملة · {num(item.converted)} تحولت لشراء</div></div><div className="text-left"><div className="text-xl font-black text-[#005931]">{num(item.conversion_rate)}%</div><div className="text-[10px] text-muted-foreground">تحويل</div></div></div>
                      <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm"><span>المبيعات المنسوبة</span><strong>{money(item.attributed_revenue)}</strong></div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="outcomes" className="space-y-3">
                  {outcomeQuery.isLoading ? <Skeleton className="h-72 rounded-2xl" /> : outcomeQuery.isError || !outcome ? (
                    <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">تعذر تحميل Funnel نتائج المتابعة.</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Card><CardContent className="p-3"><MessageCircleMore className="h-4 w-4 text-[#005931]" /><div className="mt-2 text-xl font-black">{num(outcome.summary.structured_outcomes)}</div><div className="text-[10px] text-muted-foreground">نتائج منظمة</div></CardContent></Card>
                        <Card><CardContent className="p-3"><Target className="h-4 w-4 text-emerald-600" /><div className="mt-2 text-xl font-black">{num(outcome.summary.interested)}</div><div className="text-[10px] text-muted-foreground">عملاء مهتمون</div></CardContent></Card>
                        <Card><CardContent className="p-3"><CalendarClock className="h-4 w-4 text-blue-600" /><div className="mt-2 text-xl font-black">{num(outcome.summary.callback_requested)}</div><div className="text-[10px] text-muted-foreground">طلبوا إعادة التواصل</div></CardContent></Card>
                        <Card><CardContent className="p-3"><MessageCircleMore className="h-4 w-4 text-amber-600" /><div className="mt-2 text-xl font-black">{num(outcome.summary.no_answer)}</div><div className="text-[10px] text-muted-foreground">لم يردوا</div></CardContent></Card>
                      </div>

                      {outcome.outcomes.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">أول ما تبدأ تسجل النتائج المنظمة هتظهر المقارنة هنا.</div> : outcome.outcomes.map(item => (
                        <div key={item.outcome_code} className="rounded-2xl border bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div><div className="font-black">{outcomeLabel[item.outcome_code] || item.outcome_code}</div><div className="mt-1 text-xs text-muted-foreground">{num(item.completed)} متابعة · {num(item.converted)} نتج عنها شراء</div></div>
                            <div className="text-left"><div className="text-xl font-black text-[#005931]">{num(item.conversion_rate)}%</div><div className="text-[10px] text-muted-foreground">نسبة التحويل</div></div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-muted-foreground">المبيعات المنسوبة</div><strong>{money(item.attributed_revenue)}</strong></div><div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-muted-foreground">الإجراء المقترح</div><strong className="text-xs leading-5">{item.recommended_action}</strong></div></div>
                        </div>
                      ))}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="coupons" className="space-y-3">
                  {couponQuery.isLoading ? <Skeleton className="h-72 rounded-2xl" /> : couponQuery.isError || !coupon ? (
                    <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">تعذر تحميل أداء كوبونات الخصم.</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Card><CardContent className="p-3"><Gift className="h-4 w-4 text-[#005931]" /><div className="mt-2 text-xl font-black">{num(coupon.summary.cohort_redemption_rate)}%</div><div className="text-[10px] text-muted-foreground">استخدام كوبونات الفترة</div></CardContent></Card>
                        <Card><CardContent className="p-3"><ReceiptText className="h-4 w-4 text-emerald-600" /><div className="mt-2 text-xl font-black">{num(coupon.summary.coupon_orders)}</div><div className="text-[10px] text-muted-foreground">طلبات استخدمت كوبون</div></CardContent></Card>
                        <Card><CardContent className="p-3"><CircleDollarSign className="h-4 w-4 text-red-600" /><div className="mt-2 truncate text-base font-black">{money(coupon.summary.discount_used)}</div><div className="text-[10px] text-muted-foreground">خصم تم صرفه</div></CardContent></Card>
                        <Card><CardContent className="p-3"><CircleDollarSign className="h-4 w-4 text-[#005931]" /><div className="mt-2 truncate text-base font-black">{money(coupon.summary.net_sales_after_coupon)}</div><div className="text-[10px] text-muted-foreground">صافي مبيعات الكوبونات</div></CardContent></Card>
                      </div>

                      <div className="rounded-2xl border bg-white p-4">
                        <div className="flex items-center justify-between gap-3"><div><div className="font-black">الكوبونات القائمة حاليًا</div><div className="mt-1 text-xs text-muted-foreground">رصيد خصم لم يُصرف بعد</div></div><div className="text-left"><div className="text-xl font-black text-[#005931]">{money(coupon.summary.active_value)}</div><div className="text-[10px] text-muted-foreground">{num(coupon.summary.active_vouchers)} كوبون</div></div></div>
                      </div>

                      <div>
                        <div className="mb-2 text-sm font-black">آخر عمليات شراء بالكوبون</div>
                        {coupon.recent_conversions.length === 0 ? <div className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">لسه مفيش كوبونات اتصرفت في الفترة المختارة.</div> : <div className="space-y-2">{coupon.recent_conversions.slice(0, 12).map(item => (
                          <button key={`${item.source}-${item.purchase_id}`} type="button" onClick={() => item.customer_id && openCustomer(item.customer_id)} className="w-full rounded-2xl border bg-white p-3 text-right transition hover:border-emerald-200">
                            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-bold">{item.name || "عميل"}</div><div className="mt-1 text-[11px] text-muted-foreground">{item.membership_number || "—"} · {item.source === "store" ? "شراء من الفرع" : "طلب أونلاين"} · {date(item.purchased_at)}</div></div><div className="text-left"><div className="font-black text-[#005931]">{money(item.net_amount)}</div><div className="text-[10px] text-red-600">خصم {money(item.discount_amount)}</div></div></div>
                            {item.voucher_code && <div className="mt-2 text-[10px] text-muted-foreground">كوبون: {item.voucher_code}</div>}
                          </button>
                        ))}</div>}
                      </div>

                      {coupon.top_customers.length > 0 && <div><div className="mb-2 text-sm font-black">أعلى عملاء استخدموا كوبونات</div><div className="space-y-2">{coupon.top_customers.slice(0, 8).map(item => <button key={item.customer_id} onClick={() => openCustomer(item.customer_id)} className="w-full rounded-xl border bg-white p-3 text-right"><div className="flex items-center justify-between gap-3"><div><div className="font-bold">{item.name || "عميل"}</div><div className="text-[11px] text-muted-foreground">{item.membership_number || "—"} · {num(item.coupon_orders)} طلب</div></div><div className="text-left"><div className="font-black">{money(item.net_sales)}</div><div className="text-[10px] text-red-600">خصم {money(item.discount_used)}</div></div></div></button>)}</div></div>}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="team" className="space-y-2">
                  {data.agent_performance.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لسه مفيش أداء فريق قابل للقياس في الفترة المختارة.</div> : data.agent_performance.map((item, index) => (
                    <div key={item.staff_id || `staff-${index}`} className="rounded-2xl border bg-white p-4">
                      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-[#005931]" /><div><div className="font-black">{item.staff_name || "غير محدد"}</div><div className="mt-1 text-xs text-muted-foreground">{num(item.completed)} متابعة · {num(item.converted)} تحويل</div></div></div><BadgeCheck className="h-5 w-5 text-emerald-600" /></div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-center text-sm"><div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-muted-foreground">نسبة التحويل</div><strong>{num(item.conversion_rate)}%</strong></div><div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-muted-foreground">المبيعات</div><strong>{money(item.attributed_revenue)}</strong></div></div>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
