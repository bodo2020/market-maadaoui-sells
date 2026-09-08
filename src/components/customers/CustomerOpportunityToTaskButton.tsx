import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBranchStore } from "@/stores/branchStore";
import { fetchCustomerFollowupAssignees } from "@/services/supabase/customerFollowupAssignmentService";
import {
  createFollowupFromOpportunity,
  type CustomerConvertibleOpportunityKey,
  type CustomerOpportunityFollowupType,
} from "@/services/supabase/customerOpportunityTaskService";
import type { CustomerPrioritySignal } from "@/services/supabase/customerOperationsService";

const allowed = new Set<CustomerConvertibleOpportunityKey>([
  "abandoned_cart",
  "purchase_overdue",
  "purchase_due",
  "under_watch",
  "coupon_ready",
]);

const opportunityLabel: Record<CustomerConvertibleOpportunityKey, string> = {
  abandoned_cart: "سلة متروكة",
  purchase_overdue: "متأخر عن نمط الشراء",
  purchase_due: "موعد شراء متوقع",
  under_watch: "تحت المتابعة",
  coupon_ready: "كوبون خصم متاح",
};

const followupTypeLabel: Record<CustomerOpportunityFollowupType, string> = {
  call: "مكالمة",
  whatsapp: "WhatsApp",
  email: "بريد إلكتروني",
  meeting: "مقابلة",
};

function localDateTimeAfter(hours: number) {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function defaultType(key: CustomerConvertibleOpportunityKey): CustomerOpportunityFollowupType {
  return key === "coupon_ready" || key === "abandoned_cart" ? "whatsapp" : "call";
}

export default function CustomerOpportunityToTaskButton({
  customerId,
  customerName,
  signals,
  priorityLevel,
  onCreated,
}: {
  customerId: string;
  customerName: string | null;
  signals: CustomerPrioritySignal[];
  priorityLevel: string;
  onCreated?: () => void;
}) {
  const queryClient = useQueryClient();
  const { currentBranchId } = useBranchStore();
  const convertible = useMemo(
    () => Array.from(new Set(signals.map(signal => signal.type).filter((type): type is CustomerConvertibleOpportunityKey => allowed.has(type as CustomerConvertibleOpportunityKey)))),
    [signals],
  );
  const [open, setOpen] = useState(false);
  const [opportunityKey, setOpportunityKey] = useState<CustomerConvertibleOpportunityKey | "">(convertible[0] || "");
  const [followupType, setFollowupType] = useState<CustomerOpportunityFollowupType>(convertible[0] ? defaultType(convertible[0]) : "call");
  const [scheduledAt, setScheduledAt] = useState(localDateTimeAfter(1));
  const [priority, setPriority] = useState<"low" | "medium" | "high">(priorityLevel === "critical" || priorityLevel === "high" ? "high" : priorityLevel === "low" ? "low" : "medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const assigneesQuery = useQuery({
    queryKey: ["customer-followup-assignees", currentBranchId],
    enabled: open && Boolean(currentBranchId),
    queryFn: () => fetchCustomerFollowupAssignees(currentBranchId || null),
  });

  useEffect(() => {
    if (!opportunityKey && convertible[0]) setOpportunityKey(convertible[0]);
  }, [convertible, opportunityKey]);

  useEffect(() => {
    if (opportunityKey) setFollowupType(defaultType(opportunityKey));
  }, [opportunityKey]);

  useEffect(() => {
    if (!assignedTo && assigneesQuery.data?.length) setAssignedTo(assigneesQuery.data[0].id);
  }, [assignedTo, assigneesQuery.data]);

  if (!convertible.length) return null;

  const createTask = async () => {
    if (!currentBranchId || !opportunityKey || !assignedTo || !scheduledAt || saving) return;
    const parsed = new Date(scheduledAt);
    if (Number.isNaN(parsed.getTime())) return toast.error("حدد موعدًا صحيحًا للمهمة.");
    setSaving(true);
    try {
      const result = await createFollowupFromOpportunity({
        customerId,
        opportunityKey,
        type: followupType,
        scheduledAt: parsed.toISOString(),
        priority,
        assignedTo,
        note,
        branchId: currentBranchId,
      });
      if (result.duplicate) toast.info("فيه مهمة مفتوحة بالفعل لنفس الفرصة والعميل.");
      else toast.success("تم تحويل الفرصة إلى مهمة وإسنادها للموظف.");
      setOpen(false);
      setNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer-operations-center"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-opportunity-board"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-followup-team-workload"] }),
        queryClient.invalidateQueries({ queryKey: ["my-customer-followup-inbox"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-management-workspace", customerId] }),
      ]);
      onCreated?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء المهمة.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" className="bg-[#005931] hover:bg-[#004a29]" onClick={event => event.stopPropagation()}>
          <CalendarPlus2 className="ml-1.5 h-4 w-4" />حوّل لمهمة
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-lg" onClick={event => event.stopPropagation()}>
        <DialogHeader className="text-right">
          <DialogTitle>تحويل الفرصة إلى مهمة</DialogTitle>
        </DialogHeader>
        <div className="rounded-2xl bg-slate-50 p-3 text-sm">
          <div className="font-black">{customerName || "عميل"}</div>
          <div className="mt-1 text-xs text-muted-foreground">المهمة هتظهر فورًا في صندوق «مهامي» للمسؤول المختار.</div>
        </div>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div>
            <Label>سبب المتابعة</Label>
            <Select value={opportunityKey} onValueChange={value => setOpportunityKey(value as CustomerConvertibleOpportunityKey)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{convertible.map(key => <SelectItem key={key} value={key}>{opportunityLabel[key]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>نوع التواصل</Label>
            <Select value={followupType} onValueChange={value => setFollowupType(value as CustomerOpportunityFollowupType)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(followupTypeLabel).map(([key,label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>المسؤول</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo} disabled={assigneesQuery.isLoading}>
              <SelectTrigger className="mt-1"><SelectValue placeholder={assigneesQuery.isLoading ? "جارٍ تحميل الفريق..." : "اختر المسؤول"} /></SelectTrigger>
              <SelectContent>
                {(assigneesQuery.data || []).map(person => (
                  <SelectItem key={person.id} value={person.id}>{person.name} · {person.pending_count} معلقة{person.overdue_count ? ` · ${person.overdue_count} متأخرة` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الأولوية</Label>
            <Select value={priority} onValueChange={value => setPriority(value as "low" | "medium" | "high")}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="high">مهمة</SelectItem><SelectItem value="medium">متوسطة</SelectItem><SelectItem value="low">عادية</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>موعد التنفيذ</Label>
            <Input className="mt-1" type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>ملاحظة اختيارية</Label>
            <Textarea className="mt-1 min-h-20" value={note} onChange={event => setNote(event.target.value)} placeholder="مثال: اعرض عليه الكوبون الحالي أو اسأله عن سبب عدم إكمال السلة" />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>إلغاء</Button>
          <Button className="bg-[#005931] hover:bg-[#004a29]" disabled={saving || !assignedTo || !opportunityKey || !scheduledAt} onClick={() => void createTask()}>
            {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إنشاء المهمة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
