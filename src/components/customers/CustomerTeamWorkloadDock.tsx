import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, Gauge, Loader2, RefreshCw, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useBranchStore } from "@/stores/branchStore";
import { fetchCustomerFollowupTeamWorkload } from "@/services/supabase/customerFollowupAssignmentService";

const num = (value: number | null | undefined) => Number(value || 0).toLocaleString("ar-EG");
const levelMeta: Record<string, { label: string; className: string }> = {
  high: { label: "ضغط مرتفع", className: "border-red-200 bg-red-50 text-red-700" },
  medium: { label: "ضغط متوسط", className: "border-amber-200 bg-amber-50 text-amber-700" },
  available: { label: "متاح", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

function dateTime(value?: string | null) {
  if (!value) return "لا توجد مهمة قادمة";
  try {
    return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "—";
  }
}

export default function CustomerTeamWorkloadDock() {
  const { currentBranchId } = useBranchStore();
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ["customer-followup-team-workload", currentBranchId],
    enabled: open,
    queryFn: () => fetchCustomerFollowupTeamWorkload(currentBranchId || null),
  });

  const data = query.data;
  const urgent = Number(data?.summary.overdue_total || 0);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="fixed bottom-36 left-5 z-[66] h-12 rounded-full bg-white px-5 shadow-[0_14px_35px_rgba(15,23,42,.16)]"
      >
        <UsersRound className="ml-2 h-5 w-5 text-[#005931]" />
        فريق المتابعة
        {urgent > 0 && <Badge className="mr-2 bg-red-600 text-white hover:bg-red-600">{num(urgent)}</Badge>}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="text-right">
            <SheetTitle className="flex items-center gap-2 text-xl"><UsersRound className="h-5 w-5 text-[#005931]" />حمل فريق متابعة العملاء</SheetTitle>
            <SheetDescription>شوف الضغط الحالي على كل مسؤول قبل توزيع مهام جديدة.</SheetDescription>
          </SheetHeader>

          <div className="mt-5 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث
            </Button>
          </div>

          {query.isLoading ? (
            <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#005931]" /></div>
          ) : query.isError || !data ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{(query.error as Error)?.message || "تعذر تحميل حمل الفريق."}</div>
          ) : (
            <div className="mt-4 space-y-4">
              <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card><CardContent className="p-4"><Gauge className="h-4 w-4 text-[#005931]" /><div className="mt-2 text-2xl font-black">{num(data.summary.pending_total)}</div><div className="text-[11px] text-muted-foreground">معلقة الآن</div></CardContent></Card>
                <Card><CardContent className="p-4"><AlertTriangle className="h-4 w-4 text-red-600" /><div className="mt-2 text-2xl font-black">{num(data.summary.overdue_total)}</div><div className="text-[11px] text-muted-foreground">متأخرة</div></CardContent></Card>
                <Card><CardContent className="p-4"><CalendarClock className="h-4 w-4 text-amber-600" /><div className="mt-2 text-2xl font-black">{num(data.summary.due_today_total)}</div><div className="text-[11px] text-muted-foreground">مستحقة اليوم</div></CardContent></Card>
                <Card><CardContent className="p-4"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><div className="mt-2 text-2xl font-black">{num(data.summary.completed_7d_total)}</div><div className="text-[11px] text-muted-foreground">أُنجزت 7 أيام</div></CardContent></Card>
              </section>

              <section className="space-y-2">
                {data.staff.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا يوجد مسؤولون مؤهلون لإدارة العملاء في الفرع الحالي.</div>
                ) : data.staff.map((person) => {
                  const meta = levelMeta[person.workload_level] || levelMeta.available;
                  return (
                    <Card key={person.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-black">{person.name}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{person.role || "مسؤول عملاء"}</div>
                          </div>
                          <div className="flex items-center gap-2"><Badge variant="outline" className={meta.className}>{meta.label}</Badge><span className="rounded-xl bg-slate-950 px-2 py-1 text-sm font-black text-white">{num(person.workload_score)}</span></div>
                        </div>
                        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                          <div className="rounded-xl bg-slate-50 p-2"><div className="text-muted-foreground">معلقة</div><strong>{num(person.pending_count)}</strong></div>
                          <div className="rounded-xl bg-red-50 p-2"><div className="text-red-600">متأخرة</div><strong>{num(person.overdue_count)}</strong></div>
                          <div className="rounded-xl bg-amber-50 p-2"><div className="text-amber-700">اليوم</div><strong>{num(person.due_today_count)}</strong></div>
                          <div className="rounded-xl bg-emerald-50 p-2"><div className="text-emerald-700">أنجز 7 أيام</div><strong>{num(person.completed_7d_count)}</strong></div>
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground">المهمة القادمة: {dateTime(person.next_due_at)} · خلال 7 أيام: {num(person.next_7d_count)}</div>
                      </CardContent>
                    </Card>
                  );
                })}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
