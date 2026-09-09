import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCheck, Clock3, PackageCheck, RefreshCcw, Scale, ScanSearch, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getHrInventoryPerformance } from "@/services/hrInventoryPerformanceService";

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
const money = (value: number) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const duration = (value: number | null) => value == null ? "—" : `${number(value)} د`;

export default function InventoryEmployeePerformancePanel({ employeeId, branchId }: { employeeId: string; branchId: string | null }) {
  const [days, setDays] = useState(30);
  const range = rangeFor(days);
  const query = useQuery({
    queryKey: ["hr-inventory-performance-v1", employeeId, branchId, days],
    enabled: Boolean(employeeId && branchId),
    queryFn: () => getHrInventoryPerformance({ employeeId, branchId: branchId as string, ...range }),
  });

  if (!branchId || query.isLoading || query.isError || !query.data?.applicable) return null;
  const p = query.data;

  const cards = [
    { label: "العد المنفذ", value: `${number(p.counts.submitted)} / ${number(p.counts.assigned)}`, icon: ScanSearch },
    { label: "نسبة إنجاز الجرد", value: pct(p.counts.completion_rate), icon: PackageCheck },
    { label: "فروق تم اكتشافها", value: number(p.counts.discrepancy), icon: Scale },
    { label: "القيمة المطلقة للفروق", value: money(p.counts.abs_variance_value), icon: Scale },
    { label: "متوسط زمن العد النشط", value: duration(p.counts.avg_active_minutes), icon: Clock3 },
    { label: "مهام جرد متأخرة", value: number(p.counts.overdue_open + p.recounts.overdue_open), icon: AlertTriangle },
    { label: "إعادة عد منفذة", value: `${number(p.recounts.submitted)} / ${number(p.recounts.assigned)}`, icon: RefreshCcw },
    { label: "تأكيد Peer Recount", value: pct(p.peer_review.confirmation_rate), icon: ShieldCheck },
  ];

  return (
    <Card className="border-[#005931]/15">
      <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-[#005931]" />أداء الجرد والمخزون</CardTitle>
          <CardDescription>مؤشرات من سجلات العد الأعمى وPeer Recount الفعلية. يظهر القسم لأي موظف شارك في الجرد خلال الفترة، بغض النظر عن المسمى الوظيفي.</CardDescription>
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
            <div className="font-black">العد الأول</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">مهام مسندة</span><span className="font-semibold">{number(p.counts.assigned)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">تم إرسال العد</span><span className="font-semibold">{number(p.counts.submitted)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">مطابق للرصيد المتوقع</span><span className="font-semibold">{number(p.counts.matched)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">كشف فرق</span><span className="font-semibold">{number(p.counts.discrepancy)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">أنجز داخل الموعد</span><span className="font-semibold">{number(p.counts.completed_on_time)}</span></div>
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="font-black">إعادة العد المستقلة</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Recount مسند</span><span className="font-semibold">{number(p.recounts.assigned)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Recount منفذ</span><span className="font-semibold">{number(p.recounts.submitted)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">مطابق للنظام</span><span className="font-semibold">{number(p.recounts.matched_system)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">أكد وجود الفرق</span><span className="font-semibold">{number(p.recounts.confirmed_variance)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">تعارض مع العد الأول</span><span className="font-semibold">{number(p.recounts.conflicting)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">متوسط زمن التنفيذ النشط</span><span className="font-semibold">{duration(p.recounts.avg_active_minutes)}</span></div>
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="font-black">مراجعة الزميل للعد الأول</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">فروق تمت إعادة عدها</span><span className="font-semibold">{number(p.peer_review.reviewed)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">أكدت نفس الكمية</span><span className="font-semibold">{number(p.peer_review.confirmed)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">اختلفت عن العد الأول</span><span className="font-semibold">{number(p.peer_review.disagreed)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">نسبة التأكيد</span><span className="font-semibold">{pct(p.peer_review.confirmation_rate)}</span></div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm leading-6 text-blue-950">
          <div className="flex items-center gap-2 font-black"><CheckCheck className="h-4 w-4" />قراءة المؤشرات بشكل صحيح</div>
          <p className="mt-1">عدد الفروق وقيمتها ليست عقوبة على الموظف؛ الموظف الجيد قد يكتشف فرقًا حقيقيًا كان مخفيًا. المؤشر الأقوى عند وجود فرق هو نتيجة Peer Recount وسجل الموافقة على تعديل المخزون.</p>
          <p className="mt-1">متوسط الزمن لا يظهر إلا للمهام التي بدأت فعليًا بزر البدء، لذلك وقت الانتظار قبل بدء المهمة لا يدخل في تقييم سرعة التنفيذ.</p>
          <p className="mt-1">القيمة المطلقة للفروق تعرض حجم المخزون الذي احتاج مراجعة خلال الفترة ولا تعني أن الموظف تسبب في هذه القيمة.</p>
        </div>
      </CardContent>
    </Card>
  );
}
