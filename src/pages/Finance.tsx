import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import FinanceSettlementCenterV2 from "@/components/finance/FinanceSettlementCenterV2";
import { siteConfig } from "@/config/site";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Banknote,
  Calendar as CalendarIcon,
  CreditCard,
  Gift,
  Receipt,
  RotateCcw,
  Sparkles,
  Tag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { fetchFinancialSummary, type PeriodType } from "@/services/supabase/financeService";
import { fetchLoyaltyFinancialSummary } from "@/services/supabase/loyaltyFinanceService";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ar } from "date-fns/locale";

function formatCurrency(amount: number): string {
  return `${siteConfig.currency} ${Number(amount || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })}`;
}

function formatNumber(amount: number): string {
  return Number(amount || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}

function MetricCard({
  title,
  value,
  note,
  icon: Icon,
  loading,
  tone = "normal",
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ElementType;
  loading?: boolean;
  tone?: "normal" | "good" | "danger" | "loyalty";
}) {
  const toneClass = tone === "danger"
    ? "bg-red-50 text-red-700"
    : tone === "good"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "loyalty"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-50 text-slate-700";

  return (
    <Card className="border-slate-100 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-600">{title}</p>
            {loading ? (
              <div className="mt-3 h-8 w-32 animate-pulse rounded-lg bg-slate-100" />
            ) : (
              <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
            )}
          </div>
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${toneClass}`}>
            <Icon size={21} />
          </span>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">{note}</p>
      </CardContent>
    </Card>
  );
}

export default function Finance() {
  const [period, setPeriod] = useState<PeriodType>("month");
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(new Date()));
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const currentBranchId = localStorage.getItem("currentBranchId") || undefined;

  const financeQuery = useQuery({
    queryKey: ["financialSummary", period, startDate?.toISOString(), endDate?.toISOString(), currentBranchId],
    queryFn: () => fetchFinancialSummary(period, startDate, endDate, currentBranchId),
  });

  const loyaltyFinanceQuery = useQuery({
    queryKey: ["loyaltyFinancialSummary", period, startDate?.toISOString(), endDate?.toISOString(), currentBranchId],
    queryFn: () => fetchLoyaltyFinancialSummary(period, startDate, endDate, currentBranchId),
  });

  const handleDateRangeChange = (value: PeriodType) => {
    setPeriod(value);
    if (value !== "custom") {
      setStartDate(undefined);
      setEndDate(undefined);
    }
  };

  const getDateRangeText = () => {
    if (period === "custom" && startDate && endDate) {
      return `${format(startDate, "dd/MM/yyyy")} - ${format(endDate, "dd/MM/yyyy")}`;
    }
    return {
      day: "اليوم",
      week: "هذا الأسبوع",
      month: "هذا الشهر",
      quarter: "هذا الربع",
      year: "هذا العام",
      custom: "مخصص",
    }[period] || "اختر الفترة";
  };

  const data = loyaltyFinanceQuery.data;
  const loading = loyaltyFinanceQuery.isLoading;
  const expenses = Number(financeQuery.data?.totalExpenses || 0);
  const netLoyaltyDiscount = Number(data?.totals.loyalty_discounts_net || 0);
  const grossLoyaltyDiscount = Number(data?.totals.loyalty_discounts_gross || 0);
  const loyaltyRestored = Number(data?.returns.loyalty_restored || 0);

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-950">الإدارة المالية</h1>
            <p className="mt-1 text-sm text-slate-500">المبيعات والخصومات والتحصيل والولاء في صورة مالية واحدة.</p>
          </div>

          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full gap-2 sm:w-auto">
                <CalendarIcon className="h-4 w-4" />
                <span>{getDateRangeText()}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="border-b p-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={period === "day" ? "default" : "outline"} size="sm" onClick={() => handleDateRangeChange("day")}>اليوم</Button>
                  <Button variant={period === "week" ? "default" : "outline"} size="sm" onClick={() => handleDateRangeChange("week")}>هذا الأسبوع</Button>
                  <Button variant={period === "month" ? "default" : "outline"} size="sm" onClick={() => handleDateRangeChange("month")}>هذا الشهر</Button>
                  <Button variant={period === "quarter" ? "default" : "outline"} size="sm" onClick={() => handleDateRangeChange("quarter")}>هذا الربع</Button>
                  <Button variant={period === "year" ? "default" : "outline"} size="sm" onClick={() => handleDateRangeChange("year")}>هذا العام</Button>
                  <Button variant={period === "custom" ? "default" : "outline"} size="sm" onClick={() => handleDateRangeChange("custom")}>مخصص</Button>
                </div>
              </div>
              {period === "custom" && (
                <Calendar
                  mode="range"
                  selected={{ from: startDate, to: endDate }}
                  onSelect={range => {
                    setStartDate(range?.from);
                    setEndDate(range?.to);
                  }}
                  locale={ar}
                  initialFocus
                  className="pointer-events-auto p-3"
                />
              )}
            </PopoverContent>
          </Popover>
        </div>

        {loyaltyFinanceQuery.isError && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
            تعذر تحميل الملخص المالي الجديد. تأكد من صلاحية عرض المالية ثم أعد المحاولة.
            <Button variant="outline" size="sm" className="mr-3" onClick={() => loyaltyFinanceQuery.refetch()}>إعادة المحاولة</Button>
          </div>
        )}

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm leading-6 text-emerald-900">
          <strong>خصومات الولاء لا تدخل الخزنة.</strong> قيمة كوبون الخصم تظهر كبند خصم مبيعات مستقل، بينما النقدي والبطاقة يعرضان المبلغ الذي تم تحصيله فعليًا فقط.
        </div>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Receipt className="text-primary" size={20} />
            <h2 className="text-lg font-black">المبيعات والخصومات</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="المبيعات بعد خصومات المنتجات"
              value={formatCurrency(data?.totals.gross_sales || 0)}
              note="POS + الطلبات الأونلاين قبل كوبونات الولاء والمرتجعات."
              icon={Receipt}
              loading={loading}
            />
            <MetricCard
              title="خصومات المنتجات (POS)"
              value={formatCurrency(data?.totals.product_discounts || 0)}
              note="العروض وخصومات وحدات البيع، منفصلة عن كوبونات الولاء."
              icon={Tag}
              loading={loading}
              tone="danger"
            />
            <MetricCard
              title="خصومات كوبونات الولاء"
              value={formatCurrency(netLoyaltyDiscount)}
              note={`استخدام ${formatCurrency(grossLoyaltyDiscount)} − مسترد للكوبونات ${formatCurrency(loyaltyRestored)}.`}
              icon={Gift}
              loading={loading}
              tone="loyalty"
            />
            <MetricCard
              title="صافي المبيعات"
              value={formatCurrency(data?.totals.net_sales_after_returns || 0)}
              note="بعد كوبونات الولاء والمرتجعات المعتمدة."
              icon={TrendingUp}
              loading={loading}
              tone="good"
            />
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Wallet className="text-primary" size={20} />
            <h2 className="text-lg font-black">التحصيل الفعلي</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="نقدي POS"
              value={formatCurrency(data?.pos.cash_collected || 0)}
              note="الفلوس التي دخلت درج الكاشير فعليًا."
              icon={Banknote}
              loading={loading}
              tone="good"
            />
            <MetricCard
              title="بطاقات POS"
              value={formatCurrency(data?.pos.card_collected || 0)}
              note="التحصيل بالبطاقة بعد خصم كوبونات الولاء."
              icon={CreditCard}
              loading={loading}
            />
            <MetricCard
              title="مرتجعات نقدي/بطاقة"
              value={formatCurrency(data?.returns.net_customer_refunds || 0)}
              note={`نقدي ${formatCurrency(data?.returns.cash_refunds || 0)} · بطاقة ${formatCurrency(data?.returns.card_refunds || 0)}.`}
              icon={RotateCcw}
              loading={loading}
              tone="danger"
            />
            <MetricCard
              title="المصروفات المسجلة"
              value={formatCurrency(expenses)}
              note="مصروفات النظام منفصلة عن خصومات الولاء."
              icon={Wallet}
              loading={financeQuery.isLoading}
              tone="danger"
            />
          </div>
        </section>

        <FinanceSettlementCenterV2 />

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="border-slate-100 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><RotateCcw size={19} className="text-primary" />تفصيل المرتجعات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">إجمالي قيمة المنتجات المرتجعة</span><strong>{formatCurrency(data?.returns.gross_returns || 0)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">رجع لكوبونات الخصم</span><strong className="text-amber-700">{formatCurrency(data?.returns.loyalty_restored || 0)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">رجع للعميل كفلوس</span><strong className="text-red-700">{formatCurrency(data?.returns.net_customer_refunds || 0)}</strong></div>
              <div className="flex justify-between border-t pt-3"><span className="text-slate-500">عدد المرتجعات</span><strong>{formatNumber(data?.returns.return_count || 0)}</strong></div>
            </CardContent>
          </Card>

          <Card className="border-slate-100 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><TrendingUp size={19} className="text-primary" />ربحية نقطة البيع</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">ربح POS بعد كوبونات الولاء</span><strong>{formatCurrency(data?.pos.profit_after_loyalty || 0)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">تأثير المرتجعات بعد استرجاع الكوبون</span><strong className="text-red-700">- {formatCurrency(data?.returns.profit_impact_after_loyalty_restore || 0)}</strong></div>
              <div className="flex justify-between border-t pt-3"><span className="text-slate-500">ربح POS بعد المرتجعات</span><strong className="text-emerald-700">{formatCurrency(data?.totals.pos_profit_after_returns || 0)}</strong></div>
              <p className="pt-1 text-xs leading-5 text-slate-400">الرقم خاص بمبيعات POS ذات تكلفة شراء محفوظة. مصروفات التشغيل وأرباح الأونلاين تعرض بشكل مستقل حتى لا نخلط تقديرات بتكلفة فعلية.</p>
            </CardContent>
          </Card>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="text-primary" size={20} />
            <h2 className="text-lg font-black">الولاء وكوبونات الخصم</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard title="نقاط مكتسبة" value={formatNumber(data?.loyalty.points_earned || 0)} note="نقاط كسبها العملاء خلال الفترة." icon={Sparkles} loading={loading} />
            <MetricCard title="نقاط تم تحويلها" value={formatNumber(data?.loyalty.points_converted || 0)} note="نقاط تحولت إلى كوبونات خصم." icon={Gift} loading={loading} />
            <MetricCard title="كوبونات تم إنشاؤها" value={formatCurrency(data?.loyalty.coupons_created_value || 0)} note="القيمة الاسمية للكوبونات الجديدة." icon={Gift} loading={loading} tone="loyalty" />
            <MetricCard title="كوبونات مستخدمة" value={formatCurrency(data?.loyalty.coupons_used_value || 0)} note="إجمالي القيمة المستخدمة خلال الفترة." icon={Tag} loading={loading} tone="loyalty" />
            <MetricCard title="كوبونات تم استرجاعها" value={formatCurrency(data?.loyalty.coupons_restored_value || 0)} note="قيمة عادت للكوبونات بسبب المرتجعات." icon={RotateCcw} loading={loading} />
            <MetricCard title="رصيد كوبونات قائم" value={formatCurrency(data?.loyalty.coupons_outstanding_value || 0)} note="إجمالي الرصيد المتبقي في الكوبونات النشطة بالنظام." icon={Wallet} loading={loading} />
          </div>
        </section>
      </div>
    </MainLayout>
  );
}
