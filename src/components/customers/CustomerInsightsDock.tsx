import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarClock,
  Clock3,
  PackageSearch,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { useBranchStore } from "@/stores/branchStore";
import { fetchCustomerBusinessIntelligence } from "@/services/supabase/customerBusinessIntelligenceService";

const money = (value: number | null | undefined) => `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
const num = (value: number | null | undefined) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 1 });
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value)) : "—";

const cadenceLabel: Record<string, string> = {
  weekly: "أسبوعي تقريبًا",
  biweekly: "كل أسبوعين تقريبًا",
  monthly: "شهري تقريبًا",
  occasional: "شراء متباعد",
  unknown: "بيانات غير كافية",
};

export default function CustomerInsightsDock() {
  const { customerId } = useParams();
  const { currentBranchId } = useBranchStore();
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ["customer-business-intelligence", customerId, currentBranchId],
    enabled: Boolean(customerId && open),
    queryFn: () => fetchCustomerBusinessIntelligence(customerId!, currentBranchId || null),
  });

  if (!customerId) return null;
  const data = query.data;
  const maxProductSpend = Math.max(1, ...(data?.top_products || []).map(item => Number(item.amount_spent || 0)));
  const maxCategorySpend = Math.max(1, ...(data?.top_categories || []).map(item => Number(item.amount_spent || 0)));

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 left-5 z-[69] h-12 rounded-full border border-white/20 bg-slate-950 px-5 text-white shadow-[0_14px_35px_rgba(15,23,42,.25)] hover:bg-slate-800"
      >
        <Sparkles className="ml-2 h-5 w-5" />
        ذكاء العميل
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="text-right">
            <SheetTitle className="flex items-center gap-2 text-xl">
              <BarChart3 className="h-5 w-5 text-[#005931]" />
              ذكاء العميل
            </SheetTitle>
            <SheetDescription>تحليل نمط الشراء والسلة وأهم المنتجات والأقسام من البيانات الفعلية.</SheetDescription>
          </SheetHeader>

          <div className="mt-5 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث التحليل
            </Button>
          </div>

          {query.isLoading ? (
            <div className="mt-4 space-y-3">
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-44 rounded-2xl" />
              <Skeleton className="h-44 rounded-2xl" />
            </div>
          ) : query.isError || !data ? (
            <Card className="mt-4"><CardContent className="p-8 text-center text-sm text-muted-foreground">{(query.error as Error)?.message || "تعذر تحميل التحليل."}</CardContent></Card>
          ) : (
            <div className="mt-4 space-y-4">
              <section className="grid grid-cols-2 gap-3">
                <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4 text-[#005931]" />نمط الشراء</div><div className="mt-2 font-black">{cadenceLabel[data.purchase_pattern.cadence] || data.purchase_pattern.cadence}</div><div className="mt-1 text-xs text-muted-foreground">{data.purchase_pattern.average_days_between_purchases != null ? `متوسط ${num(data.purchase_pattern.average_days_between_purchases)} يوم بين المشتريات` : "نحتاج عمليتي شراء مكتملتين على الأقل"}</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarClock className="h-4 w-4 text-[#005931]" />الشراء القادم المتوقع</div><div className="mt-2 font-black">{data.purchase_pattern.prediction_ready ? date(data.purchase_pattern.predicted_next_purchase_at) : "لسه بدري للتوقع"}</div><div className="mt-1 text-xs text-muted-foreground">آخر شراء: {date(data.purchase_pattern.last_purchase_at)}</div></CardContent></Card>
              </section>

              <section className={`rounded-2xl border p-4 ${data.cart_signal.is_abandoned ? "border-orange-200 bg-orange-50" : "bg-white"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-[#005931]" /><div><div className="font-black">إشارة السلة</div><div className="text-xs text-muted-foreground">آخر نشاط على سلة التطبيق</div></div></div>
                  <Badge variant="outline" className={data.cart_signal.is_abandoned ? "border-orange-300 bg-white text-orange-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}>{data.cart_signal.is_abandoned ? "سلة متروكة" : data.cart_signal.items_count > 0 ? "سلة نشطة" : "لا توجد سلة"}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm"><div className="rounded-xl bg-white/80 p-3"><div className="text-xs text-muted-foreground">الأصناف</div><strong>{num(data.cart_signal.items_count)}</strong></div><div className="rounded-xl bg-white/80 p-3"><div className="text-xs text-muted-foreground">قيمة تقديرية</div><strong>{money(data.cart_signal.estimated_value)}</strong></div><div className="rounded-xl bg-white/80 p-3"><div className="text-xs text-muted-foreground">من آخر تعديل</div><strong>{data.cart_signal.age_hours == null ? "—" : `${num(data.cart_signal.age_hours)} س`}</strong></div></div>
              </section>

              <section className="rounded-2xl border p-4">
                <div className="mb-4 flex items-center gap-2 font-black"><PackageSearch className="h-5 w-5 text-[#005931]" />أكثر المنتجات شراءً</div>
                {data.top_products.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">لا توجد مشتريات كافية لتحليل المنتجات.</div> : <div className="space-y-3">{data.top_products.map((item, index) => (
                  <div key={`${item.product_id || item.product_name}-${index}`}>
                    <div className="flex items-start justify-between gap-3 text-sm"><div className="min-w-0"><div className="truncate font-bold">{index + 1}. {item.product_name}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{item.category_name || "بدون قسم"} · {num(item.quantity_bought)} وحدة · {num(item.purchase_occurrences)} عملية</div></div><strong className="shrink-0 text-[#005931]">{money(item.amount_spent)}</strong></div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#005931]" style={{ width: `${Math.max(4, Math.min(100, (Number(item.amount_spent || 0) / maxProductSpend) * 100))}%` }} /></div>
                  </div>
                ))}</div>}
              </section>

              <section className="rounded-2xl border p-4">
                <div className="mb-4 flex items-center gap-2 font-black"><TrendingUp className="h-5 w-5 text-[#005931]" />أقوى الأقسام للعميل</div>
                {data.top_categories.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">لا توجد بيانات أقسام كافية.</div> : <div className="space-y-3">{data.top_categories.map((item, index) => (
                  <div key={item.category_id}>
                    <div className="flex items-center justify-between gap-3 text-sm"><div className="font-bold">{index + 1}. {item.category_name || "بدون اسم"}</div><div className="text-left"><strong>{money(item.amount_spent)}</strong><div className="text-[10px] text-muted-foreground">{num(item.quantity_bought)} وحدة</div></div></div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#005931]" style={{ width: `${Math.max(4, Math.min(100, (Number(item.amount_spent || 0) / maxCategorySpend) * 100))}%` }} /></div>
                  </div>
                ))}</div>}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
