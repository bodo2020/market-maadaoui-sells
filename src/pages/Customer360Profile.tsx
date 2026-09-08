import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import LoyaltyBarcode from "@/components/customers/LoyaltyBarcode";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBranchStore } from "@/stores/branchStore";
import { fetchCustomer360 } from "@/services/supabase/customer360Service";
import {
  AlertTriangle,
  ArrowRight,
  Barcode,
  Clock3,
  Gift,
  Heart,
  MapPin,
  PackageOpen,
  Phone,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  UserRound,
  WalletCards,
} from "lucide-react";

const money = (value: number | string | null | undefined) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ج.م`;
const num = (value: number | string | null | undefined) => Number(value || 0).toLocaleString("ar-EG");
const dateTime = (value?: string | null) => value ? new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—";

const segmentLabel: Record<string, string> = {
  vip: "VIP",
  loyal: "وفي",
  promising: "واعد",
  new: "جديد",
  at_risk: "معرض للتوقف",
  lost: "متوقف",
  inactive: "بلا مشتريات",
  active: "نشط",
};

const ledgerLabel: Record<string, string> = {
  earn: "اكتساب نقاط",
  redeem: "تحويل نقاط",
  reversal: "عكس نقاط",
  adjustment: "تعديل نقاط",
  bonus: "نقاط إضافية",
};

const orderStatus: Record<string, string> = {
  pending: "قيد المراجعة",
  confirmed: "تم التأكيد",
  preparing: "جاري التجهيز",
  ready: "جاهز",
  shipped: "في الطريق",
  delivered: "تم التسليم",
  cancelled: "ملغي",
  completed: "مكتمل",
};

export default function Customer360Profile() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { currentBranchId } = useBranchStore();

  const query = useQuery({
    queryKey: ["customer-360", customerId, currentBranchId],
    enabled: Boolean(customerId),
    queryFn: () => fetchCustomer360(customerId!, currentBranchId || null),
  });

  const profile = query.data;
  const initials = useMemo(() => {
    const name = profile?.customer.name?.trim() || "عميل";
    return name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  }, [profile?.customer.name]);

  if (query.isLoading) {
    return <MainLayout><div dir="rtl" className="mx-auto max-w-[1450px] space-y-4 p-4 md:p-6"><Skeleton className="h-28 rounded-3xl" /><div className="grid gap-4 lg:grid-cols-[340px_1fr]"><Skeleton className="h-[620px] rounded-3xl" /><Skeleton className="h-[620px] rounded-3xl" /></div></div></MainLayout>;
  }

  if (!profile || query.isError) {
    return <MainLayout><div dir="rtl" className="mx-auto max-w-xl p-6"><Card><CardContent className="p-10 text-center"><AlertTriangle className="mx-auto h-12 w-12 text-amber-500" /><h1 className="mt-3 text-xl font-black">تعذر فتح ملف العميل</h1><p className="mt-2 text-sm text-muted-foreground">{(query.error as Error)?.message || "العميل غير موجود."}</p><div className="mt-5 flex justify-center gap-2"><Button variant="outline" onClick={() => navigate("/customers")}><ArrowRight className="ml-2 h-4 w-4" />العملاء</Button><Button onClick={() => void query.refetch()}><RefreshCw className="ml-2 h-4 w-4" />إعادة المحاولة</Button></div></CardContent></Card></div></MainLayout>;
  }

  const { customer, loyalty, management, engagement, purchases, ledger, vouchers, addresses, favorites, cart, returns } = profile;
  const suggestions = [
    !customer.phone?.trim() ? { title: "بيانات التواصل ناقصة", text: "أضف رقم الموبايل لتسهيل التواصل وربط الهوية داخل الفرع.", tone: "amber" } : null,
    cart.length > 0 ? { title: "سلة حالية", text: `العميل لديه ${num(cart.length)} صنف في السلة${engagement.cart_updated_at ? ` وآخر تعديل ${dateTime(engagement.cart_updated_at)}` : ""}.`, tone: "blue" } : null,
    management.outstanding_coupon_value > 0 ? { title: "كوبون خصم متاح", text: `لديه كوبونات بقيمة متبقية ${money(management.outstanding_coupon_value)} يمكن استخدامها في التطبيق أو الفرع.`, tone: "emerald" } : null,
    management.segment === "at_risk" || management.segment === "lost" ? { title: "يحتاج متابعة", text: `آخر شراء كان منذ ${num(engagement.days_since_last_purchase)} يوم.`, tone: "orange" } : null,
    favorites.length >= 3 ? { title: "اهتمامات واضحة", text: `لديه ${num(favorites.length)} منتجات في المفضلة ويمكن الاستفادة منها في عروض موجهة مستقبلًا.`, tone: "violet" } : null,
  ].filter(Boolean) as Array<{ title: string; text: string; tone: string }>;

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-[1450px] space-y-5 p-3 pb-12 md:p-6">
        <section className="rounded-3xl bg-[#005931] p-5 text-white shadow-[0_16px_45px_rgba(0,89,49,.18)] md:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <Button variant="secondary" size="icon" className="shrink-0 bg-white/10 text-white hover:bg-white/20" onClick={() => navigate("/customers")}><ArrowRight className="h-5 w-5" /></Button>
              <Avatar className="h-16 w-16 border-2 border-white/20"><AvatarFallback className="bg-white text-lg font-black text-[#005931]">{initials}</AvatarFallback></Avatar>
              <div className="min-w-0"><div className="mb-1 flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-black">{customer.name?.trim() || "عميل بدون اسم"}</h1><Badge className="bg-white/10 text-white hover:bg-white/10">{segmentLabel[management.segment] || management.segment}</Badge></div><div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-emerald-100"><span>{loyalty.membership_number}</span>{customer.phone?.trim() && <span>{customer.phone}</span>}<span>عميل منذ {num(engagement.customer_age_days)} يوم</span></div></div>
            </div>
            <div className="flex gap-2"><Button variant="secondary" className="bg-white text-[#005931] hover:bg-emerald-50" onClick={() => void query.refetch()}><RefreshCw className="ml-2 h-4 w-4" />تحديث الملف</Button></div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
          <aside className="space-y-4 lg:sticky lg:top-24">
            <Card className="border-0 shadow-sm ring-1 ring-slate-200"><CardContent className="p-5"><div className="flex items-center gap-3"><UserRound className="h-5 w-5 text-[#005931]" /><div><div className="font-black">بيانات العميل</div><div className="text-xs text-muted-foreground">هوية وتواصل</div></div></div><div className="mt-4 space-y-3 text-sm">{customer.phone?.trim() ? <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-primary"><Phone className="h-4 w-4" />{customer.phone}</a> : <div className="flex items-center gap-2 text-amber-700"><Phone className="h-4 w-4" />لا يوجد رقم موبايل</div>}{customer.address && <div className="flex items-start gap-2 text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span>{customer.address}</span></div>}<div className="border-t pt-3 text-xs text-muted-foreground">آخر شراء: <strong className="text-foreground">{dateTime(management.last_purchase_at)}</strong></div></div></CardContent></Card>

            <Card className="overflow-hidden border-0 bg-[#005931] text-white shadow-[0_16px_40px_rgba(0,89,49,.18)]"><CardContent className="p-5"><div className="flex items-start justify-between"><div><div className="text-sm text-emerald-100">بطاقة المعداوي</div><div className="mt-1 font-mono text-sm font-black">{loyalty.membership_number}</div></div><Gift className="h-5 w-5 text-emerald-200" /></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-white/10 p-3"><div className="text-[11px] text-emerald-100">النقاط الحالية</div><div className="mt-1 text-xl font-black">{num(loyalty.points_balance)}</div></div><div className="rounded-xl bg-white/10 p-3"><div className="text-[11px] text-emerald-100">قابل للتحويل</div><div className="mt-1 text-xl font-black">{money(loyalty.redeemable_credit_egp)}</div></div></div><div className="mt-4 rounded-2xl bg-white p-3 text-slate-900"><div className="mb-2 flex items-center justify-between text-[11px]"><span className="flex items-center gap-1 font-bold text-[#005931]"><Barcode className="h-3.5 w-3.5" />باركود العميل</span><span className="font-mono text-slate-500">{loyalty.barcode_token}</span></div><LoyaltyBarcode value={loyalty.barcode_token} /></div><div className="mt-3 flex justify-between text-[11px] text-emerald-100"><span>{num(loyalty.points_per_egp)} نقطة لكل جنيه</span><span>{num(loyalty.redemption_points)} نقطة = {money(loyalty.redemption_value_egp)}</span></div></CardContent></Card>
          </aside>

          <main className="min-w-0 space-y-5">
            <section className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Card><CardContent className="p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>صافي الإنفاق</span><TrendingUp className="h-4 w-4 text-[#005931]" /></div><div className="mt-2 text-2xl font-black text-[#005931]">{money(management.net_spent)}</div></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>عدد المشتريات</span><ReceiptText className="h-4 w-4 text-[#005931]" /></div><div className="mt-2 text-2xl font-black">{num(management.purchase_count)}</div></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>متوسط الطلب</span><WalletCards className="h-4 w-4 text-[#005931]" /></div><div className="mt-2 text-2xl font-black">{money(management.avg_order_value)}</div></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>كوبونات متاحة</span><Gift className="h-4 w-4 text-[#005931]" /></div><div className="mt-2 text-2xl font-black">{money(management.outstanding_coupon_value)}</div></CardContent></Card></section>

            {suggestions.length > 0 && <Card className="border-emerald-100 bg-emerald-50/40"><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-5 w-5 text-[#005931]" />فرص وملاحظات ذكية</CardTitle></CardHeader><CardContent className="grid gap-2 md:grid-cols-2">{suggestions.map(item => <div key={item.title} className="rounded-2xl border bg-white p-3"><div className="font-bold">{item.title}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{item.text}</div></div>)}</CardContent></Card>}

            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1"><TabsTrigger value="overview">نظرة عامة</TabsTrigger><TabsTrigger value="purchases">المشتريات</TabsTrigger><TabsTrigger value="loyalty">الولاء والكوبونات</TabsTrigger><TabsTrigger value="engagement">السلة والمفضلة</TabsTrigger><TabsTrigger value="service">العناوين والمرتجعات</TabsTrigger></TabsList>

              <TabsContent value="overview" className="space-y-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">شراء من الفرع</div><div className="mt-1 text-xl font-black">{num(management.store_sales_count)}</div></CardContent></Card><Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">طلبات أونلاين مكتملة</div><div className="mt-1 text-xl font-black">{num(management.online_orders_count)}</div></CardContent></Card><Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">خصم ولاء مستخدم</div><div className="mt-1 text-xl font-black">{money(management.loyalty_discount)}</div></CardContent></Card><Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">الأيام منذ آخر شراء</div><div className="mt-1 text-xl font-black">{engagement.days_since_last_purchase == null ? "—" : num(engagement.days_since_last_purchase)}</div></CardContent></Card></div><Card><CardHeader className="pb-2"><CardTitle className="text-base">ملخص النشاط</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5"><div className="rounded-2xl bg-slate-50 p-3 text-center"><ShoppingCart className="mx-auto h-5 w-5 text-[#005931]" /><div className="mt-2 text-xl font-black">{num(engagement.cart_items_count)}</div><div className="text-[11px] text-muted-foreground">في السلة</div></div><div className="rounded-2xl bg-slate-50 p-3 text-center"><Heart className="mx-auto h-5 w-5 text-[#005931]" /><div className="mt-2 text-xl font-black">{num(engagement.favorites_count)}</div><div className="text-[11px] text-muted-foreground">مفضلة</div></div><div className="rounded-2xl bg-slate-50 p-3 text-center"><MapPin className="mx-auto h-5 w-5 text-[#005931]" /><div className="mt-2 text-xl font-black">{num(engagement.addresses_count)}</div><div className="text-[11px] text-muted-foreground">عنوان</div></div><div className="rounded-2xl bg-slate-50 p-3 text-center"><Gift className="mx-auto h-5 w-5 text-[#005931]" /><div className="mt-2 text-xl font-black">{num(engagement.vouchers_count)}</div><div className="text-[11px] text-muted-foreground">كوبون</div></div><div className="rounded-2xl bg-slate-50 p-3 text-center"><RotateCcw className="mx-auto h-5 w-5 text-[#005931]" /><div className="mt-2 text-xl font-black">{num(engagement.returns_count)}</div><div className="text-[11px] text-muted-foreground">مرتجع</div></div></CardContent></Card></TabsContent>

              <TabsContent value="purchases"><Card><CardHeader><CardTitle className="text-base">المشتريات الموحدة</CardTitle></CardHeader><CardContent>{purchases.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد مشتريات مرتبطة بالعميل.</div> : <div className="space-y-2">{purchases.map(p => <div key={`${p.source_channel}-${p.id}`} className="flex flex-wrap items-center gap-3 rounded-2xl border p-4"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${p.source_channel === "store" ? "bg-emerald-50 text-[#005931]" : "bg-blue-50 text-blue-700"}`}>{p.source_channel === "store" ? <Store className="h-5 w-5" /> : <ShoppingBag className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong>{p.source_channel === "store" ? "شراء من الفرع" : "طلب أونلاين"}</strong><Badge variant="outline">{orderStatus[p.status] || p.status}</Badge></div><div className="mt-1 text-xs text-muted-foreground">{p.reference ? `#${p.reference} · ` : ""}{dateTime(p.created_at)}{p.branch_name ? ` · ${p.branch_name}` : ""}</div></div><div className="text-left"><div className="font-black text-[#005931]">{money(p.total)}</div><div className="text-[11px] text-muted-foreground">{num(p.item_count)} صنف</div></div></div>)}</div>}</CardContent></Card></TabsContent>

              <TabsContent value="loyalty" className="space-y-4"><Card><CardHeader><CardTitle className="text-base">كوبونات الخصم</CardTitle></CardHeader><CardContent>{vouchers.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد كوبونات خصم.</div> : <div className="grid gap-3 md:grid-cols-2">{vouchers.map(v => <div key={v.id} className="rounded-2xl border p-4"><div className="flex items-start justify-between"><div><div className="font-mono text-xs text-muted-foreground">{v.voucher_code}</div><div className="mt-1 text-xl font-black text-[#005931]">{money(v.remaining_value_egp)}</div></div><Badge variant="outline">{v.status === "active" ? "متاح" : v.status}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-slate-50 p-2">القيمة الأصلية<br /><strong>{money(v.initial_value_egp)}</strong></div><div className="rounded-xl bg-slate-50 p-2">النقاط المحولة<br /><strong>{num(v.points_spent)}</strong></div></div></div>)}</div>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">سجل نقاط الولاء</CardTitle></CardHeader><CardContent>{ledger.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد حركات نقاط.</div> : <div className="space-y-2">{ledger.map(item => <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border p-3"><div><div className="font-bold">{ledgerLabel[item.entry_type] || item.entry_type}</div><div className="mt-1 text-xs text-muted-foreground">{dateTime(item.created_at)}{item.reference ? ` · ${item.reference}` : ""}</div></div><div className={`font-black ${item.points_delta >= 0 ? "text-emerald-700" : "text-red-600"}`}>{item.points_delta > 0 ? "+" : ""}{num(item.points_delta)} نقطة</div></div>)}</div>}</CardContent></Card></TabsContent>

              <TabsContent value="engagement" className="space-y-4"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShoppingCart className="h-5 w-5 text-[#005931]" />السلة الحالية</CardTitle></CardHeader><CardContent>{cart.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">السلة فارغة.</div> : <div className="grid gap-3 sm:grid-cols-2">{cart.map(item => <div key={item.id} className="flex items-center gap-3 rounded-2xl border p-3">{item.product_image ? <img src={item.product_image} alt="" className="h-14 w-14 rounded-xl object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100"><PackageOpen className="h-5 w-5 text-slate-400" /></div>}<div className="min-w-0 flex-1"><div className="truncate font-bold">{item.product_name || "منتج"}</div><div className="mt-1 text-xs text-muted-foreground">الكمية {num(item.quantity)} · {money(item.unit_price)}</div><div className="mt-1 text-[11px] text-muted-foreground">آخر تعديل {dateTime(item.updated_at)}</div></div></div>)}</div>}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Heart className="h-5 w-5 text-[#005931]" />المفضلة</CardTitle></CardHeader><CardContent>{favorites.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد منتجات مفضلة.</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{favorites.map(item => <div key={item.id} className="flex items-center gap-3 rounded-2xl border p-3">{item.variant_image || item.product_image ? <img src={item.variant_image || item.product_image || ""} alt="" className="h-14 w-14 rounded-xl object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100"><Heart className="h-5 w-5 text-slate-400" /></div>}<div className="min-w-0"><div className="truncate font-bold">{item.variant_name || item.product_name || "منتج"}</div><div className="mt-1 text-[11px] text-muted-foreground">أضيف {dateTime(item.created_at)}</div></div></div>)}</div>}</CardContent></Card></TabsContent>

              <TabsContent value="service" className="space-y-4"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-5 w-5 text-[#005931]" />عناوين التوصيل</CardTitle></CardHeader><CardContent>{addresses.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد عناوين محفوظة.</div> : <div className="space-y-2">{addresses.map(a => <div key={a.id} className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-bold">{a.address}</div><div className="mt-1 text-xs text-muted-foreground">{a.assigned_branch_name ? `الفرع: ${a.assigned_branch_name}` : "بدون فرع مخصص"}{a.road_distance_km != null ? ` · ${num(a.road_distance_km)} كم` : ""}{a.road_duration_minutes != null ? ` · ${num(a.road_duration_minutes)} دقيقة` : ""}</div></div><div className="flex gap-1">{a.is_default && <Badge>افتراضي</Badge>}<Badge variant="outline" className={a.is_deliverable ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}>{a.is_deliverable ? "متاح للتوصيل" : "خارج التغطية"}</Badge></div></div></div>)}</div>}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><RotateCcw className="h-5 w-5 text-[#005931]" />المرتجعات</CardTitle></CardHeader><CardContent>{returns.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد مرتجعات.</div> : <div className="space-y-2">{returns.map(r => <div key={r.id} className="rounded-2xl border p-4"><div className="flex items-center justify-between"><div><div className="font-bold">مرتجع {r.source === "pos" ? "من الفرع" : "أونلاين"}</div><div className="mt-1 text-xs text-muted-foreground">{dateTime(r.created_at)}{r.branch_name ? ` · ${r.branch_name}` : ""}</div></div><div className="font-black text-red-600">{money(r.total_amount)}</div></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div className="rounded-xl bg-slate-50 p-2">نقدي<br /><strong>{money(r.refund_cash_amount)}</strong></div><div className="rounded-xl bg-slate-50 p-2">بطاقة<br /><strong>{money(r.refund_card_amount)}</strong></div><div className="rounded-xl bg-slate-50 p-2">كوبون<br /><strong>{money(r.refund_loyalty_amount)}</strong></div></div></div>)}</div>}</CardContent></Card></TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </MainLayout>
  );
}
