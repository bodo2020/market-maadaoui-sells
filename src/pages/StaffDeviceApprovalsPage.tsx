import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Laptop, RefreshCw, ShieldCheck, ShieldX, Smartphone } from "lucide-react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { approveStaffDevice, listPendingStaffDeviceApprovals, rejectStaffDevice, StaffDeviceApprovalItem } from "@/services/staffDeviceService";

const typeLabels = { personal: "شخصي", shared: "مشترك", remote: "عن بُعد" } as const;

function formatDate(value?: string | null) {
  if (!value) return "—";
  try { return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return value; }
}

export default function StaffDeviceApprovalsPage() {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<StaffDeviceApprovalItem | null>(null);
  const [reason, setReason] = useState("");

  const approvalsQuery = useQuery({
    queryKey: ["staff-device-approvals"],
    queryFn: () => listPendingStaffDeviceApprovals(200),
    refetchInterval: 30000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["staff-device-approvals"] });

  const approveMutation = useMutation({
    mutationFn: (deviceId: string) => approveStaffDevice(deviceId),
    onSuccess: () => { toast.success("تم اعتماد الجهاز"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "تعذر اعتماد الجهاز"),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ deviceId, reason }: { deviceId: string; reason: string }) => rejectStaffDevice(deviceId, reason),
    onSuccess: () => {
      toast.success("تم رفض الجهاز");
      setRejecting(null);
      setReason("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "تعذر رفض الجهاز"),
  });

  const items = approvalsQuery.data || [];

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2"><ShieldCheck className="h-7 w-7 text-[#005931]" /><h1 className="text-3xl font-black">اعتماد أجهزة الموظفين</h1></div>
            <p className="mt-1 text-sm text-muted-foreground">هذه الصفحة للسوبر أدمن فقط. الجهاز لا يعمل في الحضور قبل الموافقة هنا.</p>
          </div>
          <Button variant="outline" onClick={refresh} disabled={approvalsQuery.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${approvalsQuery.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="flex items-center gap-3 p-5"><Clock3 className="h-8 w-8 text-amber-600" /><div><div className="text-2xl font-black">{items.length}</div><div className="text-xs text-muted-foreground">طلب بانتظار القرار</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-5"><ShieldCheck className="h-8 w-8 text-[#005931]" /><div><div className="font-black">Super Admin</div><div className="text-xs text-muted-foreground">صاحب قرار الاعتماد</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-5"><Laptop className="h-8 w-8 text-slate-600" /><div><div className="font-black">لا اعتماد ذاتي</div><div className="text-xs text-muted-foreground">كل جهاز جديد يمر بالمراجعة</div></div></CardContent></Card>
        </div>

        {approvalsQuery.isLoading ? (
          <div className="py-16 text-center text-muted-foreground">جاري تحميل طلبات الأجهزة...</div>
        ) : approvalsQuery.error ? (
          <Card className="border-destructive/30"><CardContent className="py-10 text-center"><ShieldX className="mx-auto mb-3 h-9 w-9 text-destructive" /><div className="font-black text-destructive">تعذر فتح قائمة الاعتماد</div><p className="mt-2 text-sm text-muted-foreground">تأكد أنك داخل بحساب السوبر أدمن. السيرفر يمنع أي Role آخر من اعتماد الأجهزة.</p></CardContent></Card>
        ) : items.length === 0 ? (
          <Card><CardContent className="py-14 text-center"><CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-[#005931]" /><div className="font-black">لا توجد طلبات معلقة</div><p className="mt-1 text-sm text-muted-foreground">أي جهاز يسجله موظف سيظهر هنا تلقائيًا للمراجعة.</p></CardContent></Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item) => (
              <Card key={item.device_id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-amber-100 p-2.5"><Smartphone className="h-5 w-5 text-amber-700" /></div>
                      <div><CardTitle className="text-lg">{item.employee_name}</CardTitle><CardDescription>{item.device_name}</CardDescription></div>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">بانتظار الاعتماد</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-sm">
                    <div><div className="text-xs text-muted-foreground">الفرع</div><div className="font-semibold">{item.branch_name || "غير محدد"}</div></div>
                    <div><div className="text-xs text-muted-foreground">نوع الجهاز</div><div className="font-semibold">{typeLabels[item.device_type]}</div></div>
                    <div><div className="text-xs text-muted-foreground">المنصة</div><div className="font-semibold">{item.platform || "Web"}</div></div>
                    <div><div className="text-xs text-muted-foreground">وقت الطلب</div><div className="font-semibold">{formatDate(item.requested_at)}</div></div>
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1 bg-[#005931] hover:bg-[#004426]" disabled={approveMutation.isPending || rejectMutation.isPending} onClick={() => approveMutation.mutate(item.device_id)}><CheckCircle2 className="ml-2 h-4 w-4" />اعتماد الجهاز</Button>
                    <Button variant="outline" className="flex-1 text-destructive" disabled={approveMutation.isPending || rejectMutation.isPending} onClick={() => { setRejecting(item); setReason(""); }}><ShieldX className="ml-2 h-4 w-4" />رفض</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => { if (!open) { setRejecting(null); setReason(""); } }}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>رفض الجهاز</DialogTitle><DialogDescription>اكتب سبب الرفض. السبب سيظهر في سجل الجهاز ويُحفظ في الـAudit.</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label>سبب الرفض</Label><Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: جهاز غير معروف أو غير مصرح به" /></div>
          <DialogFooter><Button variant="destructive" disabled={rejectMutation.isPending || reason.trim().length < 3} onClick={() => rejecting && rejectMutation.mutate({ deviceId: rejecting.device_id, reason: reason.trim() })}>{rejectMutation.isPending ? "جاري الرفض..." : "تأكيد الرفض"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
