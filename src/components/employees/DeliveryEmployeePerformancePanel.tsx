import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bike, CheckCircle2, Clock3, PackageCheck, RefreshCw, Route, Truck, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getHrDeliveryPerformance } from "@/services/hrDeliveryPerformanceService";

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

const number = (value: number) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
const money = (value: number) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const duration = (value: number | null) => value == null ? "—" : `${number(value)} د`;

export default function DeliveryEmployeePerformancePanel({ employeeId, branchId }: { employeeId: string; branchId: string | null }) {
  const [days, setDays] = useState(30);
  const range = rangeFor(days);
  const query = useQuery({
    queryKey: ["hr-delivery-performance-v1", employeeId, branchId, days],
    enabled: Boolean(employeeId && branchId),
    queryFn: () => getHrDeliveryPerformance({ employeeId, branchId: branchId as string, ...range }),
  });

  if (!branchId || query.isLoading || query.isError || !query.data?.applicable) return null;
  const p = query.data;

  const cards = [
    { label: "طلبات أُسندت خلال الفترة", value: number(p.assignments.assigned_in_period), icon: Bike },
    { label: "طلبات حالية في عهدته", value: number(p.assignments.active_open_orders), icon: Truck },
    { label: "تم توصيلها", value: number(p.delivery.delivered_orders), icon: CheckCircle2 },
    { label: "قيمة الطلبات الموصلة", value: money(p.delivery.delivered_value), icon: PackageCheck },
    { label: "متوسط استلام الطلب", value: duration(p.delivery.avg_pickup_minutes), icon: Clock3 },
    { label: "متوسط زمن التوصيل", value: duration(p.delivery.avg_delivery_minutes), icon: Route },
    { label: "إلغاءات أثناء العهدة", value: number(p.delivery.cancelled_orders), icon: XCircle },
    { label: "طلبات موصلة بها مرتجع", value: number(p.delivery.delivered_orders_with_returns), icon: RefreshCw },
  ];

  return (
    <Card className="border-[#005931]/15">
      <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Bike className="h-5 w-5 text-[#005931]" />أداء التوصيل</CardTitle>
          <CardDescription>مؤشرات مبنية على عهدة الطلب الفعلية للسائق وسجل حالات الطلب، وليس اسم مندوب مكتوب كنص.</CardDescription>
        </div>
        <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="7">آخر 7 أيام</SelectItem><SelectItem value="30">آخر 30 يوم</SelectItem><SelectItem value="90">آخر 90 يوم</SelectItem></SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="rounded-2xl border bg-slate-50/60 p-4">
              <card.icon className="h-5 w-5 text-[#005931]" />
              <div className="mt-3 text-xl font-black">{card.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{card.label}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border p-4">
            <div className="font-black">العهدة والتعيين</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">سجلات عهدة داخل الفترة</span><span className="font-semibold">{number(p.assignments.records)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">تم إسنادها خلال الفترة</span><span className="font-semibold">{number(p.assignments.assigned_in_period)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">أعيد إسنادها بعيدًا عنه</span><span className="font-semibold">{number(p.assignments.reassigned_away_in_period)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">طلبات مفتوحة حاليًا</span><span className="font-semibold">{number(p.assignments.active_open_orders)}</span></div>
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="font-black">رحلة التوصيل</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">خرجت للتوصيل</span><span className="font-semibold">{number(p.delivery.shipped_orders)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">تم توصيلها</span><span className="font-semibold">{number(p.delivery.delivered_orders)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">عينات زمن الاستلام</span><span className="font-semibold">{number(p.delivery.pickup_duration_samples)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">عينات زمن التوصيل</span><span className="font-semibold">{number(p.delivery.delivery_duration_samples)}</span></div>
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="font-black">سياق تشغيلي</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">إلغاءات أثناء العهدة</span><span className="font-semibold">{number(p.delivery.cancelled_orders)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">طلبات موصلة بها مرتجع</span><span className="font-semibold">{number(p.delivery.delivered_orders_with_returns)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">قيمة الطلبات الموصلة</span><span className="font-semibold">{money(p.delivery.delivered_value)}</span></div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm leading-6 text-blue-950">
          <div className="font-black">تفسير مؤشرات التوصيل</div>
          <p className="mt-1">لا نعرض On-time Delivery حاليًا لأن الطلب لا يحتوي على موعد تسليم متوقع موثوق. عند إضافة ETA حقيقي سنقيس الالتزام به بدل استخدام هدف افتراضي.</p>
          <p className="mt-1">الإلغاء أو المرتجع يظهر كسياق للمراجعة فقط؛ لا يُنسب تلقائيًا كخطأ للسائق لأن السبب قد يكون العميل أو المخزون أو الطلب نفسه.</p>
        </div>
      </CardContent>
    </Card>
  );
}
