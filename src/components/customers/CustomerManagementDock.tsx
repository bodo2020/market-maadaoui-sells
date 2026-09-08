import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Gift,
  History,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
  Phone,
  Plus,
  Settings2,
  ShieldAlert,
  Tag,
  Trash2,
  UserRoundCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranchStore } from "@/stores/branchStore";
import { fetchCustomer360 } from "@/services/supabase/customer360Service";
import {
  addCustomerManagementNote,
  adjustCustomerLoyaltyPoints,
  fetchCustomerManagementWorkspace,
  setCustomerManagementStatus,
  setCustomerManagementTag,
} from "@/services/supabase/customerManagementActionsService";

const statusLabel: Record<string, string> = {
  active: "نشط",
  watch: "تحت المتابعة",
  blocked: "موقوف",
};

const auditLabel: Record<string, string> = {
  tag_added: "إضافة تصنيف",
  tag_removed: "إزالة تصنيف",
  note_added: "إضافة ملاحظة",
  status_changed: "تغيير حالة العميل",
  points_adjusted: "تعديل نقاط الولاء",
};

const priorityLabel: Record<string, string> = {
  low: "عادية",
  medium: "متوسطة",
  high: "مهمة",
};

const formatDate = (value?: string | null) => {
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
};

const formatNumber = (value?: number | null) => Number(value || 0).toLocaleString("ar-EG");

