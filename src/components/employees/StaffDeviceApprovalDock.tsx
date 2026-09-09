import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, ShieldCheck, ShieldX, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { approveStaffDevice, listPendingStaffDeviceApprovals, rejectStaffDevice, StaffDeviceApprovalItem } from "@/services/staffDeviceService";

function formatDate(value?: string | null) {
  if (!value) return "—";
  try { return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return value; }
}

export default function StaffDeviceApprovalDock() {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<StaffDeviceApprovalItem | null>(null);
  const [reason, setReason] = useState("");
  const query = useQuery({ queryKey: ["staff-device-approvals"], queryFn: () => listPendingStaffDeviceApprovals(100), retry: false, refetchInterval: 30000 });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["staff-device-approvals"] });
    queryClient.invalidateQueries({ queryKey: ["hr-staff-devices"] });
  };
  const approveMutation = useMutation({
    mutationFn: approveStaffDevice,
    onSuccess: () => { toast.success("تم اعتماد الجهاز وأصبح موثوقًا"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "تعذر اعتماد الجهاز"),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectStaffDevice(id, reason),
    onSuccess: () => { toast.success("تم رفض الجهاز"); setRejecting(null); setReason(""); refresh(); },
    onError: (e: any) => toast.error(e?.message || "تعذر رفض الجهاز"),
  });

  if (query.isError) return null;
  const items = query.data || [];

  return (
    <>
      <Card className={items.length ? "border-amber-300 bg-amber-50/30" : "border-emerald-200"}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#005931]" />اعتماد أجهزة الموظفين</CardTitle>
              <CardDescription>للسوبر أدمن فقط — لا يعمل أي جهاز جديد في الحضور قبل اعتمادك.</CardDescription>
            </div>
            <Badge className={items.length ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>{items.length} معلق</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {query.isLoading ? <div className="py-4 text-sm text-muted-foreground">جاري فحص طلبات الأجهزة...</div> : items.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />لا توجد أجهزة بانتظار الاعتماد.</div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {items.map((item) => (
                <div key={item.device_id} className="rounded-xl border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3"><div className="rounded-lg bg-amber-100 p-2"><Smartphone className="h-5 w-5 text-amber-700" /></div><div><div className="font-black">{item.employee_name}</div><div className="text-sm text-muted-foreground">{item.device_name} • {item.branch_name || "بدون فرع"}</div><div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{formatDate(item.requested_at)}</div></div></div>
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">معلق</Badge>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" className="flex-1 bg-[#005931] hover:bg-[#004426]" disabled={approveMutation.isPending || rejectMutation.isPending} onClick={() => approveMutation.mutate(item.device_id)}><CheckCircle2 className="ml-2 h-4 w-4" />اعتماد</Button>
                    <Button size="sm" variant="outline" className="flex-1 text-destructive" disabled={approveMutation.isPending || rejectMutation.isPending} onClick={() => { setRejecting(item); setReason(""); }}><ShieldX className="ml-2 h-4 w-4" />رفض</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => { if (!open) { setRejecting(null); setReason(""); } }}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>رفض جهاز {rejecting?.employee_name}</DialogTitle><DialogDescription>سبب الرفض إلزامي وسيتم حفظه في سجل التدقيق.</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label>سبب الرفض</Label><Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="اكتب سبب الرفض" /></div>
          <DialogFooter><Button variant="destructive" disabled={rejectMutation.isPending || reason.trim().length < 3} onClick={() => rejecting && rejectMutation.mutate({ id: rejecting.device_id, reason: reason.trim() })}>{rejectMutation.isPending ? "جاري الرفض..." : "تأكيد الرفض"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
