import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  Building2,
  CalendarDays,
  CircleDollarSign,
  FileSignature,
  Landmark,
  LoaderCircle,
  LogOut,
  PackageX,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Store,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchMyFranchisePortal,
  fetchMyFranchisePortalIdentity,
  signOutFranchisePortal,
  type FranchisePortalBranch,
} from "@/services/supabase/franchisePortalService";

function localDate(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

function defaultPeriod() {
  const now = new Date();
  return { start: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: localDate(now) };
}

function toStartIso(date: string) { return new Date(`${date}T00:00:00`).toISOString(); }
function toEndIso(date: string) { return new Date(`${date}T23:59:59.999`).toISOString(); }

function money(value: number | null | undefined, currency = "EGP") {
  return new Intl.NumberFormat("ar-EG", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function number(value: number | null | undefined, digits = 0) {
  return Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: digits });
}

function roleLabel(role: string) {
  if (role === "owner") return "المالك";
  if (role === "admin") return "مدير المشغّل";
  return "مدير تشغيل";
}

function agreementStatus(status?: string | null) {
  const labels: Record<string, string> = { draft: "مسودة", review: "تحت المراجعة", approved: "معتمد", active: "نشط", suspended: "موقوف", expired: "منتهي", terminated: "منهى" };
  return status ? labels[status] || status : "—";
}

function Kpi({ title, value, hint, icon: Icon }: { title: string; value: string; hint?: string; icon: typeof Store }) {
  return (
    <Card className="rounded-3xl border-slate-100 shadow-sm">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div><p className="text-xs font-black text-slate-400">{title}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p>{hint ? <p className="mt-1 text-xs font-bold text-slate-500">{hint}</p> : null}</div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-[#005931]"><Icon className="h-5 w-5" /></div>
      </CardContent>
    </Card>
  );
}

function BranchCard({ branch, currency, analytics }: { branch: FranchisePortalBranch; currency: string; analytics: boolean }) {
  return (
    <Card className="rounded-3xl border-slate-100 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div><CardTitle className="text-lg font-black">{branch.name}</CardTitle><p className="mt-1 text-xs font-bold text-slate-500">{branch.code}{branch.franchise_code ? ` • ${branch.franchise_code}` : ""}</p></div>
          <Badge className={branch.active ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-slate-100 text-slate-600 hover:bg-slate-100"}>{branch.active ? "نشط" : "متوقف"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {branch.address ? <p className="text-sm font-bold leading-6 text-slate-600">{branch.address}</p> : null}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black text-slate-400">المنتجات</p><p className="mt-1 font-black">{number(branch.inventory.product_count)}</p></div>
          <div className="rounded-2xl bg-amber-50 p-3"><p className="text-[10px] font-black text-amber-700">مخزون منخفض</p><p className="mt-1 font-black text-amber-900">{number(branch.inventory.low_stock_count)}</p></div>
          <div className="rounded-2xl bg-red-50 p-3"><p className="text-[10px] font-black text-red-700">نافد</p><p className="mt-1 font-black text-red-900">{number(branch.inventory.out_of_stock_count)}</p></div>
        </div>
        {analytics && branch.period_sales ? (
          <div className="grid grid-cols-2 gap-2 border-t pt-4">
            <div><p className="text-[10px] font-black text-slate-400">POS للفترة</p><p className="mt-1 text-sm font-black">{money(branch.period_sales.pos_gross, currency)}</p></div>
            <div><p className="text-[10px] font-black text-slate-400">Online مسلّم</p><p className="mt-1 text-sm font-black">{money(branch.period_sales.online_delivered_gross, currency)}</p></div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function FranchisePortalDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { merchantId } = useParams<{ merchantId: string }>();
  const initialPeriod = useMemo(defaultPeriod, []);
  const [periodStart, setPeriodStart] = useState(initialPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.end);

  const identityQuery = useQuery({ queryKey: ["franchise-portal-identity"], queryFn: fetchMyFranchisePortalIdentity, staleTime: 30_000, retry: false });
  const selectedMerchantId = merchantId || identityQuery.data?.default_merchant_id;

  const workspaceQuery = useQuery({
    queryKey: ["franchise-portal", selectedMerchantId, periodStart, periodEnd],
    queryFn: () => fetchMyFranchisePortal(selectedMerchantId!, toStartIso(periodStart), toEndIso(periodEnd)),
    enabled: !!selectedMerchantId && !!periodStart && !!periodEnd,
    staleTime: 20_000,
    refetchInterval: 60_000,
    retry: false,
  });

  const logout = async () => {
    await signOutFranchisePortal();
    queryClient.clear();
    navigate("/franchise-login", { replace: true });
  };

  if (identityQuery.isLoading || workspaceQuery.isLoading) {
    return <div dir="rtl" className="grid min-h-screen place-items-center bg-slate-50"><div className="text-center"><LoaderCircle className="mx-auto h-8 w-8 animate-spin text-[#005931]" /><p className="mt-3 text-sm font-bold text-slate-500">جارٍ تحميل بوابة التشغيل…</p></div></div>;
  }

  if (identityQuery.error || workspaceQuery.error || !workspaceQuery.data) {
    const error = identityQuery.error || workspaceQuery.error;
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <div className="w-full max-w-lg rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <TriangleAlert className="mx-auto h-10 w-10 text-red-600" /><h1 className="mt-4 text-xl font-black">تعذر تحميل البوابة</h1>
          <p className="mt-2 text-sm font-bold leading-7 text-slate-500">{error instanceof Error ? error.message : "راجع الصلاحية وحاول مرة أخرى."}</p>
          <div className="mt-6 flex justify-center gap-2"><Button variant="outline" onClick={() => workspaceQuery.refetch()}>إعادة المحاولة</Button><Button className="bg-[#005931] hover:bg-[#004a29]" onClick={() => void logout()}>تسجيل الخروج</Button></div>
        </div>
      </div>
    );
  }

  const data = workspaceQuery.data;
  const capabilities = data.identity.capabilities;
  const currency = data.agreement?.currency || "EGP";
  const finance = data.finance;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#005931] text-white"><Store className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><p className="truncate font-black">{data.merchant.name}</p><div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500"><span>بوابة المعداوي Franchise</span><Badge variant="outline" className="h-5">{roleLabel(data.identity.role)}</Badge></div></div>
          {data.identity.memberships.length > 1 ? (
            <select value={data.identity.selected_merchant_id} onChange={(event) => navigate(`/franchise-portal/${event.target.value}`)} className="hidden max-w-[220px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold sm:block">
              {data.identity.memberships.map((membership) => <option key={membership.merchant_id} value={membership.merchant_id}>{membership.merchant_name}</option>)}
            </select>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => void logout()}><LogOut className="ml-2 h-4 w-4" />خروج</Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-emerald-100 bg-gradient-to-l from-emerald-50 to-white p-5 lg:flex-row lg:items-center lg:justify-between">
          <div><div className="flex flex-wrap items-center gap-2"><Badge className="bg-[#005931] hover:bg-[#005931]">FRANCHISE OPERATOR</Badge><Badge variant="outline">{agreementStatus(data.agreement?.status)}</Badge></div><h1 className="mt-3 text-2xl font-black sm:text-3xl">أهلًا بك في مركز تشغيل {data.merchant.name}</h1><p className="mt-2 text-sm font-bold text-slate-500">بياناتك معزولة على المشغّل والفروع المرتبطة بحسابك فقط.</p></div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
            <div><label className="mb-1 block text-[10px] font-black text-slate-400">من</label><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="h-10 bg-white" /></div>
            <div><label className="mb-1 block text-[10px] font-black text-slate-400">إلى</label><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="h-10 bg-white" /></div>
            <Button variant="outline" className="col-span-2 bg-white sm:col-span-1" onClick={() => workspaceQuery.refetch()}><RefreshCw className={`ml-2 h-4 w-4 ${workspaceQuery.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi title="الفروع" value={number(data.branches.length)} hint={`${data.branches.filter((branch) => branch.active).length} فرع نشط`} icon={Building2} />
          {capabilities.can_view_analytics && data.sales ? <Kpi title="إجمالي مبيعات الفترة" value={money(data.sales.total_gross, currency)} hint={`${number(data.sales.pos_count + data.sales.online_delivered_count)} عملية مكتملة`} icon={BarChart3} /> : <Kpi title="التحليلات" value="غير متاحة" hint="حسب شروط العقد الحالي" icon={ShieldCheck} />}
          <Kpi title="قيمة المخزون للبيع" value={money(data.inventory.retail_value, currency)} hint={`${number(data.inventory.product_count)} سجل مخزون`} icon={Boxes} />
          {capabilities.can_view_finance && finance ? <Kpi title="الرصيد غير المسوّى" value={money(Math.abs(finance.unsettled_balance), currency)} hint={finance.balance_direction === "merchant_owes_platform" ? "مستحق للمعداوي" : finance.balance_direction === "platform_owes_merchant" ? "مستحق للمشغّل" : "لا يوجد رصيد مفتوح"} icon={CircleDollarSign} /> : <Kpi title="تنبيهات المخزون" value={number(data.inventory.low_stock_count + data.inventory.out_of_stock_count)} hint={`${number(data.inventory.out_of_stock_count)} منتج نافد`} icon={PackageX} />}
        </section>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-2xl bg-white p-1 shadow-sm">
            <TabsTrigger value="overview" className="rounded-xl">الرئيسية</TabsTrigger><TabsTrigger value="branches" className="rounded-xl">الفروع</TabsTrigger><TabsTrigger value="inventory" className="rounded-xl">المخزون</TabsTrigger>{capabilities.can_view_finance ? <TabsTrigger value="finance" className="rounded-xl">المالية والتسويات</TabsTrigger> : null}<TabsTrigger value="agreement" className="rounded-xl">العقد والسياسات</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {capabilities.can_view_analytics && data.sales ? (
              <div className="grid gap-4 lg:grid-cols-3">
                <Kpi title="POS" value={money(data.sales.pos_gross, currency)} hint={`${number(data.sales.pos_count)} فاتورة`} icon={Store} />
                <Kpi title="Online تم تسليمه" value={money(data.sales.online_delivered_gross, currency)} hint={`${number(data.sales.online_delivered_count)} طلب مسلّم`} icon={ShoppingBag} />
                <Kpi title="ربح POS المسجل" value={money(data.sales.pos_profit, currency)} hint="بعد رسوم الدفع المسجلة" icon={Landmark} />
              </div>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="rounded-3xl border-slate-100 shadow-sm"><CardHeader><CardTitle className="text-lg font-black">حالة الشبكة</CardTitle></CardHeader><CardContent className="space-y-3">{data.branches.map((branch) => <div key={branch.id} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3"><div><p className="font-black">{branch.name}</p><p className="mt-1 text-xs font-bold text-slate-500">{branch.code}</p></div><Badge className={branch.active ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-slate-200 text-slate-600 hover:bg-slate-200"}>{branch.active ? "يعمل" : "متوقف"}</Badge></div>)}</CardContent></Card>
              <Card className="rounded-3xl border-slate-100 shadow-sm"><CardHeader><CardTitle className="text-lg font-black">حالة المخزون</CardTitle></CardHeader><CardContent><div className="grid grid-cols-3 gap-3 text-center"><div className="rounded-2xl bg-emerald-50 p-4"><Boxes className="mx-auto h-5 w-5 text-[#005931]" /><p className="mt-2 text-xl font-black">{number(data.inventory.product_count)}</p><p className="text-[10px] font-black text-slate-500">منتج</p></div><div className="rounded-2xl bg-amber-50 p-4"><TriangleAlert className="mx-auto h-5 w-5 text-amber-700" /><p className="mt-2 text-xl font-black">{number(data.inventory.low_stock_count)}</p><p className="text-[10px] font-black text-amber-700">منخفض</p></div><div className="rounded-2xl bg-red-50 p-4"><PackageX className="mx-auto h-5 w-5 text-red-700" /><p className="mt-2 text-xl font-black">{number(data.inventory.out_of_stock_count)}</p><p className="text-[10px] font-black text-red-700">نافد</p></div></div></CardContent></Card>
            </div>
          </TabsContent>

          <TabsContent value="branches"><div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{data.branches.map((branch) => <BranchCard key={branch.id} branch={branch} currency={currency} analytics={capabilities.can_view_analytics} />)}</div></TabsContent>

          <TabsContent value="inventory">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Kpi title="سجلات المخزون" value={number(data.inventory.product_count)} icon={Boxes} /><Kpi title="الوحدات المتاحة" value={number(data.inventory.units, 3)} icon={ShoppingBag} /><Kpi title="مخزون منخفض" value={number(data.inventory.low_stock_count)} icon={TriangleAlert} /><Kpi title="نافد من المخزون" value={number(data.inventory.out_of_stock_count)} icon={PackageX} /></div>
            <Card className="mt-4 rounded-3xl border-slate-100 shadow-sm"><CardHeader><CardTitle className="text-lg font-black">تقييم المخزون</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black text-slate-400">قيمة البيع الحالية</p><p className="mt-2 text-2xl font-black">{money(data.inventory.retail_value, currency)}</p></div>{data.inventory.cost_value != null ? <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black text-slate-400">قيمة التكلفة</p><p className="mt-2 text-2xl font-black">{money(data.inventory.cost_value, currency)}</p></div> : null}</CardContent></Card>
          </TabsContent>

          {capabilities.can_view_finance && finance ? (
            <TabsContent value="finance" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Kpi title="Royalty" value={money(finance.royalty, currency)} icon={CircleDollarSign} /><Kpi title="Marketing" value={money(finance.marketing, currency)} icon={BarChart3} /><Kpi title="Platform" value={money(finance.platform, currency)} icon={WalletCards} /><Kpi title="Fixed" value={money(finance.fixed, currency)} icon={Landmark} /><Kpi title="Adjustments" value={money(finance.adjustments, currency)} icon={RefreshCw} /></div>
              <Card className="rounded-3xl border-slate-100 shadow-sm"><CardHeader><CardTitle className="text-lg font-black">التسويات</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[760px] text-right text-sm"><thead><tr className="border-b text-xs font-black text-slate-400"><th className="p-3">المرجع</th><th className="p-3">الفترة</th><th className="p-3">الحالة</th><th className="p-3">الصافي</th><th className="p-3">مرجع الدفع</th></tr></thead><tbody>{finance.settlements.length ? finance.settlements.map((settlement) => <tr key={settlement.id} className="border-b last:border-0"><td className="p-3 font-black">{settlement.reference}</td><td className="p-3 text-slate-500">{new Date(settlement.period_start).toLocaleDateString("ar-EG")} — {new Date(settlement.period_end).toLocaleDateString("ar-EG")}</td><td className="p-3"><Badge variant="outline">{settlement.status}</Badge></td><td className="p-3 font-black">{money(settlement.net_payable, settlement.currency || currency)}</td><td className="p-3 text-slate-500">{settlement.external_reference || "—"}</td></tr>) : <tr><td colSpan={5} className="p-8 text-center font-bold text-slate-400">لا توجد تسويات حتى الآن.</td></tr>}</tbody></table></CardContent></Card>
              <Card className="rounded-3xl border-slate-100 shadow-sm"><CardHeader><CardTitle className="text-lg font-black">آخر القيود المالية</CardTitle></CardHeader><CardContent className="space-y-2">{finance.entries.slice(0, 12).map((entry) => <div key={entry.id} className="flex flex-col gap-2 rounded-2xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">{entry.description || entry.entry_type}</p><p className="mt-1 text-xs font-bold text-slate-400">{new Date(entry.occurred_at).toLocaleString("ar-EG")}{entry.settled ? " • داخل تسوية" : " • مفتوح"}</p></div><p className={`font-black ${entry.signed_amount < 0 ? "text-red-700" : "text-emerald-700"}`}>{money(entry.signed_amount, entry.currency || currency)}</p></div>)}</CardContent></Card>
            </TabsContent>
          ) : null}

          <TabsContent value="agreement">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="rounded-3xl border-slate-100 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-lg font-black"><FileSignature className="h-5 w-5 text-[#005931]" />العقد الحالي</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-sm">{data.agreement ? <><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black text-slate-400">الكود</p><p className="mt-1 font-black">{data.agreement.agreement_code}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black text-slate-400">الإصدار</p><p className="mt-1 font-black">v{data.agreement.version}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black text-slate-400">البداية</p><p className="mt-1 font-black">{new Date(data.agreement.starts_on).toLocaleDateString("ar-EG")}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black text-slate-400">النهاية</p><p className="mt-1 font-black">{data.agreement.ends_on ? new Date(data.agreement.ends_on).toLocaleDateString("ar-EG") : "مفتوح"}</p></div></> : <p className="col-span-2 text-slate-500">لا يوجد عقد حالي.</p>}</CardContent></Card>
              <Card className="rounded-3xl border-slate-100 shadow-sm"><CardHeader><CardTitle className="text-lg font-black">سياسات التشغيل</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{data.agreement ? <>{[["التسوية",data.agreement.settlement_cycle],["التسعير",data.agreement.pricing_policy],["الكتالوج",data.agreement.catalog_policy],["الموردون",data.agreement.supplier_policy],["العروض",data.agreement.promotion_policy]].map(([label,value]) => <div key={label} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3"><span className="font-bold text-slate-500">{label}</span><span className="font-black">{value}</span></div>)}</> : null}</CardContent></Card>
              {capabilities.can_view_finance && data.agreement ? <Card className="rounded-3xl border-slate-100 shadow-sm lg:col-span-2"><CardHeader><CardTitle className="text-lg font-black">الشروط المالية</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Kpi title="Royalty" value={`${number(data.agreement.royalty_rate, 2)}%`} icon={CircleDollarSign} /><Kpi title="Marketing" value={`${number(data.agreement.marketing_fee_rate, 2)}%`} icon={BarChart3} /><Kpi title="Platform" value={`${number(data.agreement.platform_fee_rate, 2)}%`} icon={WalletCards} /><Kpi title="Monthly Fixed" value={money(data.agreement.monthly_fixed_fee, currency)} icon={CalendarDays} /></CardContent></Card> : null}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
