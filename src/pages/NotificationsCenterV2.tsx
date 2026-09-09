import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BellRing,
  Check,
  CheckCheck,
  ChevronLeft,
  CircleAlert,
  Clock3,
  Filter,
  Inbox,
  Loader2,
  PackageX,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import NotificationCampaignComposer from "@/components/notifications/NotificationCampaignComposer";
import NotificationCampaignHistory from "@/components/notifications/NotificationCampaignHistory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranchStore } from "@/stores/branchStore";
import {
  fetchNotificationCenterV2,
  markAllNotificationsReadV2,
  markNotificationReadV2,
  type NotificationCenterItemV2,
  type NotificationFilterV2,
  type NotificationSeverityV2,
} from "@/services/supabase/notificationCenterV2Service";

const filters: Array<{ value: NotificationFilterV2; label: string }> = [
  { value: "all", label: "الكل" },
  { value: "unread", label: "غير مقروء" },
  { value: "critical", label: "عاجل" },
  { value: "action", label: "يحتاج إجراء" },
];

const categories = [
  { value: "all", label: "كل الأقسام" },
  { value: "inventory", label: "المخزون" },
  { value: "inventory_transfers", label: "تحويلات المخزون" },
  { value: "tasks", label: "المهام" },
  { value: "orders", label: "الطلبات" },
  { value: "returns", label: "المرتجعات" },
  { value: "finance", label: "المالية" },
  { value: "customers", label: "العملاء" },
  { value: "loyalty", label: "الولاء" },
  { value: "marketing", label: "العروض والتسويق" },
];

const categoryLabels: Record<string, string> = Object.fromEntries(categories.filter(x => x.value !== "all").map(x => [x.value, x.label]));

function severityCopy(severity: NotificationSeverityV2) {
  if (severity === "critical") return { label: "عاجل", className: "border-red-200 bg-red-50 text-red-700", iconClass: "bg-red-100 text-red-700" };
  if (severity === "high") return { label: "مهم", className: "border-amber-200 bg-amber-50 text-amber-700", iconClass: "bg-amber-100 text-amber-700" };
  if (severity === "info") return { label: "معلومة", className: "border-blue-200 bg-blue-50 text-blue-700", iconClass: "bg-blue-100 text-blue-700" };
  return { label: "عادي", className: "border-slate-200 bg-slate-50 text-slate-700", iconClass: "bg-slate-100 text-slate-700" };
}

function categoryIcon(item: NotificationCenterItemV2) {
  if (item.category === "inventory") return PackageX;
  if (item.category === "inventory_transfers") return Truck;
  if (item.category === "finance") return WalletCards;
  if (item.category === "customers" || item.category === "loyalty") return Users;
  if (item.category === "marketing") return Sparkles;
  if (item.category === "orders") return Smartphone;
  if (item.requires_action) return CircleAlert;
  return BellRing;
}

function relativeTime(value?: string | null) {
  if (!value) return "الآن";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "الآن";
  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (diffMinutes < 1) return "الآن";
  if (diffMinutes < 60) return `منذ ${diffMinutes.toLocaleString("ar-EG")} د`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `منذ ${hours.toLocaleString("ar-EG")} س`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `منذ ${days.toLocaleString("ar-EG")} يوم`;
  return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" }).format(date);
}

function channelLabel(channel: string) {
  if (channel === "whatsapp") return "واتساب";
  if (channel === "push") return "Push";
  if (channel === "email") return "بريد";
  return "داخل النظام";
}

