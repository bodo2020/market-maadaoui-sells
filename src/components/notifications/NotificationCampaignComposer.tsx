import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Check, CheckCircle2, Loader2, Megaphone, Search, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { UserRole } from "@/types";
import {
  canSendNotificationsV2,
  getNotificationRecipientOptionsV3,
  previewNotificationTargetV3,
  sendNotificationCampaignV3,
  type NotificationRecipientOptionV3,
  type NotificationTargetTypeV3,
  type NotificationTargetV3,
} from "@/services/supabase/notificationCampaignV2Service";

interface Props {
  onSent?: () => void;
}

const severityOptions = [
  { value: "normal", label: "عادي" },
  { value: "high", label: "مهم" },
  { value: "critical", label: "عاجل" },
  { value: "info", label: "معلومة" },
] as const;

const categoryOptions = [
  { value: "system", label: "عام" },
  { value: "tasks", label: "المهام" },
  { value: "inventory", label: "المخزون" },
  { value: "inventory_transfers", label: "تحويلات المخزون" },
  { value: "orders", label: "الطلبات" },
  { value: "customers", label: "العملاء" },
  { value: "marketing", label: "العروض والتسويق" },
] as const;

const roleLabel = (role?: string | null) => {
  const labels: Record<string, string> = {
    super_admin: "مدير النظام",
    admin: "إدارة",
    branch_manager: "مدير فرع",
    cashier: "كاشير",
    delivery: "توصيل",
    employee: "موظف",
  };
  return role ? labels[role] || role : "موظف";
};

const targetLabel = (type: NotificationTargetTypeV3) => {
  if (type === "staff_branch") return "كل موظفي الفرع";
  if (type === "staff_roles") return "حسب الوظيفة";
  if (type === "staff_selected") return "موظفون محددون";
  if (type === "customers_selected") return "عملاء محددون";
  return "كل عملاء التطبيق";
};

