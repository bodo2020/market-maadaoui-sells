import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserRoundCheck, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranchStore } from "@/stores/branchStore";
import { fetchCustomerManagementWorkspace } from "@/services/supabase/customerManagementActionsService";
import {
  fetchCustomerFollowupAssignees,
  reassignCustomerFollowup,
} from "@/services/supabase/customerFollowupAssignmentService";

const typeLabel: Record<string, string> = {
  call: "مكالمة",
  whatsapp: "WhatsApp",
  email: "بريد",
  meeting: "مقابلة",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "—";
  }
}

export default function CustomerFollowupAssignmentControl({ customerId }: { customerId: string }) {
  const { currentBranchId } = useBranchStore();
  const queryClient = useQueryClient();
  const [interactionId, setInteractionId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [busy, setBusy] = useState(false);

  const workspaceQuery = useQuery({
    queryKey: ["customer-management-workspace", customerId, currentBranchId],
    queryFn: () => fetchCustomerManagementWorkspace(customerId, currentBranchId || null),
  });

  const assigneesQuery = useQuery({
    queryKey: ["customer-followup-assignees", currentBranchId],
    enabled: workspaceQuery.data?.permissions.can_manage === true,
    queryFn: () => fetchCustomerFollowupAssignees(currentBranchId || null),
  });

  const pending = workspaceQuery.data?.pending_followups || [];
  const selectedFollowup = useMemo(() => pending.find((item) => item.id === interactionId) || null, [interactionId, pending]);

  useEffect(() => {
    if (!interactionId && pending.length > 0) setInteractionId(pending[0].id);
    if (interactionId && !pending.some((item) => item.id === interactionId)) setInteractionId(pending[0]?.id || "");
  }, [interactionId, pending]);

  useEffect(() => {
    if (selectedFollowup?.assigned_to) setAssigneeId(selectedFollowup.assigned_to);
    else if (assigneesQuery.data?.length) setAssigneeId(assigneesQuery.data[0].id);
  }, [selectedFollowup?.id, selectedFollowup?.assigned_to, assigneesQuery.data]);

  const refresh = async () => {
    await Promise.all([
      workspaceQuery.refetch(),
      assigneesQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ["customer-opportunity-board"] }),
      queryClient.invalidateQueries({ queryKey: ["customer-operations-center"] }),
    ]);
  };

  const assign = async () => {
    if (!interactionId || !assigneeId || busy) return;
    setBusy(true);
    try {
      await reassignCustomerFollowup(interactionId, assigneeId, currentBranchId || null);
      toast.success("تم تحديث مسؤول المتابعة.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحديث مسؤول المتابعة.");
    } finally {
      setBusy(false);
    }
  };

  if (workspaceQuery.isLoading) {
    return <Card><CardContent className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-[#005931]" /></CardContent></Card>;
  }

  if (!workspaceQuery.data?.permissions.can_manage) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-black"><UsersRound className="h-4 w-4 text-[#005931]" />توزيع المتابعات</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">اختار المهمة والمسؤول عنها. القائمة تعرض فقط الموظفين المسموح لهم بإدارة العملاء في الفرع.</p>
          </div>
          <Badge variant="outline">{pending.length} معلقة</Badge>
        </div>

        {pending.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">لا توجد متابعة معلقة لتوزيعها.</div>
        ) : (
          <div className="mt-4 space-y-3">
            <Select value={interactionId} onValueChange={setInteractionId}>
              <SelectTrigger><SelectValue placeholder="اختر المتابعة" /></SelectTrigger>
              <SelectContent>
                {pending.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.subject} · {typeLabel[item.type] || item.type} · {formatDate(item.scheduled_at)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {assigneesQuery.isLoading ? (
              <div className="flex h-11 items-center justify-center rounded-xl border"><Loader2 className="h-4 w-4 animate-spin text-[#005931]" /></div>
            ) : assigneesQuery.data?.length ? (
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger><SelectValue placeholder="اختر المسؤول" /></SelectTrigger>
                <SelectContent>
                  {assigneesQuery.data.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name} · {person.role || "موظف"} · {person.pending_count} معلقة{person.overdue_count > 0 ? ` · ${person.overdue_count} متأخرة` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">لا يوجد موظفون مؤهلون لإدارة العملاء في الفرع الحالي.</div>
            )}

            {selectedFollowup && (
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                <div><span className="text-muted-foreground">المسؤول الحالي</span><div className="mt-1 font-bold">{selectedFollowup.assigned_to_name || "غير محدد"}</div></div>
                <div><span className="text-muted-foreground">الموعد</span><div className="mt-1 font-bold">{formatDate(selectedFollowup.scheduled_at)}</div></div>
              </div>
            )}

            <Button className="w-full bg-[#005931] hover:bg-[#004a29]" disabled={busy || !assigneeId} onClick={() => void assign()}>
              {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <UserRoundCheck className="ml-2 h-4 w-4" />}
              حفظ مسؤول المتابعة
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
