import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Layers3,
  Loader2,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  Users,
  X,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useBranchStore } from "@/stores/branchStore";
import { siteConfig } from "@/config/site";
import {
  cancelInventoryAuditSessionV2,
  createInventoryAuditSessionV2,
  fetchInventoryAuditDashboardV2,
  fetchInventoryAuditSetupV2,
  searchInventoryAuditProductsV2,
  type InventoryAuditProduct,
  type InventoryAuditScope,
  type InventoryAuditSession,
} from "@/services/supabase/inventoryAuditSessionsV2Service";

const formatNumber = (value: number | null | undefined) => Number(value || 0).toLocaleString("ar-EG");
const formatMoney = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ${siteConfig.currency}`;

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function localDateTimeAfter(hours: number) {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function kindLabel(kind: string) {
  if (kind === "daily") return "جرد يومي";
  if (kind === "full") return "جرد شامل";
  if (kind === "spot") return "Spot Check";
  return kind;
}

function scopeLabel(scope: string) {
  const labels: Record<string, string> = {
    weighted: "اختيار ذكي يومي",
    all: "كل المخزون",
    main_category: "قسم رئيسي",
    subcategory: "قسم فرعي",
    company: "شركة / علامة",
    shelf: "رف / موقع",
    custom: "منتجات محددة",
  };
  return labels[scope] || scope;
}

function statusBadge(status: string) {
  if (status === "active") return <Badge className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">نشطة</Badge>;
  if (status === "completed") return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">مكتملة</Badge>;
  if (status === "cancelled") return <Badge variant="outline" className="text-slate-500">ملغاة</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function sessionResolvedProgress(session: InventoryAuditSession) {
  if (!session.total_tasks) return 0;
  return Math.min(100, Math.round((Number(session.resolved_tasks || 0) / Number(session.total_tasks)) * 1000) / 10);
}

export default function DailyInventoryPage() {
  const navigate = useNavigate();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [fullOpen, setFullOpen] = useState(false);
  const [spotOpen, setSpotOpen] = useState(false);
  const [cancelSession, setCancelSession] = useState<InventoryAuditSession | null>(null);
  const [busy, setBusy] = useState(false);

  const [fullTitle, setFullTitle] = useState("");
  const [fullDescription, setFullDescription] = useState("");
  const [fullScope, setFullScope] = useState<InventoryAuditScope>("all");
  const [fullScopeValue, setFullScopeValue] = useState("");
  const [fullAssignee, setFullAssignee] = useState("auto");
  const [fullDueAt, setFullDueAt] = useState(() => localDateTimeAfter(24));

  const [spotTitle, setSpotTitle] = useState("");
  const [spotDescription, setSpotDescription] = useState("");
  const [spotAssignee, setSpotAssignee] = useState("auto");
  const [spotDueAt, setSpotDueAt] = useState(() => localDateTimeAfter(4));
  const [spotSearch, setSpotSearch] = useState("");
  const [spotSelected, setSpotSelected] = useState<InventoryAuditProduct[]>([]);
  const [cancelNote, setCancelNote] = useState("");

  const dashboardQuery = useQuery({
    queryKey: ["inventory-audit-dashboard-v2", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchInventoryAuditDashboardV2(currentBranchId as string, 50),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const canManage = Boolean(dashboardQuery.data?.permissions?.can_manage_sessions);
  const setupQuery = useQuery({
    queryKey: ["inventory-audit-setup-v2", currentBranchId],
    enabled: Boolean(currentBranchId && canManage),
    queryFn: () => fetchInventoryAuditSetupV2(currentBranchId as string),
    staleTime: 5 * 60_000,
  });

  const productSearchQuery = useQuery({
    queryKey: ["inventory-audit-product-search-v2", currentBranchId, spotSearch.trim()],
    enabled: Boolean(currentBranchId && canManage && spotOpen && spotSearch.trim().length >= 2),
    queryFn: () => searchInventoryAuditProductsV2(currentBranchId as string, spotSearch, 30),
    staleTime: 30_000,
  });

  const summary = dashboardQuery.data?.summary;
  const sessions = dashboardQuery.data?.sessions || [];
  const activeSessions = sessions.filter((session) => session.status === "active");
  const recentSessions = sessions.slice(0, 12);
  const variances = dashboardQuery.data?.open_variances || [];
  const staff = dashboardQuery.data?.staff_workload || [];
  const setup = setupQuery.data;

  const scopeOptions = useMemo(() => {
    if (!setup) return [] as Array<{ value: string; label: string; products: number }>;
    if (fullScope === "main_category") return setup.categories.map((item) => ({ value: item.id, label: item.name, products: item.products }));
    if (fullScope === "subcategory") return setup.subcategories.map((item) => ({ value: item.id, label: item.name, products: item.products }));
    if (fullScope === "company") return setup.companies.map((item) => ({ value: item.id, label: item.name, products: item.products }));
    if (fullScope === "shelf") return setup.shelves.map((item) => ({ value: item.name, label: item.name, products: item.products }));
    return [];
  }, [setup, fullScope]);

  const estimatedFullProducts = useMemo(() => {
    if (!setup) return 0;
    if (fullScope === "all") return setup.inventory_products;
    return scopeOptions.find((item) => item.value === fullScopeValue)?.products || 0;
  }, [setup, fullScope, fullScopeValue, scopeOptions]);

  const resetFull = () => {
    setFullTitle("");
    setFullDescription("");
    setFullScope("all");
    setFullScopeValue("");
    setFullAssignee("auto");
    setFullDueAt(localDateTimeAfter(24));
  };

  const resetSpot = () => {
    setSpotTitle("");
    setSpotDescription("");
    setSpotAssignee("auto");
    setSpotDueAt(localDateTimeAfter(4));
    setSpotSearch("");
    setSpotSelected([]);
  };

  const refreshAll = async () => {
    await Promise.all([dashboardQuery.refetch(), canManage ? setupQuery.refetch() : Promise.resolve()]);
  };

  const buildScopeFilter = () => {
    if (fullScope === "main_category") return { main_category_id: fullScopeValue };
    if (fullScope === "subcategory") return { subcategory_id: fullScopeValue };
    if (fullScope === "company") return { company_id: fullScopeValue };
    if (fullScope === "shelf") return { shelf: fullScopeValue };
    return {};
  };

  const createFullSession = async () => {
    if (!currentBranchId || busy) return;
    if (fullScope !== "all" && !fullScopeValue) return toast.error("حدد نطاق الجرد قبل إنشاء الجلسة.");
    if (!fullDueAt) return toast.error("حدد موعد انتهاء الجرد.");
    setBusy(true);
    try {
      const result = await createInventoryAuditSessionV2({
        branchId: currentBranchId,
        kind: "full",
        title: fullTitle,
        description: fullDescription,
        scopeType: fullScope,
        scopeFilter: buildScopeFilter(),
        assigneeId: fullAssignee === "auto" ? null : fullAssignee,
        dueAt: new Date(fullDueAt).toISOString(),
      });
      toast.success(`تم إنشاء ${result.title} وتوزيع ${formatNumber(result.products)} منتج على ${formatNumber(result.eligible_staff)} موظف.`);
      setFullOpen(false);
      resetFull();
      await dashboardQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء جلسة الجرد الشامل.");
    } finally {
      setBusy(false);
    }
  };

  const createSpotSession = async () => {
    if (!currentBranchId || busy) return;
    if (!spotSelected.length) return toast.error("اختر منتجًا واحدًا على الأقل للـ Spot Check.");
    if (spotSelected.length > 50) return toast.error("الـ Spot Check يدعم حتى 50 منتجًا.");
    if (!spotDueAt) return toast.error("حدد موعد انتهاء الفحص.");
    setBusy(true);
    try {
      const result = await createInventoryAuditSessionV2({
        branchId: currentBranchId,
        kind: "spot",
        title: spotTitle,
        description: spotDescription,
        scopeType: "custom",
        scopeFilter: { product_ids: spotSelected.map((product) => product.id) },
        assigneeId: spotAssignee === "auto" ? null : spotAssignee,
        dueAt: new Date(spotDueAt).toISOString(),
      });
      toast.success(`تم إنشاء Spot Check لـ ${formatNumber(result.products)} منتج وتوزيعه على ${formatNumber(result.eligible_staff)} موظف.`);
      setSpotOpen(false);
      resetSpot();
      await dashboardQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء Spot Check.");
    } finally {
      setBusy(false);
    }
  };

  const cancelSelectedSession = async () => {
    if (!cancelSession || busy) return;
    if (cancelNote.trim().length < 3) return toast.error("اكتب سبب إلغاء واضحًا.");
    setBusy(true);
    try {
      const result = await cancelInventoryAuditSessionV2(cancelSession.id, cancelNote);
      toast.success(`تم إلغاء الجلسة وإيقاف ${formatNumber(result.cancelled_tasks)} مهمة لم يبدأ عدها.`);
      setCancelSession(null);
      setCancelNote("");
      await dashboardQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إلغاء جلسة الجرد.");
    } finally {
      setBusy(false);
    }
  };

  const toggleSpotProduct = (product: InventoryAuditProduct) => {
    setSpotSelected((current) => {
      if (current.some((item) => item.id === product.id)) return current.filter((item) => item.id !== product.id);
      if (current.length >= 50) {
        toast.error("وصلت للحد الأقصى: 50 منتجًا.");
        return current;
      }
      return [...current, product];
    });
  };

  if (!currentBranchId) {
    return (
      <MainLayout>
        <div dir="rtl" className="mx-auto max-w-3xl p-6">
          <Card><CardContent className="py-12 text-center text-muted-foreground">اختر فرعًا أولًا لفتح مركز الجرد.</CardContent></Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
        <section className="overflow-hidden rounded-3xl border bg-gradient-to-l from-emerald-950 via-emerald-900 to-emerald-800 text-white shadow-sm">
          <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-emerald-100">
                <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">Inventory Audit V2</Badge>
                <span>{currentBranchName || "الفرع الحالي"}</span>
              </div>
              <h1 className="text-2xl font-bold md:text-4xl">مركز الجرد والتحقق من المخزون</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-50/90 md:text-base">
                جرد أعمى، توزيع على الفريق، تتبع حركات المخزون أثناء العد، إعادة عد مستقلة للفروق، واعتماد مدير قبل أي تسوية فعلية.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <Button variant="secondary" onClick={() => navigate("/tasks?type=inventory")}>
                <ClipboardCheck className="ml-2 h-4 w-4" /> مهام الجرد
              </Button>
              <Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={refreshAll} disabled={dashboardQuery.isFetching}>
                <RefreshCw className={`ml-2 h-4 w-4 ${dashboardQuery.isFetching ? "animate-spin" : ""}`} /> تحديث
              </Button>
            </div>
          </div>
        </section>

        {dashboardQuery.isLoading ? (
          <div className="flex min-h-[360px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-700" /></div>
        ) : dashboardQuery.isError ? (
          <Card className="border-red-200"><CardContent className="py-10 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-600" />
            <p className="font-semibold">تعذر تحميل مركز الجرد</p>
            <p className="mt-1 text-sm text-muted-foreground">{dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "حدّث الصفحة وحاول مرة أخرى."}</p>
            <Button className="mt-4" onClick={() => dashboardQuery.refetch()}>إعادة المحاولة</Button>
          </CardContent></Card>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">جلسات نشطة</p><p className="mt-2 text-3xl font-bold">{formatNumber(summary?.active_sessions)}</p></div><Layers3 className="h-6 w-6 text-emerald-700" /></div></CardContent></Card>
              <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">تقدم الجرد اليومي</p><p className="mt-2 text-3xl font-bold">{formatNumber(summary?.today_daily_progress)}%</p></div><Target className="h-6 w-6 text-blue-700" /></div><Progress className="mt-3 h-2" value={Number(summary?.today_daily_progress || 0)} /></CardContent></Card>
              <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">فروق مفتوحة</p><p className="mt-2 text-3xl font-bold">{formatNumber(summary?.open_variances)}</p></div><AlertTriangle className="h-6 w-6 text-amber-600" /></div>{summary?.open_variance_value != null && <p className="mt-2 text-xs text-muted-foreground">قيمة تقديرية: {formatMoney(summary.open_variance_value)}</p>}</CardContent></Card>
              <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">مراجعات معلقة</p><p className="mt-2 text-3xl font-bold">{formatNumber(Number(summary?.pending_recounts || 0) + Number(summary?.pending_approvals || 0))}</p></div><ShieldCheck className="h-6 w-6 text-violet-700" /></div><p className="mt-2 text-xs text-muted-foreground">إعادة عد {formatNumber(summary?.pending_recounts)} · اعتماد {formatNumber(summary?.pending_approvals)}</p></CardContent></Card>
              <Card className="shadow-sm"><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">دقة العد الأول · 30 يوم</p><p className="mt-2 text-3xl font-bold">{formatNumber(summary?.first_count_accuracy_percent)}%</p></div><CheckCircle2 className="h-6 w-6 text-emerald-600" /></div>{Number(summary?.overdue_tasks || 0) > 0 && <p className="mt-2 text-xs font-medium text-red-600">{formatNumber(summary?.overdue_tasks)} مهمة متأخرة</p>}</CardContent></Card>
            </section>

            {canManage && (
              <section className="grid gap-4 lg:grid-cols-2">
                <Card className="border-emerald-200 bg-emerald-50/40 shadow-sm">
                  <CardContent className="flex h-full flex-col justify-between gap-5 p-6 md:flex-row md:items-center">
                    <div><p className="text-lg font-bold">بدء جرد شامل</p><p className="mt-1 text-sm leading-6 text-muted-foreground">كل المخزون أو قسم/شركة/رف محدد، مع توزيع المنتجات تلقائيًا على فريق الجرد.</p></div>
                    <Button className="shrink-0 bg-emerald-800 hover:bg-emerald-900" onClick={() => setFullOpen(true)}><Layers3 className="ml-2 h-4 w-4" /> جلسة شاملة</Button>
                  </CardContent>
                </Card>
                <Card className="border-blue-200 bg-blue-50/40 shadow-sm">
                  <CardContent className="flex h-full flex-col justify-between gap-5 p-6 md:flex-row md:items-center">
                    <div><p className="text-lg font-bold">Spot Check سريع</p><p className="mt-1 text-sm leading-6 text-muted-foreground">اختر حتى 50 منتجًا بعينهم لفحص مفاجئ مستقل من غير إظهار رصيد النظام للموظف.</p></div>
                    <Button className="shrink-0" onClick={() => setSpotOpen(true)}><PackageSearch className="ml-2 h-4 w-4" /> اختيار المنتجات</Button>
                  </CardContent>
                </Card>
              </section>
            )}

            <section className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
              <Card className="shadow-sm">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div><CardTitle>الجلسات</CardTitle><CardDescription>التقدم الحقيقي لا يصل 100% إلا بعد إغلاق الفروق وإعادة العد والاعتماد.</CardDescription></div>
                  <Badge variant="outline">{formatNumber(activeSessions.length)} نشطة</Badge>
                </CardHeader>
                <CardContent>
                  {recentSessions.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">لا توجد جلسات جرد مسجلة بعد.</div> : (
                    <div className="space-y-4">
                      {recentSessions.map((session) => {
                        const resolvedProgress = sessionResolvedProgress(session);
                        const submittedProgress = session.total_tasks ? Math.round((Number(session.completed_tasks || 0) / Number(session.total_tasks)) * 1000) / 10 : 0;
                        return (
                          <div key={session.id} className="rounded-2xl border p-4 transition-colors hover:bg-muted/20">
                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-bold">{session.title || kindLabel(session.audit_kind)}</p>
                                  {statusBadge(session.status)}
                                  <Badge variant="outline">{kindLabel(session.audit_kind)}</Badge>
                                  <Badge variant="outline">{scopeLabel(session.scope_type)}</Badge>
                                </div>
                                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                                  <span>المنتجات: {formatNumber(session.total_tasks)}</span>
                                  <span>تم العد: {formatNumber(session.completed_tasks)}</span>
                                  <span>فروق: {formatNumber(session.discrepancy_tasks)}</span>
                                  <span>الاستحقاق: {formatDateTime(session.due_at)}</span>
                                </div>
                              </div>
                              <div className="flex shrink-0 gap-2">
                                <Button size="sm" variant="outline" onClick={() => navigate("/tasks?type=inventory")}>فتح المهام</Button>
                                {canManage && session.status === "active" && session.audit_kind !== "daily" && <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => { setCancelSession(session); setCancelNote(""); }}><Ban className="ml-1 h-4 w-4" /> إلغاء</Button>}
                              </div>
                            </div>
                            <div className="mt-4 space-y-2">
                              <div className="flex items-center justify-between text-xs"><span className="font-medium">إغلاق نهائي {formatNumber(session.resolved_tasks)} / {formatNumber(session.total_tasks)}</span><span>{resolvedProgress}%</span></div>
                              <Progress value={resolvedProgress} className="h-2.5" />
                              {submittedProgress > resolvedProgress && <p className="text-xs text-amber-700">تم عد {submittedProgress}%، لكن ما زالت هناك فروق تحتاج إعادة عد أو اعتماد قبل إغلاق الجلسة.</p>}
                              {(Number(session.pending_recounts || 0) > 0 || Number(session.pending_approvals || 0) > 0) && <div className="flex flex-wrap gap-2 pt-1"><Badge className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">إعادة عد {formatNumber(session.pending_recounts)}</Badge><Badge className="border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-50">اعتماد {formatNumber(session.pending_approvals)}</Badge></div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> حمل فريق الجرد</CardTitle><CardDescription>المهام الحالية ودقة العد الأول خلال آخر 30 يومًا.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {staff.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">لا يوجد موظفون مؤهلون للجرد.</div> : staff.map((member) => (
                    <div key={member.user_id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{member.name}</p><p className="text-xs text-muted-foreground">تم تسليم {formatNumber(member.submitted_30d)} عد خلال 30 يومًا</p></div><Badge variant="outline">{member.submitted_30d > 0 ? `${formatNumber(member.accuracy_30d)}% دقة` : "دقة —"}</Badge></div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs"><Badge className="border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-50">عد نشط {formatNumber(member.active_counts)}</Badge><Badge className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">إعادة عد {formatNumber(member.active_recounts)}</Badge></div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>

            <Card className="shadow-sm">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /> فروق تحتاج متابعة</CardTitle><CardDescription>الفرق لا يعدّل المخزون تلقائيًا؛ يمر بإعادة عد مستقلة ثم اعتماد مسؤول.</CardDescription></div>
                {variances.length > 0 && <Button variant="outline" size="sm" onClick={() => navigate("/tasks?type=inventory")}>فتح طابور المراجعة</Button>}
              </CardHeader>
              <CardContent>
                {variances.length === 0 ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> لا توجد فروق مفتوحة حاليًا.</div> : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead className="text-right">المنتج</TableHead><TableHead className="text-right">الموظف</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">إعادة العد</TableHead>{dashboardQuery.data?.permissions.can_manage_sessions && <TableHead className="text-right">الفرق</TableHead>}<TableHead className="text-right">اعتماد</TableHead></TableRow></TableHeader>
                      <TableBody>{variances.map((item) => <TableRow key={item.count_id}><TableCell><p className="font-medium">{item.product_name}</p><p className="text-xs text-muted-foreground">{item.barcode || "بدون باركود"}</p></TableCell><TableCell>{item.assigned_to_name || "—"}</TableCell><TableCell><Badge variant="outline">{item.status === "review_required" ? "بانتظار اعتماد" : "فرق مكتشف"}</Badge></TableCell><TableCell>{item.recount_status || "—"}</TableCell>{dashboardQuery.data?.permissions.can_manage_sessions && <TableCell>{item.variance == null ? "—" : `${Number(item.variance) > 0 ? "+" : ""}${Number(item.variance).toLocaleString("ar-EG", { maximumFractionDigits: 3 })}`}{item.variance_value != null && <div className="text-xs text-muted-foreground">{formatMoney(item.variance_value)}</div>}</TableCell>}<TableCell>{item.approval_status || "—"}</TableCell></TableRow>)}</TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <Dialog open={fullOpen} onOpenChange={(open) => { setFullOpen(open); if (!open && !busy) resetFull(); }}>
          <DialogContent dir="rtl" className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader className="text-right"><DialogTitle>إنشاء جلسة جرد شامل</DialogTitle><DialogDescription>حدد نطاق الجرد. الرصيد المتوقع يظل مخفيًا عن الموظفين، والتوزيع يتم في مجموعات متقاربة حسب الرف/القسم قدر الإمكان.</DialogDescription></DialogHeader>
            <div className="grid gap-5 py-2">
              <div className="grid gap-2"><Label>اسم الجلسة · اختياري</Label><Input value={fullTitle} onChange={(e) => setFullTitle(e.target.value)} placeholder="مثال: جرد نهاية الشهر" /></div>
              <div className="grid gap-2"><Label>ملاحظات للإدارة · اختياري</Label><Textarea value={fullDescription} onChange={(e) => setFullDescription(e.target.value)} placeholder="هدف الجلسة أو أي تعليمات تنظيمية" /></div>
              <div className="grid gap-2"><Label>نطاق الجرد</Label><Select value={fullScope} onValueChange={(value) => { setFullScope(value as InventoryAuditScope); setFullScopeValue(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل مخزون الفرع</SelectItem><SelectItem value="main_category">قسم رئيسي</SelectItem><SelectItem value="subcategory">قسم فرعي</SelectItem><SelectItem value="company">شركة / علامة</SelectItem><SelectItem value="shelf">رف / موقع</SelectItem></SelectContent></Select></div>
              {fullScope !== "all" && <div className="grid gap-2"><Label>اختر {scopeLabel(fullScope)}</Label><Select value={fullScopeValue} onValueChange={setFullScopeValue}><SelectTrigger><SelectValue placeholder="حدد النطاق" /></SelectTrigger><SelectContent>{scopeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label} · {formatNumber(option.products)} منتج</SelectItem>)}</SelectContent></Select></div>}
              <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>التوزيع</Label><Select value={fullAssignee} onValueChange={setFullAssignee}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">توزيع تلقائي على الفريق</SelectItem>{setup?.staff.map((member) => <SelectItem key={member.id} value={member.id}>{member.name} · {member.role_name || "موظف"}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>موعد الانتهاء</Label><Input type="datetime-local" value={fullDueAt} onChange={(e) => setFullDueAt(e.target.value)} /></div></div>
              <div className="rounded-2xl border bg-muted/30 p-4"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">المنتجات المتوقعة داخل النطاق</span><span className="text-2xl font-bold">{setupQuery.isLoading ? "…" : formatNumber(estimatedFullProducts)}</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">سيتم إنشاء مهمة Blind Count لكل منتج. أي فرق يفتح Recount مستقل، ولا يحدث تعديل للمخزون من مجرد نتيجة العد.</p></div>
            </div>
            <DialogFooter className="gap-2 sm:justify-start"><Button onClick={createFullSession} disabled={busy || setupQuery.isLoading || estimatedFullProducts === 0}>{busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />} إنشاء وتوزيع الجلسة</Button><Button variant="outline" onClick={() => setFullOpen(false)} disabled={busy}>إلغاء</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={spotOpen} onOpenChange={(open) => { setSpotOpen(open); if (!open && !busy) resetSpot(); }}>
          <DialogContent dir="rtl" className="max-h-[92vh] max-w-3xl overflow-y-auto">
            <DialogHeader className="text-right"><DialogTitle>إنشاء Spot Check</DialogTitle><DialogDescription>اختر المنتجات يدويًا حتى 50 منتجًا. مناسب للفحص المفاجئ أو مراجعة رف/صنف مشكوك فيه.</DialogDescription></DialogHeader>
            <div className="grid gap-5 py-2">
              <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>اسم الفحص · اختياري</Label><Input value={spotTitle} onChange={(e) => setSpotTitle(e.target.value)} placeholder="مثال: مراجعة منتجات الألبان" /></div><div className="grid gap-2"><Label>موعد الانتهاء</Label><Input type="datetime-local" value={spotDueAt} onChange={(e) => setSpotDueAt(e.target.value)} /></div></div>
              <div className="grid gap-2"><Label>التوزيع</Label><Select value={spotAssignee} onValueChange={setSpotAssignee}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">توزيع تلقائي على الفريق</SelectItem>{setup?.staff.map((member) => <SelectItem key={member.id} value={member.id}>{member.name} · {member.role_name || "موظف"}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2"><Label>ملاحظة · اختياري</Label><Textarea value={spotDescription} onChange={(e) => setSpotDescription(e.target.value)} placeholder="سبب الفحص أو التعليمات" /></div>
              <div className="grid gap-2"><Label>ابحث بالاسم أو الباركود أو الرف</Label><div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pr-9" value={spotSearch} onChange={(e) => setSpotSearch(e.target.value)} placeholder="اكتب حرفين على الأقل…" /></div></div>
              <div className="rounded-2xl border">
                <div className="flex items-center justify-between border-b px-4 py-3"><span className="text-sm font-semibold">نتائج البحث</span><Badge variant="outline">مختار {spotSelected.length} / 50</Badge></div>
                <div className="max-h-64 overflow-y-auto p-2">
                  {spotSearch.trim().length < 2 ? <p className="py-8 text-center text-sm text-muted-foreground">ابدأ بالبحث لإضافة منتجات.</p> : productSearchQuery.isFetching ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : (productSearchQuery.data || []).length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">لا توجد نتائج.</p> : (productSearchQuery.data || []).map((product) => {
                    const selected = spotSelected.some((item) => item.id === product.id);
                    return <button type="button" key={product.id} onClick={() => toggleSpotProduct(product)} className={`mb-1 flex w-full items-center justify-between rounded-xl border p-3 text-right transition-colors ${selected ? "border-emerald-300 bg-emerald-50" : "hover:bg-muted/40"}`}><div className="min-w-0"><p className="truncate font-medium">{product.name}</p><p className="mt-1 text-xs text-muted-foreground">{product.barcode || "بدون باركود"} · {product.category_name || "بدون قسم"}{product.shelf_location ? ` · رف ${product.shelf_location}` : ""}</p></div>{selected ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" /> : <Plus className="h-5 w-5 shrink-0 text-muted-foreground" />}</button>;
                  })}
                </div>
              </div>
              {spotSelected.length > 0 && <div className="flex flex-wrap gap-2">{spotSelected.map((product) => <Badge key={product.id} variant="secondary" className="gap-1 py-1.5">{product.name}<button type="button" aria-label={`حذف ${product.name}`} onClick={() => toggleSpotProduct(product)}><X className="h-3.5 w-3.5" /></button></Badge>)}</div>}
            </div>
            <DialogFooter className="gap-2 sm:justify-start"><Button onClick={createSpotSession} disabled={busy || spotSelected.length === 0}>{busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />} إنشاء Spot Check ({spotSelected.length})</Button><Button variant="outline" onClick={() => setSpotOpen(false)} disabled={busy}>إلغاء</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(cancelSession)} onOpenChange={(open) => { if (!open && !busy) { setCancelSession(null); setCancelNote(""); } }}>
          <DialogContent dir="rtl" className="max-w-lg">
            <DialogHeader className="text-right"><DialogTitle>إلغاء جلسة الجرد</DialogTitle><DialogDescription>سيتم إيقاف المهام التي لم يُسلَّم عدها فقط. أي فرق تم اكتشافه بالفعل سيظل في مسار إعادة العد/الاعتماد ولا يتم إخفاؤه.</DialogDescription></DialogHeader>
            <div className="grid gap-2 py-3"><Label>سبب الإلغاء</Label><Textarea value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} placeholder="اكتب سبب الإلغاء…" /></div>
            <DialogFooter className="gap-2 sm:justify-start"><Button variant="destructive" onClick={cancelSelectedSession} disabled={busy || cancelNote.trim().length < 3}>{busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />} تأكيد الإلغاء</Button><Button variant="outline" onClick={() => setCancelSession(null)} disabled={busy}>رجوع</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
