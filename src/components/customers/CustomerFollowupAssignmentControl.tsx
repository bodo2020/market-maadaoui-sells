import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus2, Loader2, UserRoundCheck, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranchStore } from "@/stores/branchStore";
import { createCustomerFollowup, fetchCustomerManagementWorkspace, type CustomerFollowupType } from "@/services/supabase/customerManagementActionsService";
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
  const [createType, setCreateType] = useState<CustomerFollowupType>("whatsapp");
  const [createPriority, setCreatePriority] = useState<"low" | "medium" | "high">("medium");
  const [createSubject, setCreateSubject] = useState("");
  const [createAt, setCreateAt] = useState("");
  const [createAssigneeId, setCreateAssigneeId] = useState("");

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

  useEffect(() => {
    if (!createAssigneeId && assigneesQuery.data?.length) setCreateAssigneeId(assigneesQuery.data[0].id);
    if (createAssigneeId && assigneesQuery.data && !assigneesQuery.data.some((person) => person.id === createAssigneeId)) {
      setCreateAssigneeId(assigneesQuery.data[0]?.id || "");
    }
  }, [createAssigneeId, assigneesQuery.data]);

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

  const createAssigned = async () => {
    if (busy) return;
    if (createSubject.trim().length < 2) return toast.error("اكتب عنوان المتابعة.");
    if (!createAt) return toast.error("حدد موعد المتابعة.");
    if (!createAssigneeId) return toast.error("اختر المسؤول عن المتابعة.");
    const parsed = new Date(createAt);
    if (Number.isNaN(parsed.getTime())) return toast.error("موعد المتابعة غير صحيح.");

    setBusy(true);
    try {
      await createCustomerFollowup({
        customerId,
        type: createType,
        subject: createSubject.trim(),
        scheduledAt: parsed.toISOString(),
        priority: createPriority,
        assignedTo: createAssigneeId,
        branchId: currentBranchId || null,
      });
      toast.success("تم إنشاء المتابعة وإسنادها للمسؤول المختار.");
      setCreateSubject("");
      setCreateAt("");
      setCreatePriority("medium");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء المتابعة.");
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
            <p className="mt-1 text-xs leading-5 text-muted-foreground">أنشئ المهمة على المسؤول المناسب من البداية، أو انقل متابعة معلقة. القائمة تعرض حمل الموظفين الحالي.</p>
          </div>
          <Badge variant="outline">{pending.length} معلقة</Badge>
        </div>

        <section className="mt-4 rounded-2xl border bg-slate-50/60 p-3">
          <div className="flex items-center gap-2 text-sm font-black"><CalendarPlus2 className="h-4 w-4 text-[#005931]" />متابعة جديدة</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Select value={createType} onValueChange={(value) => setCreateType(value as CustomerFollowupType)}>
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="call">مكالمة</SelectItem>
                <SelectItem value="meeting">مقابلة</SelectItem>
                <SelectItem value="email">بريد</SelectItem>
              </SelectContent>
            </Select>
            <Select value={createPriority} onValueChange={(value) => setCreatePriority(value as "low" | "medium" | "high") }>
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">عادية</SelectItem>
                <SelectItem value="medium">متوسطة</SelectItem>
                <SelectItem value="high">مهمة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input className="mt-2 bg-white" value={createSubject} onChange={(event) => setCreateSubject(event.target.value)} placeholder="عنوان المتابعة" />
          <Input className="mt-2 bg-white" type="datetime-local" value={createAt} onChange={(event) => setCreateAt(event.target.value)} />

          {assigneesQuery.isLoading ? (
            <div className="mt-2 flex h-11 items-center justify-center rounded-xl border bg-white"><Loader2 className="h-4 w-4 animate-spin text-[#005931]" /></div>
          ) : assigneesQuery.data?.length ? (
            <Select value={createAssigneeId} onValueChange={setCreateAssigneeId}>
              <SelectTrigger className="mt-2 bg-white"><SelectValue placeholder="اختر المسؤول" /></SelectTrigger>
              <SelectContent>
                {assigneesQuery.data.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name} · {person.role || "موظف"} · {person.pending_count} معلقة{person.overdue_count > 0 ? ` · ${person.overdue_count} متأخرة` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">لا يوجد موظفون مؤهلون لإدارة العملاء في الفرع الحالي.</div>
          )}

          <Button className="mt-2 w-full bg-[#005931] hover:bg-[#004a29]" disabled={busy || !createAssigneeId} onClick={() => void createAssigned()}>
            {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CalendarPlus2 className="ml-2 h-4 w-4" />}
            إنشاء وإسناد المتابعة
          </Button>
        </section>

        <section className="mt-4">
          <div className="text-sm font-black">إعادة توزيع متابعة معلقة</div>
          {pending.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">لا توجد متابعة معلقة لتوزيعها.</div>
          ) : (
            <div className="mt-3 space-y-3">
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

              {assigneesQuery.data?.length ? (
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
              ) : null}

              {selectedFollowup && (
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                  <div><span className="text-muted-foreground">المسؤول الحالي</span><div className="mt-1 font-bold">{selectedFollowup.assigned_to_name || "غير محدد"}</div></div>
                  <div><span className="text-muted-foreground">الموعد</span><div className="mt-1 font-bold">{formatDate(selectedFollowup.scheduled_at)}</div></div>
                </div>
              )}

              <Button className="w-full" variant="outline" disabled={busy || !assigneeId} onClick={() => void assign()}>
                {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <UserRoundCheck className="ml-2 h-4 w-4" />}
                حفظ مسؤول المتابعة
              </Button>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
