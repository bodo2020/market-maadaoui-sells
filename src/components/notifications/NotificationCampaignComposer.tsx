import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  CheckCircle2,
  Loader2,
  Megaphone,
  Send,
  Smartphone,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { UserRole } from "@/types";
import {
  canSendNotificationsV2,
  previewNotificationAudienceV2,
  sendNotificationCampaignV2,
  type NotificationCampaignAudienceV2,
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

export default function NotificationCampaignComposer({ onSent }: Props) {
  const { user } = useAuth();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState<NotificationCampaignAudienceV2>("staff_branch");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<"critical" | "high" | "normal" | "info">("normal");
  const [category, setCategory] = useState("system");
  const [actionUrl, setActionUrl] = useState("");
  const [actionLabel, setActionLabel] = useState("");
  const [sendPush, setSendPush] = useState(false);

  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;

  const permissionQuery = useQuery({
    queryKey: ["notification-campaign-permission-v2", currentBranchId],
    enabled: Boolean(user?.id && currentBranchId),
    queryFn: () => canSendNotificationsV2(currentBranchId),
    staleTime: 60_000,
    retry: false,
  });

  const previewQuery = useQuery({
    queryKey: ["notification-campaign-preview-v2", audience, currentBranchId],
    enabled: open && permissionQuery.data === true && Boolean(currentBranchId),
    queryFn: () => previewNotificationAudienceV2(audience, currentBranchId),
    staleTime: 10_000,
    retry: false,
  });

  useEffect(() => {
    if (!isSuperAdmin && audience === "customers_all") setAudience("staff_branch");
  }, [audience, isSuperAdmin]);

  useEffect(() => {
    const preview = previewQuery.data;
    setSendPush(Boolean(preview?.push_sender_ready && preview.push_eligible > 0));
  }, [audience, previewQuery.data?.push_eligible, previewQuery.data?.push_sender_ready]);

  const validation = useMemo(() => {
    if (!title.trim()) return "اكتب عنوان الإشعار";
    if (title.trim().length > 120) return "العنوان بحد أقصى 120 حرف";
    if (!body.trim()) return "اكتب نص الإشعار";
    if (body.trim().length > 1000) return "النص بحد أقصى 1000 حرف";
    if ((previewQuery.data?.total || 0) <= 0) return "لا يوجد مستلمون متاحون لهذا الجمهور حاليًا";
    return null;
  }, [body, previewQuery.data?.total, title]);

  const sendMutation = useMutation({
    mutationFn: () => sendNotificationCampaignV2({
      audienceType: audience,
      branchId: currentBranchId,
      title: title.trim(),
      body: body.trim(),
      category,
      severity,
      actionUrl: actionUrl.trim() || null,
      actionLabel: actionLabel.trim() || null,
      channels: sendPush ? ["in_app", "push"] : ["in_app"],
      deliveryType: audience === "customers_all" ? "marketing" : "transactional",
    }),
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ["notification-center-v2"] });
      const pushPart = result.push_queued > 0
        ? ` وتم تجهيز ${result.push_queued.toLocaleString("ar-EG")} Push للإرسال.`
        : "";
      toast.success("تم إرسال الإشعار", {
        description: `تم إنشاء ${result.in_app_created.toLocaleString("ar-EG")} إشعار داخل النظام.${pushPart}`,
      });
      setOpen(false);
      setTitle("");
      setBody("");
      setActionUrl("");
      setActionLabel("");
      setSeverity("normal");
      setCategory("system");
      setAudience("staff_branch");
      setSendPush(false);
      onSent?.();
    },
    onError: (error: any) => toast.error("تعذر إرسال الإشعار", { description: error?.message || "راجع الصلاحيات والبيانات وحاول مرة أخرى." }),
  });

  if (permissionQuery.isLoading || permissionQuery.data !== true) return null;

  const preview = previewQuery.data;
  const pushAvailable = Boolean(preview?.push_sender_ready && preview.push_eligible > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-xl bg-white text-[#005931] hover:bg-emerald-50">
          <Megaphone className="ml-2 h-4 w-4" /> إرسال إشعار
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[92vh] max-w-2xl overflow-y-auto sm:rounded-[24px]">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-xl font-black"><BellRing className="h-5 w-5 text-[#005931]" /> إرسال إشعار جديد</DialogTitle>
          <DialogDescription className="text-right leading-6">الإشعار يظهر داخل مركز الإشعارات، ويمكن إرساله Push للأجهزة المسجلة عند تفعيل قناة Firebase.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>الجمهور</Label>
            <div className={`grid gap-2 ${isSuperAdmin ? "sm:grid-cols-2" : ""}`}>
              <button type="button" onClick={() => setAudience("staff_branch")} className={`rounded-2xl border p-4 text-right transition ${audience === "staff_branch" ? "border-[#005931] bg-emerald-50 ring-1 ring-[#005931]/10" : "border-slate-200 hover:bg-slate-50"}`}>
                <div className="flex items-center gap-2 font-black"><Users className="h-4 w-4" /> موظفو الفرع</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">كل الموظفين النشطين المرتبطين بـ {currentBranchName || "الفرع الحالي"}.</div>
              </button>
              {isSuperAdmin && (
                <button type="button" onClick={() => { setAudience("customers_all"); setCategory("marketing"); setSeverity("info"); }} className={`rounded-2xl border p-4 text-right transition ${audience === "customers_all" ? "border-[#005931] bg-emerald-50 ring-1 ring-[#005931]/10" : "border-slate-200 hover:bg-slate-50"}`}>
                  <div className="flex items-center gap-2 font-black"><Megaphone className="h-4 w-4" /> كل العملاء</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">Broadcast للعملاء النشطين. الـPush التسويقي يصل فقط لمن فعّل الإشعارات والتسويق.</div>
                </button>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            {previewQuery.isFetching ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> جاري حساب الجمهور...</div>
            ) : previewQuery.isError ? (
              <div className="text-sm text-red-700">تعذر حساب الجمهور المتاح.</div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div><div className="text-xl font-black">{(preview?.total || 0).toLocaleString("ar-EG")}</div><div className="text-[11px] text-muted-foreground">إجمالي الجمهور</div></div>
                <div><div className="text-xl font-black text-[#005931]">{(preview?.in_app_eligible || 0).toLocaleString("ar-EG")}</div><div className="text-[11px] text-muted-foreground">داخل النظام</div></div>
                <div><div className="text-xl font-black text-slate-700">{(preview?.push_eligible || 0).toLocaleString("ar-EG")}</div><div className="text-[11px] text-muted-foreground">أجهزة Push مؤهلة</div></div>
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
            <Input id="notification-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={120} placeholder={audience === "customers_all" ? "مثال: عرض نهاية الأسبوع 🎉" : "مثال: اجتماع فريق الفرع الساعة 4"} />
            <div className="text-left text-[10px] text-muted-foreground">{title.length.toLocaleString("ar-EG")}/120</div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notification-body">نص الإشعار</Label>
            <Textarea id="notification-body" value={body} onChange={event => setBody(event.target.value)} maxLength={1000} rows={5} placeholder="اكتب رسالة واضحة ومختصرة للمستلمين..." />
            <div className="text-left text-[10px] text-muted-foreground">{body.length.toLocaleString("ar-EG")}/1000</div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="notification-action-url">رابط الإجراء داخل النظام (اختياري)</Label><Input id="notification-action-url" dir="ltr" value={actionUrl} onChange={event => setActionUrl(event.target.value)} placeholder="/tasks" /></div>
            <div className="space-y-2"><Label htmlFor="notification-action-label">اسم الزر (اختياري)</Label><Input id="notification-action-label" value={actionLabel} onChange={event => setActionLabel(event.target.value)} placeholder="فتح التفاصيل" /></div>
          </div>

          <div className="space-y-2">
            <Label>قنوات الإرسال</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-center gap-2 font-black text-[#005931]"><CheckCircle2 className="h-4 w-4" /> داخل النظام</div>
                <div className="mt-1 text-[11px] leading-5 text-emerald-900/70">مفعّل دائمًا، ويحفظ حالة القراءة على السيرفر.</div>
              </div>
              <div className={`rounded-2xl border p-3 ${pushAvailable ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className={`flex items-center gap-2 font-black ${pushAvailable ? "text-[#005931]" : "text-slate-700"}`}><Smartphone className="h-4 w-4" /> Push Notification</div>
                    <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      {preview?.push_sender_ready
                        ? preview.push_eligible > 0 ? `${preview.push_eligible.toLocaleString("ar-EG")} جهاز جاهز للاستلام.` : "لا توجد أجهزة مسجلة لهذا الجمهور بعد."
                        : "قناة Firebase لم تُفعّل للإرسال بعد."}
                    </div>
                  </div>
                  <Switch checked={sendPush} onCheckedChange={setSendPush} disabled={!pushAvailable} aria-label="إرسال Push" />
                </div>
              </div>
            </div>
          </div>

          {audience === "customers_all" && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              <strong>حماية التسويق:</strong> الـPush الخاص بالعروض والسلة المتروكة لا يدخل Queue إلا للعميل الذي فعّل Push ووافق على الإشعارات التسويقية، مع احترام Quiet Hours.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sendMutation.isPending}>إلغاء</Button>
          <Button className="bg-[#005931] hover:bg-[#004526]" disabled={Boolean(validation) || sendMutation.isPending || previewQuery.isFetching} onClick={() => sendMutation.mutate()}>
            {sendMutation.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Send className="ml-2 h-4 w-4" />} إرسال الآن
          </Button>
        </DialogFooter>
        {validation && <p className="text-center text-xs text-muted-foreground">{validation}</p>}
      </DialogContent>
    </Dialog>
  );
}
