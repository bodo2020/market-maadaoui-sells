
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  TrendingUp,
  DollarSign
} from "lucide-react";
import { fetchFinancialSummary, fetchProfitsSummary } from "@/services/supabase/financeService";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ar } from "date-fns/locale";

function formatCurrency(amount: number): string {
  return `${siteConfig.currency} ${amount.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}`;
}

export default function Finance() {
  const [period, setPeriod] = useState<"day" | "week" | "month" | "quarter" | "year" | "custom">("month");
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(new Date()));
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  
  const { data: summaryData, isLoading: isLoadingSummary } = useQuery({
    queryKey: ['financialSummary', period, startDate, endDate],
    queryFn: () => fetchFinancialSummary(period, startDate, endDate)
  });
  
  const { data: profitsData, isLoading: isLoadingProfits } = useQuery({
    queryKey: ['profitsSummary', period, startDate, endDate],
    queryFn: () => fetchProfitsSummary(period, startDate, endDate)
  });

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

  return (
    <MainLayout>
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
                <Button 
                  variant={period === "day" ? "default" : "outline"} 
                  size="sm" 
                  onClick={() => handleDateRangeChange("day")}
                >
                  اليوم
                </Button>
                <Button 
                  variant={period === "week" ? "default" : "outline"} 
                  size="sm" 
                  onClick={() => handleDateRangeChange("week")}
                >
                  هذا الأسبوع
                </Button>
                <Button 
                  variant={period === "month" ? "default" : "outline"} 
                  size="sm" 
                  onClick={() => handleDateRangeChange("month")}
                >
                  هذا الشهر
                </Button>
                <Button 
                  variant={period === "year" ? "default" : "outline"} 
                  size="sm" 
                  onClick={() => handleDateRangeChange("year")}
                >
                  هذا العام
                </Button>
                <Button 
                  variant={period === "custom" ? "default" : "outline"} 
                  size="sm" 
                  onClick={() => handleDateRangeChange("custom")}
                  className="col-span-2"
                >
                  مخصص
                </Button>
              </div>
              {period === "custom" && (
                <div className="text-center text-sm mb-2">
                  {startDate && !endDate 
                    ? "اختر تاريخ الانتهاء"
                    : !startDate 
                      ? "اختر تاريخ البدء" 
                      : `${format(startDate, "dd/MM/yyyy")} - ${format(endDate!, "dd/MM/yyyy")}`}
                </div>
              )}
            </div>
            {period === "custom" && (
              <Calendar
                mode="range"
                selected={{
                  from: startDate!,
                  to: endDate!
                }}
                onSelect={(range) => {
                  if (range) {
                    setStartDate(range.from);
                    setEndDate(range.to);
                  }
                }}
                locale={ar}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            )}
          </PopoverContent>
        </Popover>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الإيرادات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <div className="text-2xl font-bold animate-pulse">تحميل...</div>
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(summaryData?.totalRevenue || 0)}</div>
                <div className="flex items-center text-xs text-green-500 mt-1">
                  <ArrowUpRight className="h-3 w-3 ml-1" />
                  <span>من المبيعات</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المصروفات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <div className="text-2xl font-bold animate-pulse">تحميل...</div>
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(summaryData?.totalExpenses || 0)}</div>
                <div className="flex items-center text-xs text-red-500 mt-1">
                  <ArrowDownLeft className="h-3 w-3 ml-1" />
                  <span>من المصروفات</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">صافي الربح</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <div className="text-2xl font-bold animate-pulse">تحميل...</div>
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(summaryData?.netProfit || 0)}</div>
                <div className="flex items-center text-xs text-green-500 mt-1">
                  <TrendingUp className="h-3 w-3 ml-1" />
                  <span>بنسبة {(summaryData?.profitMargin || 0).toFixed(1)}%</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">صافي الربح بعد المصروفات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingProfits || isLoadingSummary ? (
              <div className="text-2xl font-bold animate-pulse">تحميل...</div>
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency((summaryData?.netProfit || 0) - (summaryData?.totalExpenses || 0))}
                </div>
                <div className="flex items-center text-xs text-muted-foreground mt-1">
                  <DollarSign className="h-3 w-3 ml-1" />
                  <span>الربح النهائي</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
