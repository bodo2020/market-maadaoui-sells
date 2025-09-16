import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter } from "lucide-react";
import { DateRange } from "react-day-picker";
import { 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  startOfYear, 
  endOfYear,
  subDays,
  subWeeks,
  subMonths,
  subYears
} from "date-fns";

export type PeriodType = "today" | "week" | "month" | "3months" | "6months" | "year" | "2years" | "3years" | "5years";

interface PeriodFilterProps {
  selectedPeriod: PeriodType;
  onPeriodChange: (period: PeriodType) => void;
}

export function PeriodFilter({ selectedPeriod, onPeriodChange }: PeriodFilterProps) {
  const periodOptions = [
    { value: "today", label: "اليوم" },
    { value: "week", label: "هذا الأسبوع" },
    { value: "month", label: "هذا الشهر" },
    { value: "3months", label: "آخر 3 شهور" },
    { value: "6months", label: "آخر 6 شهور" },
    { value: "year", label: "هذه السنة" },
    { value: "2years", label: "آخر سنتين" },
    { value: "3years", label: "آخر 3 سنوات" },
    { value: "5years", label: "آخر 5 سنوات" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          فلتر الفترة الزمنية
        </CardTitle>
        <CardDescription>
          اختر الفترة الزمنية للحصول على تحليلات مخصصة
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Select value={selectedPeriod} onValueChange={(value: PeriodType) => onPeriodChange(value)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="اختر الفترة الزمنية" />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}

// دالة لتحويل نوع الفترة إلى DateRange
export function getDateRangeFromPeriod(period: PeriodType): DateRange {
  const now = new Date();
  
  switch (period) {
    case "today":
      return {
        from: startOfDay(now),
        to: endOfDay(now)
      };
    case "week":
      return {
        from: startOfWeek(now, { weekStartsOn: 6 }), // السبت أول أيام الأسبوع
        to: endOfWeek(now, { weekStartsOn: 6 })
      };
    case "month":
      return {
        from: startOfMonth(now),
        to: endOfMonth(now)
      };
    case "3months":
      return {
        from: startOfMonth(subMonths(now, 3)),
        to: endOfMonth(now)
      };
    case "6months":
      return {
        from: startOfMonth(subMonths(now, 6)),
        to: endOfMonth(now)
      };
    case "year":
      return {
        from: startOfYear(now),
        to: endOfYear(now)
      };
    case "2years":
      return {
        from: startOfYear(subYears(now, 2)),
        to: endOfYear(now)
      };
    case "3years":
      return {
        from: startOfYear(subYears(now, 3)),
        to: endOfYear(now)
      };
    case "5years":
      return {
        from: startOfYear(subYears(now, 5)),
        to: endOfYear(now)
      };
    default:
      return {
        from: startOfMonth(now),
        to: endOfMonth(now)
      };
  }
}

// دالة للحصول على اسم الفترة بالعربية
export function getPeriodLabel(period: PeriodType): string {
  const options = {
    today: "اليوم",
    week: "هذا الأسبوع", 
    month: "هذا الشهر",
    "3months": "آخر 3 شهور",
    "6months": "آخر 6 شهور",
    year: "هذه السنة",
    "2years": "آخر سنتين",
    "3years": "آخر 3 سنوات",
    "5years": "آخر 5 سنوات"
  };
  
  return options[period] || "هذا الشهر";
}