export default function NotificationCampaignComposer({ onSent }: Props) {
  const { user } = useAuth();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [targetType, setTargetType] = useState<NotificationTargetTypeV3>("staff_branch");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<"critical" | "high" | "normal" | "info">("normal");
  const [category, setCategory] = useState("system");
  const [actionUrl, setActionUrl] = useState("");
  const [actionLabel, setActionLabel] = useState("");

  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isCustomerTarget = targetType.startsWith("customers_");
  const needsStaffOptions = targetType === "staff_roles" || targetType === "staff_selected";
  const needsCustomerOptions = targetType === "customers_selected";

  const permissionQuery = useQuery({
    queryKey: ["notification-campaign-permission-v2", currentBranchId],
    enabled: Boolean(user?.id && currentBranchId),
    queryFn: () => canSendNotificationsV2(currentBranchId),
    staleTime: 60_000,
    retry: false,
  });

  const optionsQuery = useQuery({
    queryKey: ["notification-recipient-options-v3", targetType, currentBranchId, targetType === "staff_roles" ? "" : recipientSearch],
    enabled: open && permissionQuery.data === true && Boolean(currentBranchId) && (needsStaffOptions || needsCustomerOptions),
    queryFn: () => getNotificationRecipientOptionsV3(
      needsCustomerOptions ? "customers" : "staff",
      currentBranchId,
      targetType === "staff_roles" ? undefined : recipientSearch,
    ),
    staleTime: 5_000,
    retry: false,
  });

  useEffect(() => {
    if (!isSuperAdmin && isCustomerTarget) setTargetType("staff_branch");
  }, [isCustomerTarget, isSuperAdmin]);

  const target = useMemo<NotificationTargetV3>(() => {
    if (targetType === "staff_roles") return { type: "staff_roles", roles: selectedRoles };
    if (targetType === "staff_selected") return { type: "staff_selected", user_ids: selectedStaffIds };
    if (targetType === "customers_selected") return { type: "customers_selected", customer_ids: selectedCustomerIds };
    if (targetType === "customers_all") return { type: "customers_all" };
    return { type: "staff_branch" };
  }, [selectedCustomerIds, selectedRoles, selectedStaffIds, targetType]);

  const targetReady = targetType === "staff_roles"
    ? selectedRoles.length > 0
    : targetType === "staff_selected"
      ? selectedStaffIds.length > 0
      : targetType === "customers_selected"
        ? selectedCustomerIds.length > 0
        : true;

  const previewQuery = useQuery({
    queryKey: ["notification-target-preview-v3", target, currentBranchId],
    enabled: open && permissionQuery.data === true && Boolean(currentBranchId) && targetReady,
    queryFn: () => previewNotificationTargetV3(target, currentBranchId),
    staleTime: 4_000,
    retry: false,
  });

  const staffOptions = useMemo(
    () => (optionsQuery.data || []).filter(item => item.kind === "staff"),
    [optionsQuery.data],
  );
  const customerOptions = useMemo(
    () => (optionsQuery.data || []).filter(item => item.kind === "customer"),
    [optionsQuery.data],
  );
  const roles = useMemo(() => {
    const counts = new Map<string, number>();
    staffOptions.forEach(item => {
      if (!item.role) return;
      counts.set(item.role, (counts.get(item.role) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => roleLabel(a[0]).localeCompare(roleLabel(b[0]), "ar"));
  }, [staffOptions]);

  const changeTarget = (next: NotificationTargetTypeV3) => {
    setTargetType(next);
    setRecipientSearch("");
    setSelectedRoles([]);
    setSelectedStaffIds([]);
    setSelectedCustomerIds([]);
    if (next.startsWith("customers_")) {
      setCategory("marketing");
      setSeverity("info");
    } else {
      setCategory("system");
      setSeverity("normal");
    }
  };

  const toggleValue = (value: string, current: string[], setter: (next: string[]) => void) => {
    setter(current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
  };

  const validation = useMemo(() => {
    if (!targetReady) {
      if (targetType === "staff_roles") return "اختر وظيفة واحدة على الأقل";
      if (targetType === "staff_selected") return "اختر موظفًا واحدًا على الأقل";
      if (targetType === "customers_selected") return "اختر عميلًا واحدًا على الأقل";
    }
    if (!title.trim()) return "اكتب عنوان الإشعار";
    if (title.trim().length > 120) return "العنوان بحد أقصى 120 حرف";
    if (!body.trim()) return "اكتب نص الإشعار";
    if (body.trim().length > 1000) return "النص بحد أقصى 1000 حرف";
    if (actionUrl.trim() && !actionUrl.trim().startsWith("/")) return "رابط الإجراء داخل التطبيق لازم يبدأ بـ /";
    if (previewQuery.isFetching) return "جاري حساب المستلمين...";
    if (targetReady && !previewQuery.isError && (previewQuery.data?.in_app_eligible || 0) <= 0) return "لا يوجد مستلمون متاحون لهذا الاختيار";
    return null;
  }, [actionUrl, body, previewQuery.data?.in_app_eligible, previewQuery.isError, previewQuery.isFetching, targetReady, targetType, title]);

  const resetComposer = () => {
    setTitle("");
    setBody("");
    setActionUrl("");
    setActionLabel("");
    setSeverity("normal");
    setCategory("system");
    setTargetType("staff_branch");
    setSelectedRoles([]);
    setSelectedStaffIds([]);
    setSelectedCustomerIds([]);
    setRecipientSearch("");
  };

  const sendMutation = useMutation({
    mutationFn: () => sendNotificationCampaignV3({
      target,
      branchId: currentBranchId,
      title: title.trim(),
      body: body.trim(),
      category,
      severity,
      actionUrl: actionUrl.trim() || null,
      actionLabel: actionLabel.trim() || null,
    }),
    onSuccess: result => {
      void queryClient.invalidateQueries({ queryKey: ["notification-center-v2"] });
      void queryClient.invalidateQueries({ queryKey: ["notification-target-preview-v3"] });
      toast.success("تم إرسال الإشعار داخل التطبيق", {
        description: `تم إنشاء ${result.in_app_created.toLocaleString("ar-EG")} إشعار من أصل ${result.recipient_count.toLocaleString("ar-EG")} مستلم.`,
      });
      setOpen(false);
      resetComposer();
      onSent?.();
    },
    onError: (error: any) => toast.error("تعذر إرسال الإشعار", {
      description: String(error?.message || "راجع الصلاحيات والبيانات وحاول مرة أخرى.").replace("NO_NOTIFICATION_RECIPIENTS", "لا يوجد مستلمون متاحون لهذا الاختيار"),
    }),
  });

  if (permissionQuery.isLoading || permissionQuery.data !== true) return null;

  const preview = previewQuery.data;

  const renderSelectableRecipients = (items: NotificationRecipientOptionV3[], selected: string[], customerMode: boolean) => (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={recipientSearch}
          onChange={event => setRecipientSearch(event.target.value)}
          className="pr-9"
          placeholder={customerMode ? "ابحث باسم العميل أو رقم الهاتف" : "ابحث باسم الموظف أو الهاتف"}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>المحدد: {selected.length.toLocaleString("ar-EG")}</span>
        {selected.length > 0 && (
          <button
            type="button"
            className="font-semibold text-red-600 hover:underline"
            onClick={() => customerMode ? setSelectedCustomerIds([]) : setSelectedStaffIds([])}
          >
            مسح الاختيار
          </button>
        )}
      </div>
      <div className="max-h-52 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1">
        {optionsQuery.isFetching ? (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> جاري تحميل المستلمين...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">لا توجد نتائج</div>
        ) : items.map(item => {
          const value = item.id;
          const checked = selected.includes(value);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => customerMode
                ? toggleValue(value, selectedCustomerIds, setSelectedCustomerIds)
                : toggleValue(value, selectedStaffIds, setSelectedStaffIds)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right transition ${checked ? "bg-emerald-50" : "hover:bg-slate-50"}`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? "border-[#005931] bg-[#005931] text-white" : "border-slate-300"}`}>
                {checked && <Check className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{item.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {customerMode ? (item.phone || "عميل تطبيق") : `${roleLabel(item.role)}${item.phone ? ` · ${item.phone}` : ""}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-xl bg-white text-[#005931] hover:bg-emerald-50">
          <Megaphone className="ml-2 h-4 w-4" /> إرسال إشعار
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[92vh] max-w-2xl overflow-y-auto sm:rounded-[24px]">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-xl font-black">
            <BellRing className="h-5 w-5 text-[#005931]" /> إرسال إشعار جديد
          </DialogTitle>
          <DialogDescription className="text-right leading-6">
            اختر المستلمين بدقة ثم أرسل داخل التطبيق. الإشعار يظهر في الجرس ومركز الإشعارات ويُحفظ على حساب المستلم.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>الجمهور</Label>
            <Select value={targetType} onValueChange={value => changeTarget(value as NotificationTargetTypeV3)}>
              <SelectTrigger className="min-h-12 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="staff_branch">كل موظفي الفرع</SelectItem>
                <SelectItem value="staff_roles">موظفون حسب الوظيفة</SelectItem>
                <SelectItem value="staff_selected">موظفون محددون</SelectItem>
                {isSuperAdmin && <SelectItem value="customers_all">كل عملاء التطبيق</SelectItem>}
                {isSuperAdmin && <SelectItem value="customers_selected">عملاء محددون</SelectItem>}
              </SelectContent>
            </Select>
            <p className="text-[11px] leading-5 text-muted-foreground">
              {isCustomerTarget
                ? "كل عميل لديه حساب داخل التطبيق مؤهل للاستلام، بدون استبعاد حسب حالة CRM."
                : `الاستهداف داخل ${currentBranchName || "الفرع الحالي"}.`}
            </p>
          </div>

          {targetType === "staff_roles" && (
            <div className="space-y-2">
              <Label>الوظائف المستهدفة</Label>
              {optionsQuery.isFetching ? (
                <div className="flex items-center gap-2 rounded-2xl border p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> جاري تحميل وظائف الفرع...</div>
              ) : roles.length === 0 ? (
                <div className="rounded-2xl border p-4 text-sm text-muted-foreground">لا توجد وظائف متاحة في الفرع الحالي.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {roles.map(([role, count]) => {
                    const checked = selectedRoles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => toggleValue(role, selectedRoles, setSelectedRoles)}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${checked ? "border-[#005931] bg-emerald-50 text-[#005931]" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                      >
                        {checked && <Check className="ml-1 inline h-3.5 w-3.5" />}{roleLabel(role)} · {count.toLocaleString("ar-EG")}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {targetType === "staff_selected" && renderSelectableRecipients(staffOptions, selectedStaffIds, false)}
          {targetType === "customers_selected" && renderSelectableRecipients(customerOptions, selectedCustomerIds, true)}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            {!targetReady ? (
              <div className="text-sm text-muted-foreground">اختر المستلمين أولًا لعرض المعاينة.</div>
            ) : previewQuery.isFetching ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> جاري حساب المستلمين...</div>
            ) : previewQuery.isError ? (
              <div className="text-sm text-red-700">تعذر حساب الجمهور المتاح.</div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xl font-black">{(preview?.total || 0).toLocaleString("ar-EG")}</div>
                  <div className="text-[11px] text-muted-foreground">{preview?.label || targetLabel(targetType)}</div>
                </div>
                <div>
                  <div className="text-xl font-black text-[#005931]">{(preview?.in_app_eligible || 0).toLocaleString("ar-EG")}</div>
                  <div className="text-[11px] text-muted-foreground">جاهزون داخل التطبيق</div>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="notification-category">القسم</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="notification-category"><SelectValue /></SelectTrigger>
                <SelectContent>{categoryOptions.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notification-severity">الأولوية</Label>
              <Select value={severity} onValueChange={(value: any) => setSeverity(value)}>
                <SelectTrigger id="notification-severity"><SelectValue /></SelectTrigger>
                <SelectContent>{severityOptions.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notification-title">العنوان</Label>
            <Input id="notification-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={120} placeholder={isCustomerTarget ? "مثال: عرض جديد في المعداوي ماركت 🎉" : "مثال: اجتماع فريق الفرع الساعة 4"} />
            <div className="text-left text-[10px] text-muted-foreground">{title.length.toLocaleString("ar-EG")}/120</div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notification-body">نص الإشعار</Label>
            <Textarea id="notification-body" value={body} onChange={event => setBody(event.target.value)} maxLength={1000} rows={5} placeholder="اكتب رسالة واضحة ومختصرة للمستلمين..." />
            <div className="text-left text-[10px] text-muted-foreground">{body.length.toLocaleString("ar-EG")}/1000</div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="notification-action-url">رابط الإجراء داخل التطبيق (اختياري)</Label><Input id="notification-action-url" dir="ltr" value={actionUrl} onChange={event => setActionUrl(event.target.value)} placeholder={isCustomerTarget ? "/offers" : "/tasks"} /></div>
            <div className="space-y-2"><Label htmlFor="notification-action-label">اسم الزر (اختياري)</Label><Input id="notification-action-label" value={actionLabel} onChange={event => setActionLabel(event.target.value)} placeholder="فتح التفاصيل" /></div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 font-black text-[#005931]"><CheckCircle2 className="h-4 w-4" /> داخل التطبيق — القناة الأساسية</div>
            <div className="mt-1 text-xs leading-5 text-emerald-900/70">الإرسال لا يعتمد على Firebase أو Push. عملاء التطبيق يستخدمون مسار توافق مزدوج لضمان ظهور الرسالة في النسخ الجديدة والمخزنة.</div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={Boolean(validation) || sendMutation.isPending}
            className="min-w-36 bg-[#005931] hover:bg-[#004728]"
          >
            {sendMutation.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Send className="ml-2 h-4 w-4" />}
            إرسال داخل التطبيق
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sendMutation.isPending}>إلغاء</Button>
        </DialogFooter>
        {validation && <p className="text-xs text-muted-foreground">{validation}</p>}
      </DialogContent>
    </Dialog>
  );
}