function StatCard({ title, value, helper, icon: Icon, tone }: { title: string; value: number; helper: string; icon: any; tone: "green" | "red" | "amber" | "slate" }) {
  const toneClass = tone === "red" ? "bg-red-50 text-red-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "green" ? "bg-emerald-50 text-[#005931]" : "bg-slate-100 text-slate-700";
  return (
    <Card className="overflow-hidden border-slate-200/80 shadow-sm">
      <CardContent className="flex items-center gap-4 p-4 md:p-5">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${toneClass}`}><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <div className="text-2xl font-black tabular-nums">{value.toLocaleString("ar-EG")}</div>
          <div className="text-sm font-bold text-slate-900">{title}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{helper}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function NotificationsCenterV2() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [filter, setFilter] = useState<NotificationFilterV2>("all");
  const [category, setCategory] = useState("all");

  const queryKey = ["notification-center-v2", currentBranchId, filter, category];
  const query = useQuery({
    queryKey,
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchNotificationCenterV2(currentBranchId, filter, category === "all" ? null : category, 250),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
    retry: false,
  });

  const markRead = useMutation({
    mutationFn: markNotificationReadV2,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-center-v2"] }),
    onError: () => toast.error("تعذر تحديث حالة الإشعار"),
  });

  const markAll = useMutation({
    mutationFn: () => markAllNotificationsReadV2(currentBranchId),
    onSuccess: count => {
      queryClient.invalidateQueries({ queryKey: ["notification-center-v2"] });
      toast.success(count > 0 ? `تم تحديد ${count.toLocaleString("ar-EG")} إشعار كمقروء` : "لا توجد إشعارات جديدة");
    },
    onError: () => toast.error("تعذر تحديد الإشعارات كمقروءة"),
  });

  const items = query.data?.items || [];
  const summary = query.data?.summary || { total: 0, unread: 0, critical: 0, action_required: 0, today: 0 };

  const sourceBreakdown = useMemo(() => {
    const active = items.filter(item => item.status === "active");
    return {
      inventory: active.filter(item => item.category === "inventory").length,
      transfers: active.filter(item => item.category === "inventory_transfers").length,
      tasks: active.filter(item => item.source_kind === "operations_task").length,
    };
  }, [items]);

  const handleOpen = async (item: NotificationCenterItemV2) => {
    if (!item.read_at) markRead.mutate(item.id);
    if (item.action_url) navigate(item.action_url);
  };

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-[1500px] space-y-5 p-3 pb-10 md:p-6">
        <section className="relative overflow-hidden rounded-[28px] bg-[#005931] p-5 text-white shadow-[0_18px_50px_rgba(0,89,49,.22)] md:p-7">
          <div className="absolute -left-16 -top-20 h-56 w-56 rounded-full bg-white/5" />
          <div className="absolute -bottom-20 right-1/3 h-44 w-44 rounded-full bg-emerald-300/10" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm text-emerald-100"><BellRing className="h-4 w-4" /> مركز التشغيل والتنبيهات</div>
              <h1 className="text-2xl font-black md:text-3xl">مركز الإشعارات</h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-emerald-50/90">كل تنبيهات الفرع والمهام والحالات الحرجة في مكان واحد، مع إجراءات مباشرة ومصدر موحّد على السيرفر.</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-white/10 px-3 py-1.5">{currentBranchName || "الفرع الحالي"}</span>
                <span className="rounded-full bg-white/10 px-3 py-1.5"><Smartphone className="ml-1 inline h-3.5 w-3.5" /> In‑App جاهز</span>
                <span className="rounded-full bg-white/10 px-3 py-1.5"><BellRing className="ml-1 inline h-3.5 w-3.5" /> Push جاهز معماريًا</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <NotificationCampaignComposer onSent={() => void query.refetch()} />
              <Button variant="secondary" className="rounded-xl" onClick={() => void query.refetch()} disabled={query.isFetching}>
                {query.isFetching ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <RefreshCw className="ml-2 h-4 w-4" />} تحديث الآن
              </Button>
              <Button className="rounded-xl bg-white text-[#005931] hover:bg-emerald-50" onClick={() => markAll.mutate()} disabled={markAll.isPending || summary.unread === 0}>
                <CheckCheck className="ml-2 h-4 w-4" /> قراءة الكل
              </Button>
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="غير مقروء" value={summary.unread} helper="يحتاج مراجعتك" icon={Inbox} tone="green" />
          <StatCard title="عاجل" value={summary.critical} helper="أولوية فورية" icon={ShieldAlert} tone="red" />
          <StatCard title="يحتاج إجراء" value={summary.action_required} helper="مرتبط بخطوة تشغيلية" icon={CircleAlert} tone="amber" />
          <StatCard title="اليوم" value={summary.today} helper={`إجمالي ${summary.total.toLocaleString("ar-EG")}`} icon={Clock3} tone="slate" />
        </div>

        {(sourceBreakdown.inventory > 0 || sourceBreakdown.transfers > 0 || sourceBreakdown.tasks > 0) && (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-red-100 bg-red-50/70 px-4 py-3 text-sm"><span className="font-black text-red-700">{sourceBreakdown.inventory.toLocaleString("ar-EG")}</span><span className="mr-2 font-semibold text-red-900">تنبيه مخزون ظاهر في القائمة الحالية</span></div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm"><span className="font-black text-amber-700">{sourceBreakdown.transfers.toLocaleString("ar-EG")}</span><span className="mr-2 font-semibold text-amber-900">تنبيه تحويل مخزون</span></div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm"><span className="font-black text-[#005931]">{sourceBreakdown.tasks.toLocaleString("ar-EG")}</span><span className="mr-2 font-semibold text-emerald-900">مهمة قابلة للتنفيذ</span></div>
          </div>
        )}

        <NotificationCampaignHistory branchId={currentBranchId || null} />

        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {filters.map(item => (
                  <Button key={item.value} size="sm" variant={filter === item.value ? "default" : "outline"} className={filter === item.value ? "bg-[#005931] hover:bg-[#004526]" : ""} onClick={() => setFilter(item.value)}>
                    {item.label}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {query.isLoading ? (
          <div className="flex min-h-[340px] items-center justify-center rounded-3xl border bg-white"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-[#005931]" /><p className="mt-3 text-sm text-muted-foreground">جاري مزامنة التنبيهات...</p></div></div>
        ) : query.isError ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-red-600" /><h3 className="mt-3 font-black text-red-900">تعذر تحميل مركز الإشعارات</h3><p className="mt-1 text-sm text-red-700">تحقق من صلاحيات الفرع ثم حاول مرة أخرى.</p><Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>إعادة المحاولة</Button></div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-dashed bg-white p-12 text-center"><Check className="mx-auto h-10 w-10 text-emerald-600" /><h3 className="mt-4 text-lg font-black">مفيش إشعارات في الفلتر ده</h3><p className="mt-1 text-sm text-muted-foreground">كل شيء هادئ حاليًا، أو غيّر الفلتر لعرض السجل.</p></div>
        ) : (
          <div className="space-y-3">
            {items.map(item => {
              const sev = severityCopy(item.severity);
              const Icon = categoryIcon(item);
              const unread = !item.read_at;
              const resolved = item.status === "resolved";
              return (
                <article key={item.id} className={`group overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${unread && !resolved ? "border-emerald-200 ring-1 ring-emerald-50" : "border-slate-200/80"} ${resolved ? "opacity-70" : ""}`}>
                  <div className="flex gap-3 p-4 md:gap-4 md:p-5">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${sev.iconClass}`}><Icon className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-black leading-6 text-slate-950">{item.title}</h3>
                            {unread && !resolved && <span className="h-2 w-2 rounded-full bg-[#005931]" />}
                            <Badge variant="outline" className={sev.className}>{sev.label}</Badge>
                            <Badge variant="secondary">{categoryLabels[item.category] || item.category}</Badge>
                            {resolved && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">تم الحل</Badge>}
                          </div>
                          <p className="mt-1.5 max-w-4xl text-sm leading-7 text-slate-600">{item.body}</p>
                        </div>
                        <div className="shrink-0 text-xs text-muted-foreground">{relativeTime(item.updated_at || item.created_at)}</div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.eligible_channels.map(channel => (
                            <span key={channel} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{channelLabel(channel)}</span>
                          ))}
                          {item.requires_action && <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">يحتاج إجراء</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {unread && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => markRead.mutate(item.id)} disabled={markRead.isPending}><Check className="ml-1 h-3.5 w-3.5" /> مقروء</Button>}
                          {item.action_url && <Button size="sm" className="h-8 bg-[#005931] text-xs hover:bg-[#004526]" onClick={() => void handleOpen(item)}>{item.action_label || "فتح التفاصيل"}<ChevronLeft className="mr-1 h-3.5 w-3.5" /></Button>}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <section className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2 font-black"><Smartphone className="h-4 w-4 text-[#005931]" /> داخل النظام</div><p className="mt-2 text-xs leading-6 text-muted-foreground">المصدر الأساسي للتنبيهات، مع حالة قراءة محفوظة على السيرفر بدل المتصفح.</p></div>
          <div className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2 font-black"><BellRing className="h-4 w-4 text-emerald-600" /> Push Notifications</div><p className="mt-2 text-xs leading-6 text-muted-foreground">الأحداث المؤهلة تدخل Queue مركزية، وتُرسل للأجهزة المسجلة فقط مع احترام تفضيلات العميل وساعات الهدوء.</p></div>
          <div className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2 font-black"><Sparkles className="h-4 w-4 text-amber-600" /> تصعيد ذكي</div><p className="mt-2 text-xs leading-6 text-muted-foreground">التنبيهات المرتبطة بمهام تظهر فقط للموظف صاحب المهمة أو من لديه صلاحية استلامها.</p></div>
        </section>
      </div>
    </MainLayout>
  );
}