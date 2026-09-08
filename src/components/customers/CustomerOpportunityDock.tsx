import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck2,
  CalendarClock,
  Gift,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  UserRoundSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBranchStore } from "@/stores/branchStore";
import { fetchCustomerOpportunityBoard } from "@/services/supabase/customerOpportunityService";

const num = (value: number | null | undefined) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 1 });
const money = (value: number | null | undefined) => `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const dateTime = (value?: string | null) => value ? new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—";
const followupTypeLabel: Record<string, string> = { call: "مكالمة", whatsapp: "WhatsApp", meeting: "مقابلة", email: "بريد إلكتروني" };
const priorityLabel: Record<string, string> = { low: "عادية", medium: "متوسطة", high: "مهمة" };

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

export default function CustomerOpportunityDock() {
  const navigate = useNavigate();
  const { currentBranchId } = useBranchStore();
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ["customer-opportunity-board", currentBranchId],
    enabled: open,
    queryFn: () => fetchCustomerOpportunityBoard(currentBranchId || null, 30),
  });

  const board = query.data;
  const totalOpportunities = Number(board?.summary.abandoned_carts || 0)
    + Number(board?.summary.coupon_ready || 0)
    + Number(board?.summary.due_or_overdue || 0)
    + Number(board?.summary.under_watch || 0)
    + Number(board?.summary.pending_followups || 0);

  const openCustomer = (id: string) => {
    setOpen(false);
    navigate(`/customers/${id}`);
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-[68] h-12 rounded-full bg-[#005931] px-5 shadow-[0_14px_35px_rgba(0,89,49,.28)] hover:bg-[#004425]"
      >
        <Sparkles className="ml-2 h-5 w-5" />
        فرص العملاء
        {totalOpportunities > 0 && <Badge className="mr-2 bg-white text-[#005931] hover:bg-white">{num(totalOpportunities)}</Badge>}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="text-right">
            <SheetTitle className="flex items-center gap-2 text-xl"><UserRoundSearch className="h-5 w-5 text-[#005931]" />فرص العملاء</SheetTitle>
            <SheetDescription>قائمة تشغيل يومية مبنية على النشاط الشرائي والولاء والسلة ومهام المتابعة المجدولة.</SheetDescription>
          </SheetHeader>

          <div className="mt-5 flex justify-end"><Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث الفرص</Button></div>

          {query.isLoading ? (
            <div className="mt-4 space-y-3"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>
          ) : query.isError || !board ? (
            <Card className="mt-4"><CardContent className="p-8 text-center text-sm text-muted-foreground">{(query.error as Error)?.message || "تعذر تحميل الفرص."}</CardContent></Card>
          ) : (
            <div className="mt-4 space-y-4">
              <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Card><CardContent className="p-3"><CalendarCheck2 className="h-4 w-4 text-violet-600" /><div className="mt-2 text-xl font-black">{num(board.summary.pending_followups)}</div><div className="text-[11px] text-muted-foreground">متابعات 7 أيام</div></CardContent></Card>
                <Card><CardContent className="p-3"><ShoppingCart className="h-4 w-4 text-orange-600" /><div className="mt-2 text-xl font-black">{num(board.summary.abandoned_carts)}</div><div className="text-[11px] text-muted-foreground">سلات متروكة</div></CardContent></Card>
                <Card><CardContent className="p-3"><Gift className="h-4 w-4 text-[#005931]" /><div className="mt-2 text-xl font-black">{num(board.summary.coupon_ready)}</div><div className="text-[11px] text-muted-foreground">عندهم كوبونات</div></CardContent></Card>
                <Card><CardContent className="p-3"><CalendarClock className="h-4 w-4 text-blue-600" /><div className="mt-2 text-xl font-black">{num(board.summary.due_or_overdue)}</div><div className="text-[11px] text-muted-foreground">موعد شراء قريب</div></CardContent></Card>
                <Card><CardContent className="p-3"><AlertTriangle className="h-4 w-4 text-amber-600" /><div className="mt-2 text-xl font-black">{num(board.summary.under_watch)}</div><div className="text-[11px] text-muted-foreground">تحت المتابعة</div></CardContent></Card>
              </section>

              <Tabs defaultValue="followups" className="space-y-3">
                <TabsList className="grid h-auto w-full grid-cols-5 rounded-2xl bg-slate-100 p-1">
                  <TabsTrigger value="followups">المهام</TabsTrigger>
                  <TabsTrigger value="cart">السلات</TabsTrigger>
                  <TabsTrigger value="coupons">الكوبونات</TabsTrigger>
                  <TabsTrigger value="due">الشراء</TabsTrigger>
                  <TabsTrigger value="watch">المتابعة</TabsTrigger>
                </TabsList>

                <TabsContent value="followups" className="space-y-2">
                  {board.followups.length === 0 ? <Empty text="مفيش مهام متابعة مستحقة خلال 7 أيام." /> : board.followups.map(item => (
                    <button key={item.interaction_id} onClick={() => openCustomer(item.id)} className={`w-full rounded-2xl border p-4 text-right transition ${item.overdue ? "border-red-200 bg-red-50/60 hover:border-red-300" : "border-violet-100 bg-violet-50/40 hover:border-violet-200"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><div className="font-black">{item.subject}</div><div className="mt-1 text-xs text-muted-foreground">{item.name || "عميل"} · {item.membership_number || "—"}</div></div>
                        <div className="flex flex-col items-end gap-1"><Badge variant="outline">{followupTypeLabel[item.type] || item.type}</Badge>{item.overdue && <Badge className="bg-red-100 text-red-700 hover:bg-red-100">متأخرة</Badge>}</div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{dateTime(item.scheduled_at)}</span><span>·</span><span>{priorityLabel[item.priority] || item.priority}</span>{item.assigned_to_name && <><span>·</span><span>المسؤول: {item.assigned_to_name}</span></>}{item.overdue && <><span>·</span><strong className="text-red-700">منذ {num(item.overdue_hours)} ساعة</strong></>}</div>
                      <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs"><span>{item.phone || "بدون موبايل"}</span><ArrowLeft className="h-4 w-4" /></div>
                    </button>
                  ))}
                </TabsContent>

                <TabsContent value="cart" className="space-y-2">
                  {board.abandoned_carts.length === 0 ? <Empty text="مفيش سلات متروكة حاليًا." /> : board.abandoned_carts.map(item => <button key={item.id} onClick={() => openCustomer(item.id)} className="w-full rounded-2xl border bg-orange-50/50 p-4 text-right transition hover:border-orange-200"><div className="flex items-start justify-between gap-3"><div><div className="font-black">{item.name || "عميل"}</div><div className="mt-1 text-xs text-muted-foreground">{item.membership_number || "—"}{item.phone ? ` · ${item.phone}` : ""}</div></div><ArrowLeft className="h-4 w-4" /></div><div className="mt-3 flex gap-2 text-xs"><Badge variant="outline">{num(item.item_count)} صنف</Badge><Badge variant="outline">منذ {num(item.age_hours)} ساعة</Badge></div></button>)}
                </TabsContent>

                <TabsContent value="coupons" className="space-y-2">
                  {board.coupon_ready.length === 0 ? <Empty text="مفيش عملاء عندهم كوبونات متاحة حاليًا." /> : board.coupon_ready.map(item => <button key={item.id} onClick={() => openCustomer(item.id)} className="w-full rounded-2xl border bg-white p-4 text-right transition hover:border-emerald-200"><div className="flex items-start justify-between gap-3"><div><div className="font-black">{item.name || "عميل"}</div><div className="mt-1 text-xs text-muted-foreground">{item.membership_number || "—"}{item.phone ? ` · ${item.phone}` : ""}</div></div><strong className="text-[#005931]">{money(item.coupon_value)}</strong></div><div className="mt-3 text-xs text-muted-foreground">{num(item.coupon_count)} كوبون خصم متاح · آخر إنشاء {date(item.latest_coupon_at)}</div></button>)}
                </TabsContent>

                <TabsContent value="due" className="space-y-2">
                  {board.purchase_due.length === 0 ? <Empty text="لسه مفيش عملاء عندهم تاريخ شراء متكرر كفاية للتوقع." /> : board.purchase_due.map(item => <button key={item.id} onClick={() => openCustomer(item.id)} className={`w-full rounded-2xl border p-4 text-right transition ${item.opportunity_type === "overdue" ? "border-red-100 bg-red-50/50" : "border-blue-100 bg-blue-50/50"}`}><div className="flex items-start justify-between gap-3"><div><div className="font-black">{item.name || "عميل"}</div><div className="mt-1 text-xs text-muted-foreground">{item.membership_number || "—"} · متوسط كل {num(item.average_days)} يوم</div></div><Badge variant="outline" className={item.opportunity_type === "overdue" ? "border-red-200 bg-white text-red-700" : "border-blue-200 bg-white text-blue-700"}>{item.opportunity_type === "overdue" ? `متأخر ${num(item.overdue_days)} يوم` : "موعده قريب"}</Badge></div><div className="mt-3 text-xs text-muted-foreground">المتوقع: {date(item.predicted_at)} · آخر شراء: {date(item.last_purchase_at)}</div></button>)}
                </TabsContent>

                <TabsContent value="watch" className="space-y-2">
                  {board.under_watch.length === 0 ? <Empty text="مفيش عملاء تحت المتابعة حاليًا." /> : board.under_watch.map(item => <button key={item.id} onClick={() => openCustomer(item.id)} className="w-full rounded-2xl border bg-amber-50/50 p-4 text-right transition hover:border-amber-200"><div className="flex items-start justify-between gap-3"><div><div className="font-black">{item.name || "عميل"}</div><div className="mt-1 text-xs text-muted-foreground">{item.membership_number || "—"}{item.phone ? ` · ${item.phone}` : ""}</div></div><Badge variant="outline" className="border-amber-200 bg-white text-amber-700">تحت المتابعة</Badge></div><div className="mt-3 text-xs text-muted-foreground">آخر إجراء إداري: {date(item.last_admin_action_at)}</div></button>)}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
