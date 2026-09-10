import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalendarClock, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPayrollPayDay } from "@/services/hrPayrollService";

export default function PayrollPayDayCard({
  branchId,
  value,
  onSaved,
}: {
  branchId: string;
  value?: number | null;
  onSaved: () => Promise<unknown> | unknown;
}) {
  const [day, setDay] = useState(value ? String(value) : "");

  useEffect(() => {
    setDay(value ? String(value) : "");
  }, [value, branchId]);

  const mutation = useMutation({
    mutationFn: async () => {
      const next = Number(day);
      if (!Number.isInteger(next) || next < 1 || next > 31) throw new Error("يوم صرف الراتب يجب أن يكون من 1 إلى 31.");
      return setPayrollPayDay(branchId, next);
    },
    onSuccess: async result => {
      toast.success(`تم تحديد يوم صرف الراتب: يوم ${result.pay_day_of_month} من كل شهر.`);
      await onSaved();
    },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر حفظ يوم صرف الراتب."),
  });

  return (
    <Card className="border-[#005931]/20">
      <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-end md:justify-between md:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-black"><CalendarClock className="h-5 w-5 text-[#005931]" />موعد صرف الراتب</div>
          <p className="mt-1 text-sm text-muted-foreground">حدد يوم الصرف المعتاد للفرع. الموظف هيشوف تاريخ القبض القادم تلقائيًا في بروفايله.</p>
          {!value && <div className="mt-2 text-xs font-bold text-amber-700">لم يتم تحديد يوم الصرف بعد؛ لذلك يظهر موعد القبض للموظفين كغير محدد.</div>}
        </div>
        <div className="flex w-full items-end gap-2 md:w-auto">
          <div className="w-full md:w-32">
            <Label className="mb-1 block text-xs">يوم الشهر</Label>
            <Input type="number" inputMode="numeric" min={1} max={31} value={day} onChange={event => setDay(event.target.value)} placeholder="مثال: 1" disabled={mutation.isPending} />
          </div>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !day} className="bg-[#005931] hover:bg-[#004426]">
            {mutation.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
            حفظ
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
