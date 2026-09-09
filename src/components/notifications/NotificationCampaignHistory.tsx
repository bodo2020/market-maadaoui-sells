import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CheckCheck,
  ChevronLeft,
  CircleUserRound,
  Clock3,
  Eye,
  Loader2,
  MailOpen,
  Megaphone,
  RefreshCw,
  Send,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  fetchNotificationCampaignDetailsV3,
  fetchNotificationCampaignHistoryV3,
  type NotificationCampaignHistoryItemV3,
} from "@/services/supabase/notificationCampaignHistoryV3Service";

interface Props {
  branchId: string | null;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function severityBadge(item: NotificationCampaignHistoryItemV3) {
  if (item.severity === "critical") return <Badge className="border-red-200 bg-red-50 text-red-700 hover:bg-red-50">عاجل</Badge>;
  if (item.severity === "high") return <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">مهم</Badge>;
  if (item.severity === "info") return <Badge className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">معلومة</Badge>;
  return <Badge variant="outline">عادي</Badge>;
}

function statValue(value: number) {
  return Number(value || 0).toLocaleString("ar-EG");
}

export default function NotificationCampaignHistory({ branchId }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ["notification-campaign-history-v3", branchId],
    queryFn: () => fetchNotificationCampaignHistoryV3(branchId, 20, 0),
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const details = useQuery({
    queryKey: ["notification-campaign-details-v3", selectedId],
    enabled: Boolean(selectedId),
    queryFn: () => fetchNotificationCampaignDetailsV3(selectedId as string),
    staleTime: 10_000,
    retry: false,
  });

  const items = history.data?.items || [];
  const summary = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.sent += item.created_count;
        acc.read += item.read_count;
        acc.unread += item.unread_count;
        return acc;
      },
      { sent: 0, read: 0, unread: 0 },
    );
  }, [items]);

  // صلاحية السجل هي نفس صلاحية إرسال الإشعارات. المستخدم غير المخول لا يرى القسم بدل عرض خطأ صلاحيات.
  if (history.isError) return null;

  return (
    <>
      <Card className="overflow-hidden border-slate-200/80 shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 p-4 md:flex-row md:items-center md:justify-between md:p-5">
            <div>
              <div className="flex items-center gap-2 text-lg font-black text-slate-950">
                <Megaphone className="h-5 w-5 text-[#005931]" /> سجل حملات الإشعارات
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">متابعة الرسائل اليدوية، الجمهور، وعدد من قرأ أو لم يقرأ حتى الآن.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!history.isLoading && items.length > 0 && (
                <>
                  <span className="rounded-xl border bg-white px-3 py-2 text-xs"><Send className="ml-1 inline h-3.5 w-3.5 text-[#005931]" /> {statValue(summary.sent)} تم إنشاؤه</span>
                  <span className="rounded-xl border bg-white px-3 py-2 text-xs"><MailOpen className="ml-1 inline h-3.5 w-3.5 text-emerald-700" /> {statValue(summary.read)} مقروء</span>
                  <span className="rounded-xl border bg-white px-3 py-2 text-xs"><Clock3 className="ml-1 inline h-3.5 w-3.5 text-amber-700" /> {statValue(summary.unread)} غير مقروء</span>
                </>
              )}
              <Button variant="outline" size="sm" className="rounded-xl bg-white" onClick={() => void history.refetch()} disabled={history.isFetching}>
                {history.isFetching ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <RefreshCw className="ml-2 h-4 w-4" />} تحديث
              </Button>
            </div>
          </div>

          {history.isLoading ? (
            <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#005931]" /></div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">مفيش حملات إرسال مسجلة لسه.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map(item => {
                const rate = Math.max(0, Math.min(100, Number(item.read_rate || 0)));
                return (
                  <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="group block w-full p-4 text-right transition hover:bg-emerald-50/35 md:p-5">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#005931]"><Megaphone className="h-4.5 w-4.5" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className="truncate text-sm md:text-base">{item.title}</strong>
                              {severityBadge(item)}
                              <Badge variant="outline" className="font-normal">{item.target_label}</Badge>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.body}</p>
                          </div>
                          <div className="shrink-0 text-[11px] text-muted-foreground">{formatDate(item.created_at)}</div>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2 sm:max-w-md">
                          <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="font-black">{statValue(item.created_count)}</div><div className="text-[10px] text-muted-foreground">المستلمون</div></div>
                          <div className="rounded-xl bg-emerald-50 px-3 py-2"><div className="font-black text-emerald-800">{statValue(item.read_count)}</div><div className="text-[10px] text-emerald-800/70">مقروء</div></div>
                          <div className="rounded-xl bg-amber-50 px-3 py-2"><div className="font-black text-amber-800">{statValue(item.unread_count)}</div><div className="text-[10px] text-amber-800/70">غير مقروء</div></div>
                        </div>

                        <div className="mt-3 flex items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#005931] transition-all" style={{ width: `${rate}%` }} /></div>
                          <span className="w-16 text-left text-[11px] font-bold text-[#005931]">{rate.toLocaleString("ar-EG")}% قراءة</span>
                          <ChevronLeft className="h-4 w-4 text-slate-400 transition group-hover:-translate-x-0.5" />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedId)} onOpenChange={open => { if (!open) setSelectedId(null); }}>
        <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="text-right">
            <SheetTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-[#005931]" /> تفاصيل حملة الإشعار</SheetTitle>
            <SheetDescription className="text-right">الأرقام تتحدث من حالة الإشعار المحفوظة لكل مستلم.</SheetDescription>
          </SheetHeader>

          {details.isLoading ? (
            <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#005931]" /></div>
          ) : details.isError || !details.data ? (
            <div className="mt-8 rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-800">تعذر تحميل تفاصيل الحملة.</div>
          ) : (
            <div className="mt-6 space-y-5">
              <section className="rounded-2xl border bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">{severityBadge(details.data.campaign)}<Badge variant="outline">{details.data.campaign.target_label}</Badge></div>
                <h3 className="mt-3 text-lg font-black">{details.data.campaign.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{details.data.campaign.body}</p>
                <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3"><span className="text-muted-foreground">المرسل</span><div className="mt-1 font-bold">{details.data.campaign.created_by_name}</div></div>
                  <div className="rounded-xl bg-slate-50 p-3"><span className="text-muted-foreground">وقت الإرسال</span><div className="mt-1 font-bold">{formatDate(details.data.campaign.created_at)}</div></div>
                </div>
              </section>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl border bg-slate-50 p-3 text-center"><Users className="mx-auto h-4 w-4 text-slate-500" /><div className="mt-1 text-xl font-black">{statValue(details.data.stats.created_count)}</div><div className="text-[10px] text-muted-foreground">مستلم</div></div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-center"><CheckCheck className="mx-auto h-4 w-4 text-emerald-700" /><div className="mt-1 text-xl font-black text-emerald-800">{statValue(details.data.stats.read_count)}</div><div className="text-[10px] text-emerald-800/70">قرأ</div></div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-center"><Clock3 className="mx-auto h-4 w-4 text-amber-700" /><div className="mt-1 text-xl font-black text-amber-800">{statValue(details.data.stats.unread_count)}</div><div className="text-[10px] text-amber-800/70">لم يقرأ</div></div>
              </div>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-black">حالة المستلمين</h4>
                  <span className="text-xs text-muted-foreground">{statValue(details.data.recipients.length)} حساب</span>
                </div>
                <div className="space-y-2">
                  {details.data.recipients.map(recipient => (
                    <div key={recipient.notification_id} className="flex items-center gap-3 rounded-2xl border bg-white p-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${recipient.read_at ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {recipient.read_at ? <UserRoundCheck className="h-5 w-5" /> : <CircleUserRound className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{recipient.recipient_name}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{recipient.recipient_role || (recipient.audience === "customer" ? "عميل" : "موظف")}</div>
                      </div>
                      <div className="text-left">
                        {recipient.read_at ? (
                          <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50"><CheckCheck className="ml-1 h-3 w-3" /> مقروء</Badge>
                        ) : (
                          <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50"><Clock3 className="ml-1 h-3 w-3" /> غير مقروء</Badge>
                        )}
                        <div className="mt-1 text-[10px] text-muted-foreground">{recipient.read_at ? formatDate(recipient.read_at) : "—"}</div>
                      </div>
                    </div>
                  ))}
                  {details.data.recipients.length === 0 && <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground"><Eye className="mx-auto mb-2 h-5 w-5" />لا توجد حالات مستلمين مسجلة.</div>}
                </div>
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
