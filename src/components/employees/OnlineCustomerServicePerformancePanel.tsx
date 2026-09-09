import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock3, Headphones, PackageCheck, RefreshCw, ShieldCheck, Timer, Workflow } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getHrOnlineCustomerServicePerformance } from "@/services/hrOnlineCustomerServicePerformanceService";

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
const pct = (value: number | null) => value == null ? "—" : `${Number(value).toLocaleString("ar-EG", { maximumFractionDigits: 1 })}%`;
const duration = (value: number | null) => value == null ? "—" : `${number(value)} د`;

const outcomeLabels: Record<string, string> = {
  reached: "تم التواصل",
  converted: "تحويل ناجح",
  no_answer: "لا يوجد رد",
  callback: "إعادة اتصال",
  not_interested: "غير مهتم",
  unspecified: "بدون نتيجة محددة",
};

export default function OnlineCustomerServicePerformancePanel({ employeeId, branchId }: { employeeId: string; branchId: string | null }) {
  const [days, setDays] = useState(30);
  const range = rangeFor(days);
  const query = useQuery({
    queryKey: ["hr-online-customer-service-performance-v1", employeeId, branchId, days],
    enabled: Boolean(employeeId && branchId),
    queryFn: () => getHrOnlineCustomerServicePerformance({ employeeId, branchId: branchId as string, ...range }),
  });

  if (!branchId || query.isLoading || query.isError || !query.data?.applicable) return null;
  const p = query.data;
  const outcomes = Object.entries(p.customer_service.outcomes || {});

  const cards = [
    { label: "طلبات تعامل معها", value: number(p.orders.handled_orders), icon: PackageCheck },
    { label: "تغييرات حالة نفذها", value: number(p.orders.status_transitions), icon: Workflow },
    { label: "متوسط أول استجابة", value: duration(p.orders.avg_first_response_minutes), icon: Clock3 },
    { label: "متوسط تجهيز الطلب", value: duration(p.orders.avg_preparation_minutes), icon: Timer },
    { label: "SLA الطلبات", value: p.orders.sla.enabled ? pct(p.orders.sla.overall_rate) : "غير مفعّل", icon: ShieldCheck },
    { label: "إلغاءات نفذها", value: number(p.orders.cancelled), icon: AlertTriangle },
    { label: "متابعات مسندة", value: number(p.customer_service.assigned), icon: Headphones },
    { label: "إغلاق المتابعات المسندة", value: pct(p.customer_service.completion_rate), icon: CheckCircle2 },
    { label: "متابعات متأخرة مفتوحة", value: number(p.customer_service.overdue_open), icon: RefreshCw },
  ];

  return (
    <Card className="border-[#005931]/15">
      <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Headphones className="h-5 w-5 text-[#005931]" />الطلبات الإلكترونية وخدمة العملاء</CardTitle>
          <CardDescription>مؤشرات من سجل حالات الطلب والمتابعات المسندة فعليًا. السجلات القديمة بدون هوية موظف لا تدخل في التقييم.</CardDescription>
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
            <div className="font-black">رحلة الطلب</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">تأكيد</span><span className="font-semibold">{number(p.orders.confirmed)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">بدأ التجهيز</span><span className="font-semibold">{number(p.orders.preparing)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">جاهز</span><span className="font-semibold">{number(p.orders.ready)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">خرج للتوصيل</span><span className="font-semibold">{number(p.orders.shipped)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">تم التوصيل</span><span className="font-semibold">{number(p.orders.delivered)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">إلغاء</span><span className="font-semibold">{number(p.orders.cancelled)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">طلبات تعامل معها وبها مرتجع</span><span className="font-semibold">{number(p.orders.handled_orders_with_returns)}</span></div>
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="font-black">الاستجابة والتجهيز</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">عينات أول استجابة</span><span className="font-semibold">{number(p.orders.first_response_samples)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">متوسط أول استجابة</span><span className="font-semibold">{duration(p.orders.avg_first_response_minutes)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">عينات التجهيز</span><span className="font-semibold">{number(p.orders.preparation_samples)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">متوسط preparing → ready</span><span className="font-semibold">{duration(p.orders.avg_preparation_minutes)}</span></div>
              <div className="mt-3 border-t pt-3 font-bold">SLA</div>
              {p.orders.sla.enabled ? <>
                <div className="flex justify-between"><span className="text-muted-foreground">هدف أول استجابة</span><span className="font-semibold">{number(p.orders.sla.first_response_target_minutes)} د</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">الالتزام بأول استجابة</span><span className="font-semibold">{pct(p.orders.sla.first_response_rate)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">هدف التجهيز</span><span className="font-semibold">{number(p.orders.sla.preparation_target_minutes)} د</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">الالتزام بالتجهيز</span><span className="font-semibold">{pct(p.orders.sla.preparation_rate)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">SLA إجمالي</span><span className="font-black text-[#005931]">{pct(p.orders.sla.overall_rate)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">عينات مقيمة</span><span className="font-semibold">{number(p.orders.sla.evaluated_samples)}</span></div>
              </> : <div className="rounded-lg bg-slate-50 p-2 text-xs text-muted-foreground">غير مفعّل لهذا الفرع. يمكن للمدير تحديد الأهداف وتفعيله من «تشغيل الفريق حسب التخصص».</div>}
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="font-black">متابعات خدمة العملاء</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">أنشأ متابعات</span><span className="font-semibold">{number(p.customer_service.created_by_employee)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">مسند له</span><span className="font-semibold">{number(p.customer_service.assigned)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">مغلق من المسند له</span><span className="font-semibold">{number(p.customer_service.assigned_closed_by_employee)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">أغلقه موظف آخر</span><span className="font-semibold">{number(p.customer_service.assigned_closed_by_other)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">أغلق متابعات إجمالًا</span><span className="font-semibold">{number(p.customer_service.completed_by_employee)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">مواعيد متابعة داخل الفترة</span><span className="font-semibold">{number(p.customer_service.scheduled_due)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">مغلقة بعد الموعد</span><span className="font-semibold">{number(p.customer_service.completed_late_assigned)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">متوسط عمر المتابعة المغلقة</span><span className="font-semibold">{duration(p.customer_service.avg_assigned_lifecycle_minutes)}</span></div>
            </div>
            {outcomes.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {outcomes.map(([key, value]) => <Badge key={key} variant="secondary">{outcomeLabels[key] || key}: {number(value)}</Badge>)}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm leading-6 text-blue-950">
          <div className="font-black">قراءة المؤشرات بشكل صحيح</div>
          <p className="mt-1">أول استجابة تُنسب فقط لأول موظف معروف تعامل مع الطلب. السجلات القديمة بدون changed_by لا تدخل في تقييم أي شخص.</p>
          <p className="mt-1">زمن التجهيز من preparing إلى ready هو مؤشر للعملية التي أغلقها الموظف، وليس دليلًا أن كل زمن التجهيز كان عمله منفردًا.</p>
          <p className="mt-1">الإلغاء والمرتجع سياق للمراجعة فقط، ولا يعتبران خطأ على الموظف تلقائيًا.</p>
          <p className="mt-1">SLA لا يحسب إلا عند تفعيل سياسة الفرع وعلى العينات التي لها timestamps موثوقة؛ تغيير الهدف يعيد تقييم التاريخ حسب السياسة الحالية ولا يغير بيانات الطلب.</p>
        </div>
      </CardContent>
    </Card>
  );
}
