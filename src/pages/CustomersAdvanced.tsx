import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Crown,
  Filter,
  Gift,
  RefreshCw,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBranchStore } from "@/stores/branchStore";
import {
  fetchCustomerManagementCatalog,
  type CustomerAdvancedFilters,
  type CustomerManagementRow,
  type CustomerSegment,
} from "@/services/supabase/customerManagementService";

const LIMIT = 40;
const money = (value: number | string | null | undefined) => `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
const num = (value: number | string | null | undefined) => Number(value || 0).toLocaleString("ar-EG");
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value)) : "لم يشترِ بعد";

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

function statusBadge(status: CustomerManagementRow["management_status"]) {
  if (status === "blocked") return <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">موقوف</Badge>;
  if (status === "watch") return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">متابعة</Badge>;
  return null;
}

const yn = (value: string): boolean | undefined => value === "yes" ? true : value === "no" ? false : undefined;
const ynValue = (value?: boolean) => value === true ? "yes" : value === false ? "no" : "all";

export default function CustomersAdvanced() {
  const navigate = useNavigate();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [segment, setSegment] = useState<CustomerSegment | "all">("all");
  const [filters, setFilters] = useState<CustomerAdvancedFilters>({});
  const [offset, setOffset] = useState(0);

  const activeFilterCount = useMemo(() => Object.values(filters).filter(value => value !== undefined && value !== "" && value !== "all").length, [filters]);
  useEffect(() => setOffset(0), [deferredSearch, segment, currentBranchId, JSON.stringify(filters)]);

  const query = useQuery({
    queryKey: ["customer-management-catalog-v2", currentBranchId, deferredSearch, segment, filters, offset],
    queryFn: () => fetchCustomerManagementCatalog({ branchId: currentBranchId || null, search: deferredSearch, segment, filters, limit: LIMIT, offset }),
  });

  const rows = query.data?.rows || [];
  const summary = query.data?.summary;
  const page = Math.floor(offset / LIMIT) + 1;
  const pages = Math.max(1, Math.ceil(Number(query.data?.total || 0) / LIMIT));

  const cards = useMemo(() => [
    { label: "إجمالي العملاء", value: num(summary?.total_customers), icon: Users, hint: currentBranchName || "كل الفروع" },
    { label: "نشطون آخر 30 يوم", value: num(summary?.active_30d), icon: Activity, hint: "عادوا للشراء مؤخرًا" },
    { label: "عملاء جدد", value: num(summary?.new_30d), icon: UserPlus, hint: "آخر 30 يوم" },
    { label: "تحت المتابعة", value: num(summary?.under_watch), icon: AlertTriangle, hint: "حالة إدارية" },
    { label: "سلات متروكة", value: num(summary?.abandoned_carts), icon: ShoppingCart, hint: "بدون نشاط 24 ساعة+" },
    { label: "صافي مبيعات العملاء", value: money(summary?.total_net_sales), icon: TrendingUp, hint: "بعد كوبونات الولاء" },
    { label: "متوسط قيمة العميل", value: money(summary?.average_customer_value), icon: Sparkles, hint: "إجمالي الإنفاق ÷ العملاء" },
    { label: "كوبونات خصم قائمة", value: money(summary?.coupons_outstanding_value), icon: Gift, hint: `${num(summary?.points_outstanding)} نقطة حالية` },
  ], [summary, currentBranchName]);

  const clearFilters = () => setFilters({});

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-[1500px] space-y-5 p-3 pb-10 md:p-6">
        <section className="overflow-hidden rounded-3xl bg-[#005931] p-5 text-white shadow-[0_16px_45px_rgba(0,89,49,.18)] md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-emerald-50"><Sparkles className="h-3.5 w-3.5" /> Customer 360 Intelligence</div><h1 className="text-2xl font-black md:text-3xl">العملاء</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100">بحث وتحليل وتقسيم متقدم للعملاء مع إشارات الولاء والسلات المتروكة والنشاط الشرائي.</p></div>
            <Button variant="secondary" className="bg-white text-[#005931] hover:bg-emerald-50" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
          {query.isLoading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />) : cards.map(({ label, value, icon: Icon, hint }) => <Card key={label} className="border-0 shadow-sm ring-1 ring-slate-200"><CardContent className="p-4"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-[#005931]" /></div><div className="mt-2 truncate text-xl font-black">{value}</div><div className="mt-1 truncate text-[10px] text-muted-foreground">{hint}</div></CardContent></Card>)}
        </section>

        <section className="rounded-3xl border bg-white p-3 shadow-sm md:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full xl:max-w-xl"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} className="h-11 pr-10" placeholder="ابحث بالاسم، الموبايل، رقم EMD أو الباركود" /></div>
            <div className="flex items-center gap-2">
              <Sheet>
                <SheetTrigger asChild><Button variant={activeFilterCount ? "default" : "outline"} className={activeFilterCount ? "bg-[#005931] hover:bg-[#004a29]" : ""}><Filter className="ml-2 h-4 w-4" />فلاتر متقدمة{activeFilterCount > 0 && <Badge className="mr-2 bg-white text-[#005931] hover:bg-white">{activeFilterCount}</Badge>}</Button></SheetTrigger>
                <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto sm:max-w-md">
                  <SheetHeader className="text-right"><SheetTitle>الفلاتر المتقدمة</SheetTitle><SheetDescription>الفلاتر تتطبق على قاعدة البيانات مباشرة، مش على الصفحة الحالية فقط.</SheetDescription></SheetHeader>
                  <div className="mt-6 space-y-5">
                    <div><Label>الحالة الإدارية</Label><Select value={filters.management_status || "all"} onValueChange={v => setFilters(f => ({ ...f, management_status: v as CustomerAdvancedFilters["management_status"] }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل الحالات</SelectItem><SelectItem value="active">نشط</SelectItem><SelectItem value="watch">تحت المتابعة</SelectItem><SelectItem value="blocked">موقوف</SelectItem></SelectContent></Select></div>
                    <div><Label>القناة المفضلة</Label><Select value={filters.channel || "all"} onValueChange={v => setFilters(f => ({ ...f, channel: v as CustomerAdvancedFilters["channel"] }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل القنوات</SelectItem><SelectItem value="store">الفرع</SelectItem><SelectItem value="online">أونلاين</SelectItem><SelectItem value="mixed">مختلط</SelectItem><SelectItem value="none">بدون مشتريات</SelectItem></SelectContent></Select></div>
                    <div className="grid grid-cols-2 gap-3"><div><Label>عنده كوبون</Label><Select value={ynValue(filters.has_coupon)} onValueChange={v => setFilters(f => ({ ...f, has_coupon: yn(v) }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem><SelectItem value="yes">نعم</SelectItem><SelectItem value="no">لا</SelectItem></SelectContent></Select></div><div><Label>عنده نقاط</Label><Select value={ynValue(filters.has_points)} onValueChange={v => setFilters(f => ({ ...f, has_points: yn(v) }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem><SelectItem value="yes">نعم</SelectItem><SelectItem value="no">لا</SelectItem></SelectContent></Select></div></div>
                    <div className="grid grid-cols-2 gap-3"><div><Label>عنده سلة</Label><Select value={ynValue(filters.has_cart)} onValueChange={v => setFilters(f => ({ ...f, has_cart: yn(v) }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem><SelectItem value="yes">نعم</SelectItem><SelectItem value="no">لا</SelectItem></SelectContent></Select></div><div><Label>سلة متروكة</Label><Select value={ynValue(filters.abandoned_cart)} onValueChange={v => setFilters(f => ({ ...f, abandoned_cart: yn(v) }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem><SelectItem value="yes">نعم</SelectItem><SelectItem value="no">لا</SelectItem></SelectContent></Select></div></div>
                    <div><Label>لم يشترِ منذ على الأقل</Label><div className="relative mt-1"><Input type="number" min="0" value={filters.inactive_days_min ?? ""} onChange={e => setFilters(f => ({ ...f, inactive_days_min: e.target.value === "" ? undefined : Number(e.target.value) }))} placeholder="مثال: 30" /><span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">يوم</span></div></div>
                    <div className="grid grid-cols-2 gap-3"><div><Label>أقل إنفاق</Label><Input className="mt-1" type="number" min="0" value={filters.min_spent ?? ""} onChange={e => setFilters(f => ({ ...f, min_spent: e.target.value === "" ? undefined : Number(e.target.value) }))} /></div><div><Label>أقصى إنفاق</Label><Input className="mt-1" type="number" min="0" value={filters.max_spent ?? ""} onChange={e => setFilters(f => ({ ...f, max_spent: e.target.value === "" ? undefined : Number(e.target.value) }))} /></div></div>
                    <div><Label>Tag يدوي</Label><Input className="mt-1" value={filters.tag || ""} onChange={e => setFilters(f => ({ ...f, tag: e.target.value || undefined }))} placeholder="مثال: VIP أو عميل جملة" /></div>
                    <Button variant="outline" className="w-full" onClick={clearFilters}><X className="ml-2 h-4 w-4" />مسح كل الفلاتر</Button>
                  </div>
                </SheetContent>
              </Sheet>
              {activeFilterCount > 0 && <Button variant="ghost" size="sm" onClick={clearFilters}>مسح</Button>}
            </div>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{(Object.keys(segmentMeta) as Array<CustomerSegment | "all">).map(key => <Button key={key} size="sm" variant={segment === key ? "default" : "outline"} className={segment === key ? "bg-[#005931] hover:bg-[#004a29]" : ""} onClick={() => setSegment(key)}>{segmentMeta[key].label}</Button>)}</div>
        </section>

        {query.isError ? <Card><CardContent className="p-8 text-center"><AlertTriangle className="mx-auto h-10 w-10 text-amber-500" /><div className="mt-3 font-bold">تعذر تحميل العملاء</div><p className="mt-1 text-sm text-muted-foreground">{(query.error as Error)?.message}</p><Button className="mt-4" onClick={() => void query.refetch()}>إعادة المحاولة</Button></CardContent></Card> : query.isLoading ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div> : rows.length === 0 ? <Card><CardContent className="p-12 text-center"><Users className="mx-auto h-12 w-12 text-slate-300" /><div className="mt-3 text-lg font-bold">لا توجد نتائج</div><p className="mt-1 text-sm text-muted-foreground">غيّر البحث أو الفلاتر لعرض عملاء آخرين.</p></CardContent></Card> : <>
          <div className="hidden overflow-hidden rounded-3xl border bg-white shadow-sm md:block"><Table><TableHeader><TableRow className="bg-slate-50/80"><TableHead>العميل</TableHead><TableHead>التصنيف</TableHead><TableHead>آخر شراء</TableHead><TableHead>المشتريات</TableHead><TableHead>صافي الإنفاق</TableHead><TableHead>الولاء</TableHead><TableHead>إشارات</TableHead><TableHead>القناة</TableHead><TableHead /></TableRow></TableHeader><TableBody>{rows.map(customer => <TableRow key={customer.id} className="cursor-pointer hover:bg-emerald-50/30" onClick={() => navigate(`/customers/${customer.id}`)}><TableCell><div className="flex items-center gap-2"><div><div className="font-bold">{customer.name?.trim() || "عميل بدون اسم"}</div><div className="mt-1 text-xs text-muted-foreground">{customer.membership_number || "—"}{customer.phone ? ` · ${customer.phone}` : ""}</div></div>{statusBadge(customer.management_status)}</div>{customer.tags?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{customer.tags.slice(0, 3).map(tag => <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>)}</div>}</TableCell><TableCell><SegmentBadge segment={customer.segment} /></TableCell><TableCell><div className="text-sm">{date(customer.last_purchase_at)}</div>{customer.days_since_last_purchase != null && <div className="text-[11px] text-muted-foreground">منذ {num(customer.days_since_last_purchase)} يوم</div>}</TableCell><TableCell><div className="font-bold">{num(customer.purchase_count)}</div><div className="text-[11px] text-muted-foreground">{num(customer.store_sales_count)} فرع · {num(customer.online_orders_count)} أونلاين</div></TableCell><TableCell><div className="font-black text-[#005931]">{money(customer.net_spent)}</div><div className="text-[11px] text-muted-foreground">متوسط {money(customer.avg_order_value)}</div></TableCell><TableCell><div className="font-bold">{num(customer.points_balance)} نقطة</div><div className="text-[11px] text-muted-foreground">{customer.active_coupon_count ? `${num(customer.active_coupon_count)} كوبون · ${money(customer.outstanding_coupon_value)}` : "بدون كوبونات"}</div></TableCell><TableCell><div className="flex flex-wrap gap-1">{customer.abandoned_cart && <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">سلة متروكة</Badge>}{customer.cart_items_count > 0 && !customer.abandoned_cart && <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">سلة {num(customer.cart_items_count)}</Badge>}</div></TableCell><TableCell><Channel value={customer.preferred_channel} /></TableCell><TableCell><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table></div>
          <div className="space-y-3 md:hidden">{rows.map(customer => <button key={customer.id} type="button" onClick={() => navigate(`/customers/${customer.id}`)} className="w-full rounded-3xl border bg-white p-4 text-right shadow-sm active:scale-[.99]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-black">{customer.name?.trim() || "عميل بدون اسم"}</div><div className="mt-1 text-xs text-muted-foreground">{customer.membership_number || "—"}{customer.phone ? ` · ${customer.phone}` : ""}</div></div><div className="flex flex-col items-end gap-1"><SegmentBadge segment={customer.segment} />{statusBadge(customer.management_status)}</div></div><div className="mt-4 grid grid-cols-3 gap-2 text-xs"><div className="rounded-xl bg-slate-50 p-2"><div className="text-muted-foreground">الإنفاق</div><strong className="text-[#005931]">{money(customer.net_spent)}</strong></div><div className="rounded-xl bg-slate-50 p-2"><div className="text-muted-foreground">الطلبات</div><strong>{num(customer.purchase_count)}</strong></div><div className="rounded-xl bg-slate-50 p-2"><div className="text-muted-foreground">النقاط</div><strong>{num(customer.points_balance)}</strong></div></div>{customer.abandoned_cart && <div className="mt-3 rounded-xl bg-orange-50 px-3 py-2 text-xs font-bold text-orange-800">سلة متروكة تحتاج متابعة</div>}<div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground"><span>{date(customer.last_purchase_at)}</span><Channel value={customer.preferred_channel} /></div></button>)}</div>
        </>}

        <div className="flex items-center justify-between rounded-2xl border bg-white p-3 text-sm"><div>صفحة {num(page)} من {num(pages)} · {num(query.data?.total)} عميل</div><div className="flex gap-2"><Button variant="outline" size="sm" disabled={offset <= 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}><ArrowRight className="ml-1 h-4 w-4" />السابق</Button><Button variant="outline" size="sm" disabled={offset + LIMIT >= Number(query.data?.total || 0)} onClick={() => setOffset(offset + LIMIT)}>التالي<ArrowLeft className="mr-1 h-4 w-4" /></Button></div></div>
      </div>
    </MainLayout>
  );
}
