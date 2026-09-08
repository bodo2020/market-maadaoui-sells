import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Clock3, Loader2, MessageCircleMore, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBranchStore } from "@/stores/branchStore";
import {
  completeCustomerFollowupV2,
  fetchCustomerManagementWorkspace,
  type CustomerFollowupOutcomeCode,
} from "@/services/supabase/customerManagementActionsService";

const outcomeOptions: Array<{ value: CustomerFollowupOutcomeCode; label: string }> = [
  { value: "reached", label: "تم التواصل" },
  { value: "no_answer", label: "لم يرد" },
  { value: "interested", label: "مهتم" },
  { value: "not_interested", label: "غير مهتم" },
  { value: "issue_resolved", label: "تم حل المشكلة" },
  { value: "callback_requested", label: "طلب إعادة التواصل" },
  { value: "wrong_number", label: "رقم غير صحيح" },
];

const typeLabel: Record<string, string> = {
  call: "مكالمة",
  whatsapp: "WhatsApp",
  email: "بريد",
  meeting: "مقابلة",
};

const date = (value?: string | null) => value ? new Intl.DateTimeFormat("ar-EG", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
}).format(new Date(value)) : "—";

export default function CustomerStructuredFollowupControl({ customerId }: { customerId: string }) {
  const { currentBranchId } = useBranchStore();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outcomeCode, setOutcomeCode] = useState<CustomerFollowupOutcomeCode>("reached");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ["customer-management-workspace", customerId, currentBranchId],
    queryFn: () => fetchCustomerManagementWorkspace(customerId, currentBranchId || null),
  });

  const workspace = query.data;
  if (query.isLoading) return <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-[#005931]" /></div>;
  if (query.isError || !workspace || !workspace.permissions.can_manage) return null;

  const pending = workspace.pending_followups || [];

  const complete = async () => {
    if (!selectedId || busy) return;
    setBusy(true);
    try {
      await completeCustomerFollowupV2(selectedId, outcomeCode, outcomeNote, currentBranchId || null);
      toast.success("تم تسجيل نتيجة المتابعة.");
      setSelectedId(null);
      setOutcomeCode("reached");
      setOutcomeNote("");
      await Promise.all([
        query.refetch(),
        queryClient.invalidateQueries({ queryKey: ["customer-followup-performance", customerId] }),
        queryClient.invalidateQueries({ queryKey: ["customer-operations-center"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-followup-outcome-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-opportunity-board"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-360", customerId] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل النتيجة.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border bg-white p-4">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-[#005931]" />
        <div><div className="font-black">تسجيل نتيجة متابعة</div><div className="text-[11px] text-muted-foreground">اختيار نتيجة منظمة يخلي تقارير التحويل أدق.</div></div>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-slate-50 p-5 text-center text-xs text-muted-foreground">لا توجد متابعات معلقة حاليًا.</div>
      ) : (
        <div className="space-y-2">
          {pending.map(item => (
            <Card key={item.id} className={selectedId === item.id ? "border-[#005931] ring-1 ring-[#005931]/20" : ""}>
              <CardContent className="p-3">
                <button type="button" className="w-full text-right" onClick={() => setSelectedId(item.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="truncate text-sm font-bold">{item.subject}</div><div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3 className="h-3 w-3" />{typeLabel[item.type] || item.type} · {date(item.scheduled_at)}</div></div>
                    <Badge variant="outline" className={item.overdue ? "border-red-200 bg-red-50 text-red-700" : ""}>{item.overdue ? "متأخرة" : "معلقة"}</Badge>
                  </div>
                </button>

                {selectedId === item.id && (
                  <div className="mt-3 space-y-3 border-t pt-3">
                    <div>
                      <Label>النتيجة</Label>
                      <Select value={outcomeCode} onValueChange={(value) => setOutcomeCode(value as CustomerFollowupOutcomeCode)}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{outcomeOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>ملاحظة اختيارية</Label>
                      <Textarea className="mt-1 min-h-20" maxLength={1000} value={outcomeNote} onChange={(event) => setOutcomeNote(event.target.value)} placeholder="مثال: مهتم بعرض آخر الشهر أو طلب الاتصال مساءً" />
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Button disabled={busy} onClick={() => void complete()}><CheckCircle2 className="ml-2 h-4 w-4" />حفظ النتيجة</Button>
                      <Button variant="outline" disabled={busy} onClick={() => { setSelectedId(null); setOutcomeNote(""); }}>إلغاء</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-[11px] text-muted-foreground"><MessageCircleMore className="h-4 w-4 shrink-0 text-[#005931]" />لو النتيجة «طلب إعادة التواصل» تقدر بعد الحفظ تجدول متابعة جديدة من «إدارة العميل».</div>
    </section>
  );
}
