import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, History, Loader2, Megaphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchNotificationCampaignHistoryV3 } from "@/services/supabase/notificationCampaignHistoryV3Service";

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
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusLabel(status: string) {
  if (status === "completed") return "مكتملة";
  if (status === "pending") return "قيد التنفيذ";
  if (status === "failed") return "فشلت";
  if (status === "draft") return "مسودة";
  return status;
}

export default function NotificationCampaignHistory({ branchId }: Props) {
  const [offset, setOffset] = useState(0);
  const limit = 10;

  const query = useQuery({
    queryKey: ["notification-campaign-history-v3", branchId, limit, offset],
    enabled: Boolean(branchId),
    queryFn: () => fetchNotificationCampaignHistoryV3(branchId, limit, offset),
    staleTime: 20_000,
    retry: false,
  });

  const items = query.data?.items || [];
  const total = query.data?.total || 0;
  const hasNext = offset + limit < total;
  const hasPrev = offset > 0;

  return (
    <Card className="border-slate-200/80 shadow-sm" dir="rtl">
      <CardContent className="p-4 md:p-5">
        <div className="mb-4 flex items-center gap-2 font-black text-slate-900">
          <History className="h-5 w-5 text-[#005931]" />
          <span>حملات الإشعارات المرسلة</span>
        </div>

        {query.isLoading ? (
          <div className="flex min-h-[160px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#005931]" />
            <span className="mr-2 text-sm text-muted-foreground">جاري تحميل سجل الحملات...</span>
          </div>
        ) : query.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
            تعذر تحميل سجل الحملات. حاول مرة أخرى.
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed bg-slate-50/50 p-6 text-center">
            <Megaphone className="h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-700">لا توجد حملات مرسلة</p>
            <p className="text-xs text-muted-foreground">ستظهر هنا الحملات التي ترسلها من مركز الإشعارات.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200/80 bg-white p-4 transition hover:border-emerald-200 hover:shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-black text-slate-950">{item.title}</h4>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                        {item.target_label}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{item.body}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>بواسطة: {item.created_by_name}</span>
                      <span>{formatDate(item.created_at)}</span>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-[#005931]">
                        {statusLabel(item.status)}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-black text-[#005931]">
                      {item.recipient_count.toLocaleString("ar-EG")}
                    </div>
                    <div className="text-xs text-muted-foreground">مستلم</div>
                    <div className="mt-1 text-xs font-semibold text-slate-700">
                      قراءة: {Math.round(item.read_rate * 100)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {total > limit && (
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={!hasPrev}
                  onClick={() => setOffset(value => Math.max(0, value - limit))}
                >
                  <ChevronRight className="ml-1 h-4 w-4" /> السابق
                </Button>
                <span className="text-xs text-muted-foreground">
                  {offset.toLocaleString("ar-EG")} - {Math.min(offset + limit, total).toLocaleString("ar-EG")} من{" "}
                  {total.toLocaleString("ar-EG")}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={!hasNext}
                  onClick={() => setOffset(value => value + limit)}
                >
                  التالي <ChevronLeft className="mr-1 h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
