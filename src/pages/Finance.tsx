
import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownLeft, TrendingUp, DollarSign, Store, ShoppingCart, Calendar as CalendarIcon } from "lucide-react";
import { fetchFinancialSummary, fetchProfitsSummary } from "@/services/supabase/financeService";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ar } from "date-fns/locale";
import { toast } from "sonner";

function formatCurrency(amount: number): string {
  return `${siteConfig.currency} ${amount.toLocaleString('ar-EG', {
    maximumFractionDigits: 2
  })}`;
}

export default function Finance() {
  const [period, setPeriod] = useState<"day" | "week" | "month" | "quarter" | "year" | "custom">("month");
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(new Date()));
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  useEffect(() => {
    console.log(`Finance page initialized with period: ${period}, dates: ${startDate} - ${endDate}`);
  }, []);
  
  const {
    data: summaryData,
    isLoading: isLoadingSummary,
    isError: isSummaryError,
    error: summaryError
  } = useQuery({
    queryKey: ['financialSummary', period, startDate, endDate],
    queryFn: () => fetchFinancialSummary(period, startDate, endDate),
    onError: (error) => {
      console.error("Error fetching financial summary:", error);
      toast.error("حدث خطأ أثناء تحميل البيانات المالية");
    }
  });
  
  const {
    data: profitsData,
    isLoading: isLoadingProfits,
    isError: isProfitsError,
    error: profitsError
  } = useQuery({
    queryKey: ['profitsSummary', period, startDate, endDate],
    queryFn: () => fetchProfitsSummary(period, startDate, endDate),
    onError: (error) => {
      console.error("Error fetching profits summary:", error);
      toast.error("حدث خطأ أثناء تحميل بيانات الأرباح");
    }
  });
  
  useEffect(() => {
    if (isSummaryError) {
      console.error("Financial summary error:", summaryError);
    }
    if (isProfitsError) {
      console.error("Profits summary error:", profitsError);
    }
  }, [isSummaryError, isProfitsError, summaryError, profitsError]);
  
  const handleDateRangeChange = (value: "day" | "week" | "month" | "quarter" | "year" | "custom") => {
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
      "day": "اليوم",
      "week": "هذا الأسبوع",
      "month": "هذا الشهر",
      "quarter": "هذا الربع",
      "year": "هذا العام",
      "custom": "مخصص"
    }[period] || "اختر الفترة";
  };
  
  return <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">الإدارة المالية</h1>
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-auto flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              <span>{getDateRangeText()}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <div className="p-4 border-b">
              <div className="grid grid-cols-2 gap-2 mb-4">
                <Button variant={period === "day" ? "default" : "outline"} size="sm" onClick={() => handleDateRangeChange("day")}>
                  اليوم
                </Button>
                <Button variant={period === "week" ? "default" : "outline"} size="sm" onClick={() => handleDateRangeChange("week")}>
                  هذا الأسبوع
                </Button>
                <Button variant={period === "month" ? "default" : "outline"} size="sm" onClick={() => handleDateRangeChange("month")}>
                  هذا الشهر
                </Button>
                <Button variant={period === "year" ? "default" : "outline"} size="sm" onClick={() => handleDateRangeChange("year")}>
                  هذا العام
                </Button>
                <Button variant={period === "custom" ? "default" : "outline"} size="sm" onClick={() => handleDateRangeChange("custom")} className="col-span-2">
                  مخصص
                </Button>
              </div>
              {period === "custom" && <div className="text-center text-sm mb-2">
                  {startDate && !endDate ? "اختر تاريخ الانتهاء" : !startDate ? "اختر تاريخ البدء" : `${format(startDate, "dd/MM/yyyy")} - ${format(endDate!, "dd/MM/yyyy")}`}
                </div>}
            </div>
            {period === "custom" && <Calendar mode="range" selected={{
            from: startDate!,
            to: endDate!
          }} onSelect={range => {
            if (range) {
              setStartDate(range.from);
              setEndDate(range.to);
            }
          }} locale={ar} initialFocus className="p-3 pointer-events-auto" />}
          </PopoverContent>
        </Popover>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي  الإيرادات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <div className="text-2xl font-bold animate-pulse">تحميل...</div> : <>
                <div className="text-2xl font-bold">{formatCurrency(summaryData?.totalRevenue || 0)}</div>
                <div className="flex items-center text-xs text-green-500 mt-1">
                  <ArrowUpRight className="h-3 w-3 ml-1" />
                  <span>من المبيعات</span>
                </div>
              </>}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المصروفات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <div className="text-2xl font-bold animate-pulse">تحميل...</div> : <>
                <div className="text-2xl font-bold">{formatCurrency(summaryData?.totalExpenses || 0)}</div>
                <div className="flex items-center text-xs text-red-500 mt-1">
                  <ArrowDownLeft className="h-3 w-3 ml-1" />
                  <span>من المصروفات</span>
                </div>
              </>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">أرباح المحل</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingProfits ? <div className="text-2xl font-bold animate-pulse">تحميل...</div> : <>
                <div className="text-2xl font-bold">{formatCurrency(profitsData?.storeProfits || 0)}</div>
                <div className="flex items-center text-xs text-green-500 mt-1">
                  <Store className="h-3 w-3 ml-1" />
                  <span>أرباح المبيعات المباشرة</span>
                </div>
              </>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">أرباح الأونلاين</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingProfits ? <div className="text-2xl font-bold animate-pulse">تحميل...</div> : <>
                <div className="text-2xl font-bold">{formatCurrency(profitsData?.onlineProfits || 0)}</div>
                <div className="flex items-center text-xs text-green-500 mt-1">
                  <ShoppingCart className="h-3 w-3 ml-1" />
                  <span>أرباح المبيعات الإلكترونية</span>
                </div>
              </>}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الأرباح</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingProfits ? <div className="text-2xl font-bold animate-pulse">تحميل...</div> : <>
                <div className="text-2xl font-bold">
                  {formatCurrency((profitsData?.storeProfits || 0) + (profitsData?.onlineProfits || 0))}
                </div>
                <div className="flex items-center text-xs text-green-500 mt-1">
                  <TrendingUp className="h-3 w-3 ml-1" />
                  <span>إجمالي الأرباح قبل خصم المصروفات</span>
                </div>
              </>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">صافي الربح بعد المصروفات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingProfits || isLoadingSummary ? <div className="text-2xl font-bold animate-pulse">تحميل...</div> : <>
                <div className="text-2xl font-bold">
                  {formatCurrency((profitsData?.storeProfits || 0) + (profitsData?.onlineProfits || 0) - (summaryData?.totalExpenses || 0))}
                </div>
                <div className="flex items-center text-xs text-green-500 mt-1">
                  <DollarSign className="h-3 w-3 ml-1" />
                  <span>صافي الربح بعد خصم المصروفات</span>
                </div>
              </>}
          </CardContent>
        </Card>
      </div>
    </MainLayout>;
}
