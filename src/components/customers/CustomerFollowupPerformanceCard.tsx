import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CircleDollarSign, RefreshCw, ShoppingBag, Target, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBranchStore } from "@/stores/branchStore";
import { fetchCustomerFollowupPerformance } from "@/services/supabase/customerOperationsService";

const money = (value: number | null | undefined) => `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
const num = (value: number | null | undefined) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 1 });
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—";

const typeLabel: Record<string, string> = {
  call: "مكالمة",
  whatsapp: "WhatsApp",
  email: "بريد إلكتروني",
  meeting: "مقابلة",
};

export default function CustomerFollowupPerformanceCard({ customerId }: { customerId: string }) {
  const { currentBranchId } = useBranchStore();
  const query = useQuery({
    queryKey: ["customer-followup-performance", customerId, currentBranchId],
    queryFn: () => fetchCustomerFollowupPerformance(customerId, currentBranchId || null, 180),
  });

  if (query.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (query.isError || !query.data) return null;

  const data = query.data;
  const summary = data.summary;

  return (
    <section className="space-y-3 rounded-2xl border bg-slate-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-black"><Target className="h-4 w-4 text-[#005931]" />أثر المتابعة على الشراء</div>
          <div className="mt-1 text-[11px] text-muted-foreground">الشراء خلال {data.attribution_window_days} أيام بعد المتابعة يُنسب لأقرب متابعة فقط.</div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="تحديث"><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /></Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card><CardContent className="p-3"><TrendingUp className="h-4 w-4 text-[#005931]" /><div className="mt-2 text-xl font-black">{num(summary.conversion_rate)}%</div><div className="text-[10px] text-muted-foreground">نسبة التحويل</div></CardContent></Card>
        <Card><CardContent className="p-3"><ShoppingBag className="h-4 w-4 text-emerald-600" /><div className="mt-2 text-xl font-black">{num(summary.attributed_orders)}</div><div className="text-[10px] text-muted-foreground">طلبات بعد المتابعة</div></CardContent></Card>
        <Card><CardContent className="p-3"><CircleDollarSign className="h-4 w-4 text-[#005931]" /><div className="mt-2 truncate text-base font-black">{money(summary.attributed_revenue)}</div><div className="text-[10px] text-muted-foreground">مبيعات منسوبة</div></CardContent></Card>
      </div>

      {data.followups.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-5 text-center text-xs text-muted-foreground">لسه مفيش متابعات مكتملة يمكن قياس نتيجتها.</div>
      ) : (
        <div className="space-y-2">
          {data.followups.slice(0, 8).map(item => (
            <div key={item.interaction_id} className="rounded-xl border bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="truncate text-sm font-bold">{item.subject}</div><div className="mt-1 text-[11px] text-muted-foreground">{typeLabel[item.type] || item.type} · اكتملت {date(item.completed_at)}{item.staff_name ? ` · ${item.staff_name}` : ""}</div></div>
                {item.converted ? <Badge className="shrink-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><BadgeCheck className="ml-1 h-3.5 w-3.5" />رجع واشترى</Badge> : <Badge variant="outline" className="shrink-0">بدون شراء منسوب</Badge>}
              </div>
              {item.converted && <div className="mt-2 flex flex-wrap gap-2 text-[11px]"><Badge variant="outline">{num(item.attributed_orders)} طلب</Badge><Badge variant="outline">{money(item.attributed_revenue)}</Badge><Badge variant="outline">أول شراء {date(item.first_purchase_at)}</Badge></div>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
