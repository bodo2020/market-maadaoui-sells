import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBranchStore } from "@/stores/branchStore";
import {
  fetchCustomerManagementCatalog,
  type CustomerManagementRow,
  type CustomerSegment,
} from "@/services/supabase/customerManagementService";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Crown,
  Gift,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingUp,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";

const LIMIT = 40;

const money = (value: number | string | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ج.م`;
const num = (value: number | string | null | undefined) => Number(value || 0).toLocaleString("ar-EG");
const date = (value?: string | null) => {
  if (!value) return "لم يشترِ بعد";
  return new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
};

const segmentMeta: Record<CustomerSegment | "all", { label: string; className: string }> = {
  all: { label: "الكل", className: "" },
  vip: { label: "VIP", className: "border-amber-200 bg-amber-50 text-amber-800" },
  loyal: { label: "وفي", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  promising: { label: "واعد", className: "border-blue-200 bg-blue-50 text-blue-800" },
  new: { label: "جديد", className: "border-cyan-200 bg-cyan-50 text-cyan-800" },
  at_risk: { label: "معرض للتوقف", className: "border-orange-200 bg-orange-50 text-orange-800" },
  lost: { label: "متوقف", className: "border-red-200 bg-red-50 text-red-800" },
  inactive: { label: "بلا مشتريات", className: "border-slate-200 bg-slate-50 text-slate-700" },
  active: { label: "نشط", className: "border-teal-200 bg-teal-50 text-teal-800" },
};

function SegmentBadge({ segment }: { segment: CustomerSegment }) {
  const meta = segmentMeta[segment] || segmentMeta.active;
  return <Badge variant="outline" className={meta.className}>{meta.label}</Badge>;
}

function Channel({ value }: { value: CustomerManagementRow["preferred_channel"] }) {
  if (value === "store") return <span className="inline-flex items-center gap-1 text-xs"><Store className="h-3.5 w-3.5" />الفرع</span>;
  if (value === "online") return <span className="inline-flex items-center gap-1 text-xs"><ShoppingBag className="h-3.5 w-3.5" />أونلاين</span>;
  if (value === "mixed") return <span className="inline-flex items-center gap-1 text-xs"><Activity className="h-3.5 w-3.5" />مختلط</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
}

export default function Customers() {
  const navigate = useNavigate();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [segment, setSegment] = useState<CustomerSegment | "all">("all");
  const [offset, setOffset] = useState(0);

  useEffect(() => setOffset(0), [deferredSearch, segment, currentBranchId]);

  const query = useQuery({
    queryKey: ["customer-management-catalog", currentBranchId, deferredSearch, segment, offset],
    queryFn: () => fetchCustomerManagementCatalog({
      branchId: currentBranchId || null,
      search: deferredSearch,
      segment,
      limit: LIMIT,
      offset,
    }),
  });

  const rows = query.data?.rows || [];
  const summary = query.data?.summary;
  const page = Math.floor(offset / LIMIT) + 1;
  const pages = Math.max(1, Math.ceil(Number(query.data?.total || 0) / LIMIT));

  const cards = useMemo(() => [
    { label: "إجمالي العملاء", value: num(summary?.total_customers), icon: Users, hint: currentBranchName || "كل الفروع" },
    { label: "نشطون آخر 30 يوم", value: num(summary?.active_30d), icon: Activity, hint: "عملاء عادوا للشراء" },
    { label: "عملاء جدد", value: num(summary?.new_30d), icon: UserPlus, hint: "آخر 30 يوم" },
    { label: "VIP", value: num(summary?.vip), icon: Crown, hint: "أعلى قيمة وتكرار" },
    { label: "معرضون للتوقف", value: num(summary?.at_risk), icon: AlertTriangle, hint: "يحتاجون متابعة" },
    { label: "صافي مبيعات العملاء", value: money(summary?.total_net_sales), icon: TrendingUp, hint: "بعد كوبونات الولاء" },
    { label: "متوسط قيمة العميل", value: money(summary?.average_customer_value), icon: Sparkles, hint: "إجمالي الإنفاق ÷ العملاء" },
    { label: "كوبونات خصم قائمة", value: money(summary?.coupons_outstanding_value), icon: Gift, hint: `${num(summary?.points_outstanding)} نقطة حالية` },
  ], [summary, currentBranchName]);

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-[1500px] space-y-5 p-3 pb-10 md:p-6">
        <section className="overflow-hidden rounded-3xl bg-[#005931] p-5 text-white shadow-[0_16px_45px_rgba(0,89,49,.18)] md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-emerald-50">
                <Sparkles className="h-3.5 w-3.5" /> Customer 360
              </div>
              <h1 className="text-2xl font-black md:text-3xl">العملاء</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100">ملف موحد للعميل يربط مشتريات الفرع والتطبيق والولاء والكوبونات في مكان واحد.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" className="bg-white text-[#005931] hover:bg-emerald-50" onClick={() => void query.refetch()} disabled={query.isFetching}>
                <RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> تحديث
              </Button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
          {query.isLoading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />) : cards.map(({ label, value, icon: Icon, hint }) => (
            <Card key={label} className="border-0 shadow-sm ring-1 ring-slate-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-[#005931]" /></div>
                <div className="mt-2 truncate text-xl font-black">{value}</div>
                <div className="mt-1 truncate text-[10px] text-muted-foreground">{hint}</div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="rounded-3xl border bg-white p-3 shadow-sm md:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full xl:max-w-xl">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={event => setSearch(event.target.value)} className="h-11 pr-10" placeholder="ابحث بالاسم، الموبايل، رقم EMD أو الباركود" />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 xl:pb-0">
              {(Object.keys(segmentMeta) as Array<CustomerSegment | "all">).map(key => (
                <Button key={key} size="sm" variant={segment === key ? "default" : "outline"} className={segment === key ? "bg-[#005931] hover:bg-[#004a29]" : ""} onClick={() => setSegment(key)}>
                  {segmentMeta[key].label}
                </Button>
              ))}
            </div>
          </div>
        </section>

        {query.isError ? (
          <Card><CardContent className="p-8 text-center"><AlertTriangle className="mx-auto h-10 w-10 text-amber-500" /><div className="mt-3 font-bold">تعذر تحميل العملاء</div><p className="mt-1 text-sm text-muted-foreground">{(query.error as Error)?.message}</p><Button className="mt-4" onClick={() => void query.refetch()}>إعادة المحاولة</Button></CardContent></Card>
        ) : query.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
        ) : rows.length === 0 ? (
          <Card><CardContent className="p-12 text-center"><Users className="mx-auto h-12 w-12 text-slate-300" /><div className="mt-3 text-lg font-bold">لا توجد نتائج</div><p className="mt-1 text-sm text-muted-foreground">غيّر البحث أو التصنيف لعرض عملاء آخرين.</p></CardContent></Card>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-3xl border bg-white shadow-sm md:block">
              <Table>
                <TableHeader><TableRow className="bg-slate-50/80"><TableHead>العميل</TableHead><TableHead>التصنيف</TableHead><TableHead>آخر شراء</TableHead><TableHead>المشتريات</TableHead><TableHead>صافي الإنفاق</TableHead><TableHead>متوسط الطلب</TableHead><TableHead>الولاء</TableHead><TableHead>القناة</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {rows.map(customer => (
                    <TableRow key={customer.id} className="cursor-pointer hover:bg-emerald-50/30" onClick={() => navigate(`/customers/${customer.id}`)}>
                      <TableCell><div className="font-bold">{customer.name?.trim() || "عميل بدون اسم"}</div><div className="mt-1 text-xs text-muted-foreground">{customer.membership_number || "—"}{customer.phone ? ` · ${customer.phone}` : ""}</div></TableCell>
                      <TableCell><SegmentBadge segment={customer.segment} /></TableCell>
                      <TableCell className="text-sm">{date(customer.last_purchase_at)}</TableCell>
                      <TableCell><div className="font-bold">{num(customer.purchase_count)}</div><div className="text-[11px] text-muted-foreground">{num(customer.store_sales_count)} فرع · {num(customer.online_orders_count)} أونلاين</div></TableCell>
                      <TableCell><div className="font-black text-[#005931]">{money(customer.net_spent)}</div>{customer.loyalty_discount > 0 && <div className="text-[11px] text-muted-foreground">خصم ولاء {money(customer.loyalty_discount)}</div>}</TableCell>
                      <TableCell>{money(customer.avg_order_value)}</TableCell>
                      <TableCell><div className="font-bold">{num(customer.points_balance)} نقطة</div><div className="text-[11px] text-muted-foreground">{customer.active_coupon_count ? `${num(customer.active_coupon_count)} كوبون · ${money(customer.outstanding_coupon_value)}` : "بدون كوبونات"}</div></TableCell>
                      <TableCell><Channel value={customer.preferred_channel} /></TableCell>
                      <TableCell><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 md:hidden">
              {rows.map(customer => (
                <button key={customer.id} type="button" onClick={() => navigate(`/customers/${customer.id}`)} className="w-full rounded-3xl border bg-white p-4 text-right shadow-sm active:scale-[.99]">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-black">{customer.name?.trim() || "عميل بدون اسم"}</div><div className="mt-1 text-xs text-muted-foreground">{customer.membership_number || "—"}{customer.phone ? ` · ${customer.phone}` : ""}</div></div><SegmentBadge segment={customer.segment} /></div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs"><div className="rounded-xl bg-slate-50 p-2"><div className="text-muted-foreground">الإنفاق</div><strong className="text-[#005931]">{money(customer.net_spent)}</strong></div><div className="rounded-xl bg-slate-50 p-2"><div className="text-muted-foreground">الطلبات</div><strong>{num(customer.purchase_count)}</strong></div><div className="rounded-xl bg-slate-50 p-2"><div className="text-muted-foreground">النقاط</div><strong>{num(customer.points_balance)}</strong></div></div>
                  <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground"><span>{date(customer.last_purchase_at)}</span><Channel value={customer.preferred_channel} /></div>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center justify-between rounded-2xl border bg-white p-3 text-sm">
          <div>صفحة {num(page)} من {num(pages)} · {num(query.data?.total)} عميل</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - LIMIT))}><ArrowRight className="ml-1 h-4 w-4" />السابق</Button>
            <Button variant="outline" size="sm" disabled={offset + LIMIT >= Number(query.data?.total || 0)} onClick={() => setOffset(value => value + LIMIT)}>التالي<ArrowLeft className="mr-1 h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
