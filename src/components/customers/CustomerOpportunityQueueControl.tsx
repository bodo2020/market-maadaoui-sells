import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranchStore } from "@/stores/branchStore";
import {
  clearCustomerOpportunityQueueAction,
  fetchCustomerOpportunityQueueState,
  setCustomerOpportunityQueueAction,
} from "@/services/supabase/customerOperationsService";

const snoozeLabel: Record<number, string> = {
  4: "4 ساعات",
  24: "يوم",
  72: "3 أيام",
  168: "7 أيام",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

export default function CustomerOpportunityQueueControl({ customerId }: { customerId: string }) {
  const { currentBranchId } = useBranchStore();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [snoozeHours, setSnoozeHours] = useState<4 | 24 | 72 | 168>(24);

  const stateQuery = useQuery({
    queryKey: ["customer-opportunity-queue-state", currentBranchId],
    queryFn: () => fetchCustomerOpportunityQueueState(currentBranchId || null),
  });

  const active = useMemo(
    () => stateQuery.data?.active.find((item) => item.customer_id === customerId) || null,
    [customerId, stateQuery.data?.active],
  );

  const refresh = async () => {
    await Promise.all([
      stateQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ["customer-operations-center"] }),
      queryClient.invalidateQueries({ queryKey: ["customer-opportunity-board"] }),
      queryClient.invalidateQueries({ queryKey: ["customer-management-workspace"] }),
    ]);
  };

  const run = async (action: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(success);
      setNote("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تنفيذ الإجراء.");
    } finally {
      setBusy(false);
    }
  };

  if (stateQuery.isLoading) {
    return <Card><CardContent className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-[#005931]" /></CardContent></Card>;
  }

  if (stateQuery.isError) {
    return null;
  }

  return (
    <Card className="border-slate-200 bg-slate-50/60">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-black">قائمة الفرص</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">امنع تكرار نفس العميل في قائمة اليوم بعد التعامل معه، أو أجّل ظهوره لوقت مناسب.</p>
          </div>
          {active && (
            <Badge variant="outline" className={active.action_type === "handled" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
              {active.action_type === "handled" ? "تمت المعالجة" : "في غفوة"}
            </Badge>
          )}
        </div>

        {active ? (
          <div className="mt-4 rounded-2xl border bg-white p-3">
            <div className="text-sm font-bold">مخفي من قائمة الأولوية حتى {formatDate(active.suppress_until)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {active.created_by_name ? `بواسطة ${active.created_by_name}` : "تم تنفيذ الإجراء"}
              {active.note ? ` · ${active.note}` : ""}
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full"
              disabled={busy}
              onClick={() => void run(() => clearCustomerOpportunityQueueAction(customerId, currentBranchId || null), "تم إرجاع العميل لقائمة الفرص الآن.")}
            >
              {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <RotateCcw className="ml-2 h-4 w-4" />}
              إرجاع للقائمة الآن
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              placeholder="ملاحظة اختيارية، مثال: تم التواصل والعميل هيرجع لاحقًا"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                className="bg-[#005931] hover:bg-[#004a29]"
                disabled={busy}
                onClick={() => void run(
                  () => setCustomerOpportunityQueueAction({ customerId, actionType: "handled", note, branchId: currentBranchId || null }),
                  "تمت معالجة الفرصة، وسيختفي العميل من قائمة اليوم لمدة 24 ساعة.",
                )}
              >
                {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-2 h-4 w-4" />}
                تمت المعالجة اليوم
              </Button>

              <div className="flex gap-2">
                <Select value={String(snoozeHours)} onValueChange={(value) => setSnoozeHours(Number(value) as 4 | 24 | 72 | 168)}>
                  <SelectTrigger className="min-w-28 flex-1 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[4, 24, 72, 168].map((hours) => <SelectItem key={hours} value={String(hours)}>{snoozeLabel[hours]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(
                    () => setCustomerOpportunityQueueAction({ customerId, actionType: "snoozed", snoozeHours, note, branchId: currentBranchId || null }),
                    `تم تأجيل ظهور العميل لمدة ${snoozeLabel[snoozeHours]}.`,
                  )}
                >
                  <Clock3 className="ml-2 h-4 w-4" />غفوة
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
