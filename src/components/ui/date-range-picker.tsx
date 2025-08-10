
import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { addDays, format } from "date-fns";
import { ar } from "date-fns/locale";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
  from: Date;
  to: Date;
  onSelect: (range: DateRange | undefined) => void;
  className?: string;
}

export function DateRangePicker({
  from,
  to,
  onSelect,
  className,
}: DateRangePickerProps) {
  const dateRange = { from, to };

  const displayDate = () => {
    let dateStr = '';
    if (from && to) {
      const fromFormatted = format(from, "PPP", { locale: ar });
      const toFormatted = format(to, "PPP", { locale: ar });
      
      if (format(from, "MM/dd/yyyy") === format(to, "MM/dd/yyyy")) {
        dateStr = fromFormatted;
      } else {
        dateStr = `${fromFormatted} - ${toFormatted}`;
      }
    }
    return dateStr;
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            size="sm"
            className={cn(
              "w-auto justify-start text-left font-normal",
              !from && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="ml-2 h-4 w-4" />
            {displayDate() || <span>حدد التاريخ</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={from}
            selected={dateRange}
            onSelect={onSelect}
            numberOfMonths={2}
            locale={ar}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
