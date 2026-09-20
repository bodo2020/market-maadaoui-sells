import { FormEvent, ReactNode, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle, ArrowLeft, Banknote, CheckCircle2, CircleDot, Clock3, ExternalLink,
  Headphones, Mail, MapPinned, MessageCircle, PackageSearch, Phone, RefreshCw,
  RotateCcw, Search, ShieldCheck, ShoppingBag, Store, Truck, UserRound,
  WalletCards, Wrench,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useBranchStore } from "@/stores/branchStore";
import {
  fetchCustomerServiceCase,
  searchCustomerServiceCases,
  type CustomerServiceCase,
  type CustomerServiceSearchResult,
  type CustomerServiceTimelineEvent,
} from "@/services/supabase/customerServiceWorkspaceService";

const money = (value: number | string | null | undefined) => `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
const dateTime = (value?: string | null) => value ? new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const shortId = (value?: string | null) => value ? value.slice(0, 8).toUpperCase() : "—";

const statusLabels: Record<string, string> = {
  pending: "قيد الانتظار", confirmed: "مؤكد", processing: "قيد التجهيز", ready: "جاهز",
  shipped: "خرج للتوصيل", delivered: "تم التسليم", cancelled: "ملغي", paid: "مدفوع",
  failed: "متعذر", refunded: "مسترد", completed: "مكتمل", open: "مفتوح",
  resolved: "تم الحل", claimed: "تم الاستلام", approved: "مقبول", rejected: "مرفوض",
};

function StatusBadge({ value }: { value?: string | null }) {
  const status = value || "unknown";
  const color = ["delivered", "paid", "completed", "resolved", "approved"].includes(status)
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : ["cancelled", "failed", "rejected"].includes(status)
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return <Badge variant="outline" className={color}>{statusLabels[status] || status}</Badge>;
}

function InfoCard({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return <Card className="border-slate-200 shadow-sm"><CardHeader className="flex-row items-center justify-between space-y-0 pb-3"><CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>{action}</CardHeader><CardContent>{children}</CardContent></Card>;
}

function LabelValue({ label, value }: { label: string; value?: ReactNode }) {
  return <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0"><span className="text-xs text-slate-500">{label}</span><span className="text-left text-sm font-bold text-slate-800">{value || "—"}</span></div>;
}

function ResultCard({ result, active, onClick }: { result: CustomerServiceSearchResult; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`w-full rounded-2xl border p-4 text-right transition ${active ? "border-emerald-500 bg-emerald-50 shadow-sm" : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50"}`}>
    <div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-900">{result.customer_name}</p><p className="mt-1 text-xs text-slate-500" dir="ltr">{result.customer_phone || "بدون هاتف"}</p></div><StatusBadge value={result.order_status} /></div>
    <div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-[11px] text-slate-500">#{result.tracking_number || shortId(result.order_id)}</p><p className="mt-1 text-xs text-slate-600">{result.branch_name || result.merchant_name || "فرع غير محدد"}</p></div><p className="font-black text-emerald-800">{money(result.total)}</p></div>
    <p className="mt-3 text-[11px] text-slate-400">{dateTime(result.created_at)}</p>
  </button>;
}

const timelineIcon = (event: CustomerServiceTimelineEvent) => {
  if (event.event_type === "delivery") return <Truck className="h-4 w-4" />;
  if (event.event_type === "refund") return <Banknote className="h-4 w-4" />;
  if (event.event_type === "return") return <RotateCcw className="h-4 w-4" />;
  if (event.event_type === "issue") return <AlertCircle className="h-4 w-4" />;
  if (event.event_type === "task") return <Wrench className="h-4 w-4" />;
  return <CircleDot className="h-4 w-4" />;
};

function EmptyDetail() {
  return <div className="flex min-h-[520px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><div className="rounded-full bg-emerald-50 p-5 text-emerald-700"><Headphones className="h-10 w-10" /></div><h2 className="mt-5 text-xl font-black">اختر طلبًا لفتح الحالة</h2><p className="mt-2 max-w-md text-sm leading-7 text-slate-500">ستظهر هنا بيانات العميل والطلب والدفع والتوصيل والمشكلات والاستردادات في شاشة واحدة.</p></div>;
}

