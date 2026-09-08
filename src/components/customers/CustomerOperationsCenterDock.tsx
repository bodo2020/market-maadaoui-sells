import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
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
import { fetchCustomerOperationsCenter, type CustomerPrioritySignal } from "@/services/supabase/customerOperationsService";

const money = (value: number | null | undefined) => `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
const num = (value: number | null | undefined) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 1 });

const typeLabel: Record<string, string> = {
  call: "مكالمة",
  whatsapp: "WhatsApp",
  email: "بريد",
  meeting: "مقابلة",
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

  const data = query.data;
  const summary = data?.summary;
  const queue = data?.priority_queue || [];
  const urgentCount = useMemo(() => queue.filter(item => item.priority_level === "critical" || item.priority_level === "high").length, [queue]);

  const openCustomer = (id: string) => {
    setOpen(false);
    navigate(`/customers/${id}`);
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
            <SheetDescription>ترتيب يومي للفرص ومتابعة أثر التواصل على المبيعات الفعلية.</SheetDescription>
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
            <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث
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
                التحويل يُحسب لو حصل شراء خلال {data.attribution_window_days} أيام بعد متابعة مكتملة، وكل عملية شراء تُنسب لأقرب متابعة سابقة فقط حتى لا تتكرر المبيعات.
              </div>

              <Tabs defaultValue="queue" className="space-y-3">
                <TabsList className="grid h-auto w-full grid-cols-3 rounded-2xl bg-slate-100 p-1">
                  <TabsTrigger value="queue">الأولوية</TabsTrigger>
                  <TabsTrigger value="channels">النتائج</TabsTrigger>
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
                      <div className="flex items-center justify-between gap-3"><div><div className="font-black">{typeLabel[item.type] || item.type}</div><div className="mt-1 text-xs text-muted-foreground">{num(item.completed)} مكتملة · {num(item.converted)} تحولت لشراء</div></div><div className="text-left"><div className="text-xl font-black text-[#005931]">{num(item.conversion_rate)}%</div><div className="text-[10px] text-muted-foreground">Conversion</div></div></div>
                      <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm"><span>المبيعات المنسوبة</span><strong>{money(item.attributed_revenue)}</strong></div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="team" className="space-y-2">
                  {data.agent_performance.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لسه مفيش أداء فريق قابل للقياس في الفترة المختارة.</div> : data.agent_performance.map((item, index) => (
                    <div key={item.staff_id || `staff-${index}`} className="rounded-2xl border bg-white p-4">
                      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-[#005931]" /><div><div className="font-black">{item.staff_name || "غير محدد"}</div><div className="mt-1 text-xs text-muted-foreground">{num(item.completed)} متابعة · {num(item.converted)} Conversion</div></div></div><BadgeCheck className="h-5 w-5 text-emerald-600" /></div>
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
