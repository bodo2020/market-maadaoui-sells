import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, Calculator, ReceiptText, ShoppingBasket, Undo2, WalletCards } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getHrCashierPerformance } from "@/services/hrCashierPerformanceService";

function localDate(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function rangeFor(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (days - 1));
  return { from: localDate(from), to: localDate(to) };
}
const money = (value: number) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const number = (value: number) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
const pct = (value: number | null) => value == null ? "—" : `${Number(value).toLocaleString("ar-EG", { maximumFractionDigits: 2 })}%`;

export default function CashierPerformancePanel({ employeeId, branchId }: { employeeId: string; branchId: string | null }) {
  const [days, setDays] = useState(30);
  const range = rangeFor(days);
  const query = useQuery({
    queryKey: ["hr-cashier-performance-v1", employeeId, branchId, days],
    enabled: Boolean(employeeId && branchId),
    queryFn: () => getHrCashierPerformance({ employeeId, branchId: branchId as string, ...range }),
  });

  if (!branchId || query.isLoading || query.isError || !query.data?.applicable) return null;
  const p = query.data;
  const cards = [
    { label: "عدد الفواتير", value: number(p.sales.invoice_count), icon: ReceiptText },
    { label: "إجمالي المبيعات", value: money(p.sales.sales_total), icon: Banknote },
    { label: "متوسط الفاتورة", value: money(p.sales.average_ticket), icon: Calculator },
    { label: "الوحدات المباعة", value: number(p.sales.items_sold), icon: ShoppingBasket },
    { label: "مرتجعات معتمدة", value: money(p.returns.approved_amount), icon: Undo2 },
    { label: "نسبة قيمة المرتجع", value: pct(p.returns.return_amount_pct), icon: Undo2 },
    { label: "فرق النقدية المطلق", value: money(p.shifts.absolute_cash_variance), icon: WalletCards },
    { label: "فرق التسويات المطلق", value: money(p.shifts.absolute_payment_variance), icon: AlertTriangle },
  ];

  return (
    <Card className="border-[#005931]/15">
      <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
        <div><CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-[#005931]" />أداء الكاشير</CardTitle><CardDescription>مؤشرات من Invoice V2 والورديات والتسويات الفعلية، وليست من سجل المبيعات القديم.</CardDescription></div>
        <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">آخر 7 أيام</SelectItem><SelectItem value="30">آخر 30 يوم</SelectItem><SelectItem value="90">آخر 90 يوم</SelectItem></SelectContent></Select>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <div key={card.label} className="rounded-2xl border bg-slate-50/60 p-4"><card.icon className="h-5 w-5 text-[#005931]" /><div className="mt-3 text-xl font-black">{card.value}</div><div className="mt-1 text-xs text-muted-foreground">{card.label}</div></div>)}</div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border p-4"><div className="font-black">المبيعات</div><div className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">متوسط وحدات/فاتورة</span><span className="font-semibold">{p.sales.items_per_invoice == null ? "—" : number(p.sales.items_per_invoice)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">خصومات المنتجات</span><span className="font-semibold">{money(p.sales.discounts)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">كوبونات الولاء</span><span className="font-semibold">{money(p.sales.loyalty_voucher_amount)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">رسوم دفع على التاجر</span><span className="font-semibold">{money(p.sales.merchant_payment_fees)}</span></div></div></div>
          <div className="rounded-2xl border p-4"><div className="font-black">المرتجعات المرتبطة بمبيعاته</div><div className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">عدد المرتجعات المعتمدة</span><span className="font-semibold">{number(p.returns.approved_count)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">قيمة المرتجعات</span><span className="font-semibold">{money(p.returns.approved_amount)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">من إجمالي المبيعات</span><span className="font-semibold">{pct(p.returns.return_amount_pct)}</span></div></div></div>
          <div className="rounded-2xl border p-4"><div className="font-black">الورديات والتسويات</div><div className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">الورديات</span><span className="font-semibold">{number(p.shifts.count)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">ورديات مغلقة</span><span className="font-semibold">{number(p.shifts.closed_count)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">بنود تسوية بها فرق</span><span className="font-semibold">{number(p.shifts.variance_lines)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">فرق رصيد افتتاحي مطلق</span><span className="font-semibold">{money(p.shifts.absolute_opening_variance)}</span></div></div></div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-xs leading-5 text-blue-950">المرتجع هنا من الفواتير الأصلية التي باعها الكاشير، وليس عدد عمليات المرتجع التي نفذها. وفروق النقدية/التسويات تعرض كإشارة مراجعة فقط؛ لا تتحول تلقائيًا إلى تقييم سلبي بدون معرفة السبب والموافقة المسجلة.</div>
      </CardContent>
    </Card>
  );
}