function CaseDetails({ data }: { data: CustomerServiceCase }) {
  const navigate = useNavigate();
  const openIssues = data.issues.filter(item => !["resolved", "closed", "completed"].includes(item.status));
  const openTasks = data.tasks.filter(item => !["completed", "cancelled"].includes(item.status));
  const refundTotal = data.refunds.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const itemCount = data.order.items.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  const phoneHref = data.customer.phone ? `tel:${data.customer.phone}` : undefined;

  return <div className="space-y-5">
    <section className="overflow-hidden rounded-3xl bg-gradient-to-l from-[#004b32] via-[#006844] to-[#07835b] p-6 text-white shadow-lg">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start"><div><div className="flex flex-wrap items-center gap-2"><Badge className="bg-white/15 text-white hover:bg-white/20">حالة خدمة عملاء</Badge><StatusBadge value={data.order.status} /><StatusBadge value={data.order.payment_status} /></div><h2 className="mt-4 text-2xl font-black">{data.customer.name || "عميل غير مسجل"}</h2><p className="mt-1 text-sm text-emerald-100">طلب #{data.order.tracking_number || shortId(data.order.id)} · {dateTime(data.order.created_at)}</p></div><div className="text-right lg:text-left"><p className="text-sm text-emerald-100">إجمالي الطلب</p><p className="text-3xl font-black">{money(data.order.total)}</p></div></div>
      <div className="mt-6 flex flex-wrap gap-2"><Button className="bg-white text-emerald-900 hover:bg-emerald-50" onClick={() => navigate(`/online-orders/${data.order.id}`)}>فتح الطلب <ExternalLink className="h-4 w-4" /></Button>{data.customer.id && <Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => navigate(`/customers/${data.customer.id}`)}>ملف العميل <UserRound className="h-4 w-4" /></Button>}{phoneHref && <Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20"><a href={phoneHref}>اتصال <Phone className="h-4 w-4" /></a></Button>}{data.customer.phone && <Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20"><a href={`https://wa.me/${data.customer.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">واتساب <MessageCircle className="h-4 w-4" /></a></Button>}</div>
    </section>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      [ShoppingBag, "أصناف الطلب", `${itemCount.toLocaleString("ar-EG")} قطعة`],
      [AlertCircle, "مشكلات مفتوحة", openIssues.length.toLocaleString("ar-EG")],
      [Wrench, "مهام جارية", openTasks.length.toLocaleString("ar-EG")],
      [RotateCcw, "إجمالي الاسترداد", money(refundTotal)],
    ].map(([Icon, label, value]) => { const C = Icon as typeof ShoppingBag; return <Card key={String(label)} className="border-slate-200"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-slate-100 p-2.5 text-emerald-700"><C className="h-5 w-5" /></div><div><p className="text-xs text-slate-500">{String(label)}</p><p className="mt-1 font-black">{String(value)}</p></div></CardContent></Card>; })}</div>

    <div className="grid gap-5 xl:grid-cols-2">
      <InfoCard icon={<UserRound className="h-5 w-5 text-emerald-700" />} title="العميل والتواصل">
        <LabelValue label="الاسم" value={data.customer.name} /><LabelValue label="الهاتف" value={<span dir="ltr">{data.customer.phone || "—"}</span>} /><LabelValue label="البريد" value={data.customer.email} /><LabelValue label="العنوان" value={data.customer.address} /><LabelValue label="توثيق الهاتف" value={data.customer.phone_verified ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" />موثق</span> : "غير موثق"} />
        {data.customer.email && <Button asChild variant="outline" size="sm" className="mt-3"><a href={`mailto:${data.customer.email}`}><Mail className="h-4 w-4" />إرسال بريد</a></Button>}
      </InfoCard>
      <InfoCard icon={<WalletCards className="h-5 w-5 text-emerald-700" />} title="الطلب والدفع">
        <LabelValue label="حالة الطلب" value={<StatusBadge value={data.order.status} />} /><LabelValue label="الدفع" value={<span className="flex items-center gap-2"><StatusBadge value={data.order.payment_status} />{data.order.payment_method || "—"}</span>} /><LabelValue label="الشحن" value={money(data.order.shipping_cost)} /><LabelValue label="الإجمالي" value={money(data.order.total)} /><LabelValue label="المرتجع" value={data.order.return_status} />
      </InfoCard>
      <InfoCard icon={<Store className="h-5 w-5 text-emerald-700" />} title="المتجر والفرع">
        <LabelValue label="الفرع" value={data.store.branch_name} /><LabelValue label="الشريك" value={data.store.merchant_name} /><LabelValue label="هاتف الفرع" value={<span dir="ltr">{data.store.branch_phone || "—"}</span>} /><LabelValue label="هاتف الشريك" value={<span dir="ltr">{data.store.merchant_phone || "—"}</span>} />
      </InfoCard>
      <InfoCard icon={<Truck className="h-5 w-5 text-emerald-700" />} title="المندوب والتوصيل">
        <LabelValue label="المندوب" value={data.delivery.driver?.name || "لم يُعيّن"} /><LabelValue label="الهاتف" value={<span dir="ltr">{data.delivery.driver?.phone || "—"}</span>} /><LabelValue label="حالة المهمة" value={data.delivery.assignment ? <StatusBadge value={data.delivery.assignment.state} /> : "لا توجد مهمة"} /><LabelValue label="حالة المسار" value={data.delivery.route ? <StatusBadge value={data.delivery.route.status} /> : "لا يوجد مسار"} /><LabelValue label="المسافة والوقت" value={data.delivery.route ? `${data.delivery.route.distance_km || 0} كم · ${data.delivery.route.estimated_minutes || 0} د` : "—"} /><LabelValue label="ETA" value={dateTime(data.delivery.stop?.eta)} />
      </InfoCard>
    </div>

    {(data.issues.length > 0 || data.tasks.length > 0 || data.returns.length > 0 || data.refunds.length > 0 || data.substitutions.length > 0) && <div className="grid gap-5 xl:grid-cols-2">
      <InfoCard icon={<AlertCircle className="h-5 w-5 text-amber-600" />} title="المشكلات والمهام">
        <div className="space-y-3">{[...data.issues.map(i => ({ id:i.id, title:i.issue_type, detail:i.note, status:i.status, at:i.reported_at })), ...data.tasks.map(t => ({ id:t.id, title:t.title, detail:t.description, status:t.status, at:t.created_at }))].map(item => <div key={item.id} className="rounded-xl border bg-slate-50 p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-black">{item.title}</p><StatusBadge value={item.status} /></div>{item.detail && <p className="mt-1 text-xs text-slate-600">{item.detail}</p>}<p className="mt-2 text-[11px] text-slate-400">{dateTime(item.at)}</p></div>)}</div>
      </InfoCard>
      <InfoCard icon={<RotateCcw className="h-5 w-5 text-violet-700" />} title="المرتجعات والاستردادات والاستبدال" action={<Button size="sm" variant="outline" onClick={() => navigate("/returns")}>مركز المرتجعات <ArrowLeft className="h-4 w-4" /></Button>}>
        <div className="space-y-3">{data.refunds.map(item => <div key={item.id} className="rounded-xl border bg-slate-50 p-3"><div className="flex justify-between"><p className="font-black">استرداد {money(item.amount)}</p><StatusBadge value={item.status} /></div><p className="mt-1 text-xs text-slate-500">{item.payment_method} · {item.provider_reference || "بدون مرجع"}</p></div>)}{data.returns.map(item => <div key={item.id} className="rounded-xl border bg-slate-50 p-3"><div className="flex justify-between"><p className="font-black">طلب مرتجع</p><StatusBadge value={item.status} /></div><p className="mt-1 text-xs text-slate-500">{item.reason || "بدون سبب مسجل"}</p></div>)}{data.substitutions.map(item => <div key={item.id} className="rounded-xl border bg-slate-50 p-3"><div className="flex justify-between"><p className="font-black">استبدال صنف</p><StatusBadge value={item.status} /></div><p className="mt-1 text-xs text-slate-500">{item.original_product_name} ← {item.replacement_product_name}</p></div>)}</div>
      </InfoCard>
    </div>}

    {data.delivery.proof && <InfoCard icon={<ShieldCheck className="h-5 w-5 text-emerald-700" />} title="إثبات التسليم"><div className="grid gap-x-8 sm:grid-cols-2"><LabelValue label="وقت التسليم" value={dateTime(data.delivery.proof.delivered_at)} /><LabelValue label="التحقق" value={data.delivery.proof.pin_verified ? "PIN مؤكد" : data.delivery.proof.verification_method} /><LabelValue label="الموقع" value={data.delivery.proof.location_status} /><LabelValue label="المبلغ المحصل" value={money(data.delivery.proof.collected_amount)} /></div></InfoCard>}

    <InfoCard icon={<Clock3 className="h-5 w-5 text-emerald-700" />} title="الخط الزمني الكامل">
      <div className="relative space-y-0 before:absolute before:bottom-4 before:right-[15px] before:top-4 before:w-px before:bg-slate-200">{data.timeline.map((event, index) => <div key={`${event.event_type}-${event.occurred_at}-${index}`} className="relative flex gap-4 pb-6 last:pb-0"><div className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">{timelineIcon(event)}</div><div className="min-w-0 flex-1 rounded-xl bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black">{event.title}</p>{event.status && <StatusBadge value={event.status} />}</div>{event.detail && <p className="mt-1 text-sm text-slate-600">{event.detail}</p>}<time className="mt-2 block text-[11px] text-slate-400">{dateTime(event.occurred_at)}</time></div></div>)}</div>
    </InfoCard>
  </div>;
}

export default function CustomerServiceWorkspace() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get("q") || "");
  const submitted = params.get("q") || "";
  const selectedOrderId = params.get("order") || "";

  const searchQuery = useQuery({
    queryKey: ["customer-service-search-v1", submitted, currentBranchId],
    queryFn: () => searchCustomerServiceCases(submitted, currentBranchId || null),
    enabled: submitted.trim().length >= 2,
  });
  const caseQuery = useQuery({
    queryKey: ["customer-service-case-v1", selectedOrderId],
    queryFn: () => fetchCustomerServiceCase(selectedOrderId),
    enabled: Boolean(selectedOrderId),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = input.trim();
    if (value.length < 2) return;
    setParams({ q: value });
  };
  const selectOrder = (orderId: string) => setParams({ q: submitted, order: orderId });

  return <MainLayout><main dir="rtl" className="min-h-screen bg-slate-50/70 p-4 md:p-6">
    <div className="mx-auto max-w-[1600px] space-y-5">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><div className="flex items-center gap-2 text-emerald-700"><Headphones className="h-5 w-5" /><span className="text-sm font-black">M20 · مركز موحد</span></div><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">مساحة خدمة العملاء</h1><p className="mt-2 text-sm text-slate-500">ابحث بالموبايل أو رقم الطلب، وتعامل مع الحالة كاملة من مكان واحد.</p></div><Badge variant="outline" className="w-fit border-slate-300 bg-white px-3 py-2"><MapPinned className="ml-2 h-4 w-4" />{currentBranchName || "كل الفروع المسموح بها"}</Badge></header>

      <Card className="border-0 shadow-md"><CardContent className="p-4 md:p-5"><form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><Input value={input} onChange={event => setInput(event.target.value)} className="h-12 pr-12 text-base" placeholder="رقم موبايل، رقم تتبع، معرّف طلب، أو اسم العميل" /></div><Button type="submit" className="h-12 bg-[#006844] px-8 hover:bg-[#005638]" disabled={input.trim().length < 2 || searchQuery.isFetching}>{searchQuery.isFetching ? <RefreshCw className="h-5 w-5 animate-spin" /> : <PackageSearch className="h-5 w-5" />}بحث</Button></form></CardContent></Card>

      <div className="grid items-start gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-3 xl:sticky xl:top-4"><div className="flex items-center justify-between"><h2 className="font-black">نتائج البحث</h2>{submitted && <span className="text-xs text-slate-500">{searchQuery.data?.count || 0} طلب</span>}</div>
          {!submitted && <div className="rounded-2xl border border-dashed bg-white p-7 text-center text-sm leading-7 text-slate-500"><Search className="mx-auto mb-3 h-7 w-7 text-slate-400" />ابدأ برقم الهاتف أو الطلب.</div>}
          {searchQuery.isLoading && [1,2,3].map(item => <Skeleton key={item} className="h-36 rounded-2xl" />)}
          {searchQuery.isError && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{(searchQuery.error as Error).message}</div>}
          {submitted && !searchQuery.isLoading && !searchQuery.isError && searchQuery.data?.results.length === 0 && <div className="rounded-2xl border border-dashed bg-white p-7 text-center text-sm text-slate-500">لا توجد طلبات مطابقة داخل نطاق صلاحياتك.</div>}
          {searchQuery.data?.results.map(result => <ResultCard key={result.order_id} result={result} active={selectedOrderId === result.order_id} onClick={() => selectOrder(result.order_id)} />)}
        </aside>
        <section>{!selectedOrderId && <EmptyDetail />}{caseQuery.isLoading && <div className="space-y-4"><Skeleton className="h-52 rounded-3xl" /><div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div></div>}{caseQuery.isError && <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center"><AlertCircle className="mx-auto h-9 w-9 text-red-600" /><p className="mt-3 font-black text-red-800">تعذر فتح الحالة</p><p className="mt-2 text-sm text-red-700">{(caseQuery.error as Error).message}</p><Button variant="outline" className="mt-4" onClick={() => void caseQuery.refetch()}><RefreshCw className="h-4 w-4" />إعادة المحاولة</Button></div>}{caseQuery.data && <CaseDetails data={caseQuery.data} />}</section>
      </div>
    </div>
  </main></MainLayout>;
}