export default function CustomerManagementDock() {
  const { customerId } = useParams();
  const { currentBranchId } = useBranchStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tagName, setTagName] = useState("");
  const [noteSubject, setNoteSubject] = useState("");
  const [noteDescription, setNoteDescription] = useState("");
  const [notePriority, setNotePriority] = useState<"low" | "medium" | "high">("medium");
  const [statusReason, setStatusReason] = useState("");
  const [nextStatus, setNextStatus] = useState<"active" | "watch" | "blocked">("active");
  const [pointsDelta, setPointsDelta] = useState("");
  const [pointsReason, setPointsReason] = useState("");

  const workspaceQuery = useQuery({
    queryKey: ["customer-management-workspace", customerId, currentBranchId],
    enabled: Boolean(customerId && open),
    queryFn: () => fetchCustomerManagementWorkspace(customerId!, currentBranchId || null),
  });

  const customerQuery = useQuery({
    queryKey: ["customer-360", customerId, currentBranchId],
    enabled: Boolean(customerId),
    queryFn: () => fetchCustomer360(customerId!, currentBranchId || null),
  });

  const workspace = workspaceQuery.data;
  const customer = customerQuery.data;

  const whatsappPhone = useMemo(() => {
    const raw = customer?.customer.phone?.replace(/\D/g, "") || "";
    if (!raw) return "";
    if (raw.startsWith("20")) return raw;
    if (raw.startsWith("0")) return `20${raw.slice(1)}`;
    return raw;
  }, [customer?.customer.phone]);

  const refreshAll = async () => {
    await Promise.all([
      workspaceQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ["customer-360", customerId] }),
      queryClient.invalidateQueries({ queryKey: ["customer-management"] }),
    ]);
  };

  const run = async (action: () => Promise<unknown>, successMessage: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تنفيذ العملية.");
    } finally {
      setBusy(false);
    }
  };

  const addTag = () => {
    const value = tagName.trim();
    if (!value) return toast.error("اكتب اسم التصنيف أولًا.");
    void run(
      () => setCustomerManagementTag(customerId!, value, true, currentBranchId || null),
      "تمت إضافة التصنيف للعميل.",
    ).then(() => setTagName(""));
  };

  const addNote = () => {
    if (noteSubject.trim().length < 2) return toast.error("اكتب عنوانًا واضحًا للملاحظة.");
    void run(
      () => addCustomerManagementNote(customerId!, noteSubject.trim(), noteDescription.trim(), notePriority, currentBranchId || null),
      "تم حفظ الملاحظة في ملف العميل.",
    ).then(() => {
      setNoteSubject("");
      setNoteDescription("");
      setNotePriority("medium");
    });
  };

  const changeStatus = () => {
    if (statusReason.trim().length < 3) return toast.error("اكتب سبب تغيير الحالة.");
    void run(
      () => setCustomerManagementStatus(customerId!, nextStatus, statusReason.trim(), currentBranchId || null),
      "تم تحديث حالة العميل.",
    ).then(() => setStatusReason(""));
  };

  const adjustPoints = () => {
    const delta = Number(pointsDelta);
    if (!Number.isInteger(delta) || delta === 0) return toast.error("اكتب عدد نقاط صحيحًا، موجب للإضافة أو سالب للخصم.");
    if (pointsReason.trim().length < 3) return toast.error("اكتب سبب تعديل النقاط.");
    void run(
      () => adjustCustomerLoyaltyPoints(customerId!, delta, pointsReason.trim(), currentBranchId || null),
      delta > 0 ? "تمت إضافة النقاط للعميل." : "تم خصم النقاط من العميل.",
    ).then(() => {
      setPointsDelta("");
      setPointsReason("");
    });
  };

  if (!customerId) return null;

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-[70] h-12 rounded-full bg-[#005931] px-5 shadow-[0_14px_35px_rgba(0,89,49,.28)] hover:bg-[#004425]"
      >
        <UserRoundCog className="ml-2 h-5 w-5" />
        إدارة العميل
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader className="text-right">
            <SheetTitle className="flex items-center gap-2 text-xl">
              <Settings2 className="h-5 w-5 text-[#005931]" />
              إدارة العميل
            </SheetTitle>
            <SheetDescription>
              {customer?.customer.name || "ملف العميل"}
              {customer?.loyalty.membership_number ? ` · ${customer.loyalty.membership_number}` : ""}
            </SheetDescription>
          </SheetHeader>

          {customer?.customer.phone && (
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="outline" asChild>
                <a href={`tel:${customer.customer.phone}`}><Phone className="ml-2 h-4 w-4" />اتصال</a>
              </Button>
              <Button
                variant="outline"
                onClick={() => whatsappPhone && window.open(`https://wa.me/${whatsappPhone}`, "_blank", "noopener,noreferrer")}
              >
                <MessageCircle className="ml-2 h-4 w-4" />WhatsApp
              </Button>
            </div>
          )}

          {workspaceQuery.isLoading ? (
            <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#005931]" /></div>
          ) : workspaceQuery.isError || !workspace ? (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <div className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" />تعذر فتح أدوات إدارة العميل</div>
              <p className="mt-1">{(workspaceQuery.error as Error)?.message || "تحقق من الصلاحيات وحاول مرة أخرى."}</p>
            </div>
          ) : (
            <Tabs defaultValue="manage" className="mt-5 space-y-4">
              <TabsList className="grid h-auto w-full grid-cols-4 rounded-2xl bg-slate-100 p-1">
                <TabsTrigger value="manage">إدارة</TabsTrigger>
                <TabsTrigger value="notes">ملاحظات</TabsTrigger>
                <TabsTrigger value="points">النقاط</TabsTrigger>
                <TabsTrigger value="audit">السجل</TabsTrigger>
              </TabsList>

              <TabsContent value="manage" className="space-y-4">
                <section className="rounded-2xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-black">حالة العميل</div>
                      <div className="mt-1 text-xs text-muted-foreground">حالة إدارية مستقلة عن تصنيف العميل التلقائي.</div>
                    </div>
                    <Badge variant="outline" className={workspace.management_status === "blocked" ? "border-red-200 bg-red-50 text-red-700" : workspace.management_status === "watch" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                      {statusLabel[workspace.management_status] || workspace.management_status}
                    </Badge>
                  </div>

                  {workspace.permissions.can_manage && (
                    <div className="mt-4 space-y-3">
                      <Select value={nextStatus} onValueChange={(value) => setNextStatus(value as "active" | "watch" | "blocked") }>
                        <SelectTrigger><SelectValue placeholder="اختر الحالة" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">نشط</SelectItem>
                          <SelectItem value="watch">تحت المتابعة</SelectItem>
                          <SelectItem value="blocked">موقوف</SelectItem>
                        </SelectContent>
                      </Select>
                      <Textarea value={statusReason} onChange={(e) => setStatusReason(e.target.value)} placeholder="سبب تغيير الحالة..." />
                      <Button className="w-full" disabled={busy} onClick={changeStatus}>
                        <ShieldAlert className="ml-2 h-4 w-4" />حفظ الحالة
                      </Button>
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border p-4">
                  <div className="flex items-center gap-2 font-black"><Tag className="h-4 w-4 text-[#005931]" />التصنيفات اليدوية</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {workspace.tags.length === 0 && <span className="text-xs text-muted-foreground">لا توجد تصنيفات يدوية.</span>}
                    {workspace.tags.map((tag) => (
                      <Badge key={tag.id} variant="secondary" className="gap-1 rounded-full px-3 py-1.5">
                        {tag.name}
                        {workspace.permissions.can_manage && (
                          <button
                            type="button"
                            className="mr-1 rounded-full p-0.5 hover:bg-black/10"
                            disabled={busy}
                            onClick={() => void run(() => setCustomerManagementTag(customerId, tag.name, false, currentBranchId || null), "تمت إزالة التصنيف.")}
                            aria-label={`إزالة ${tag.name}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </Badge>
                    ))}
                  </div>
                  {workspace.permissions.can_manage && (
                    <div className="mt-4 flex gap-2">
                      <Input value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="مثال: VIP أو عميل جملة" onKeyDown={(e) => e.key === "Enter" && addTag()} />
                      <Button size="icon" disabled={busy} onClick={addTag}><Plus className="h-4 w-4" /></Button>
                    </div>
                  )}
                </section>
              </TabsContent>

              <TabsContent value="notes" className="space-y-4">
                {workspace.permissions.can_manage && (
                  <section className="rounded-2xl border p-4">
                    <div className="flex items-center gap-2 font-black"><MessageSquarePlus className="h-4 w-4 text-[#005931]" />ملاحظة داخلية جديدة</div>
                    <div className="mt-4 space-y-3">
                      <Input value={noteSubject} onChange={(e) => setNoteSubject(e.target.value)} placeholder="عنوان الملاحظة" />
                      <Textarea value={noteDescription} onChange={(e) => setNoteDescription(e.target.value)} placeholder="تفاصيل الملاحظة..." className="min-h-24" />
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <Select value={notePriority} onValueChange={(value) => setNotePriority(value as "low" | "medium" | "high") }>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">عادية</SelectItem>
                            <SelectItem value="medium">متوسطة</SelectItem>
                            <SelectItem value="high">مهمة</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button disabled={busy} onClick={addNote}>حفظ الملاحظة</Button>
                      </div>
                    </div>
                  </section>
                )}

                <section className="space-y-2">
                  {workspace.interactions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد ملاحظات أو متابعات.</div>
                  ) : workspace.interactions.map((item) => (
                    <div key={item.id} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div><div className="font-bold">{item.subject}</div><div className="mt-1 text-xs text-muted-foreground">{formatDate(item.created_at)}</div></div>
                        <Badge variant="outline">{priorityLabel[item.priority] || item.priority}</Badge>
                      </div>
                      {item.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.description}</p>}
                    </div>
                  ))}
                </section>
              </TabsContent>

              <TabsContent value="points" className="space-y-4">
                <section className="rounded-2xl bg-[#005931] p-4 text-white">
                  <div className="text-xs text-emerald-100">الرصيد الحالي</div>
                  <div className="mt-1 text-3xl font-black">{formatNumber(customer?.loyalty.points_balance)} نقطة</div>
                  <div className="mt-1 text-xs text-emerald-100">كل تعديل يدوي بيتسجل في Ledger وAudit باسم الموظف والسبب.</div>
                </section>

                {workspace.permissions.can_adjust_points ? (
                  <section className="rounded-2xl border p-4">
                    <div className="flex items-center gap-2 font-black"><Gift className="h-4 w-4 text-[#005931]" />تعديل نقاط الولاء</div>
                    <div className="mt-4 space-y-3">
                      <div>
                        <Label>عدد النقاط</Label>
                        <Input className="mt-1" type="number" step="1" value={pointsDelta} onChange={(e) => setPointsDelta(e.target.value)} placeholder="مثال: 500 أو -500" />
                        <p className="mt-1 text-[11px] text-muted-foreground">رقم موجب للإضافة، ورقم سالب للخصم.</p>
                      </div>
                      <div>
                        <Label>السبب</Label>
                        <Textarea className="mt-1" value={pointsReason} onChange={(e) => setPointsReason(e.target.value)} placeholder="مثال: تعويض عميل عن مشكلة في الطلب" />
                      </div>
                      <Button className="w-full" disabled={busy} onClick={adjustPoints}>
                        {busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                        تنفيذ تعديل النقاط
                      </Button>
                    </div>
                  </section>
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">ليس لديك صلاحية تعديل نقاط الولاء.</div>
                )}
              </TabsContent>

              <TabsContent value="audit" className="space-y-2">
                <div className="mb-3 flex items-center gap-2 text-sm font-black"><History className="h-4 w-4 text-[#005931]" />آخر الإجراءات الإدارية</div>
                {workspace.audit.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد إجراءات إدارية مسجلة بعد.</div>
                ) : workspace.audit.map((item) => (
                  <div key={item.id} className="rounded-2xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-bold">{auditLabel[item.action_type] || item.action_type}</div>
                      <div className="text-[11px] text-muted-foreground">{formatDate(item.created_at)}</div>
                    </div>
                    {item.metadata && Object.keys(item.metadata).length > 0 && (
                      <div className="mt-2 rounded-xl bg-slate-50 p-2 text-xs text-muted-foreground">
                        {typeof item.metadata.reason === "string" && <div>السبب: {item.metadata.reason}</div>}
                        {typeof item.metadata.tag === "string" && <div>التصنيف: {item.metadata.tag}</div>}
                        {typeof item.metadata.points_delta === "number" && <div>النقاط: {item.metadata.points_delta > 0 ? "+" : ""}{formatNumber(item.metadata.points_delta)}</div>}
                        {typeof item.metadata.to === "string" && <div>الحالة الجديدة: {statusLabel[item.metadata.to] || item.metadata.to}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
