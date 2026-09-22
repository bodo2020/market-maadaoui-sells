import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  completeOrderWithoutDriver,
  getManualOrderDelivery,
  type ManualDeliveryMethod,
} from "@/services/manualOrderDeliveryService";

const methods: { value: ManualDeliveryMethod; label: string }[] = [
  { value: "staff", label: "موظف من الفرع" },
  { value: "partner", label: "المتجر الشريك" },
  { value: "external", label: "مندوب خارجي" },
  { value: "customer_pickup", label: "استلم العميل بنفسه" },
];

export function CompleteWithoutDriverDialog({ orderId, open, onOpenChange, onComplete }: {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}) {
  const [method, setMethod] = useState<ManualDeliveryMethod>("staff");
  const [handlerName, setHandlerName] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const workspace = useQuery({
    queryKey: ["manual-order-delivery", orderId],
    queryFn: () => getManualOrderDelivery(orderId),
    enabled: open && Boolean(orderId),
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!open) {
      setMethod("staff");
      setHandlerName("");
      setRecipientName("");
      setReference("");
      setNote("");
    }
  }, [open]);

  const data = workspace.data;
  const blockedReason = !data ? "جاري التحقق من حالة الطلب…"
    : data.proof ? "تم تسجيل التسليم بالفعل."
    : data.combined_order ? "الطلب متعدد المتاجر؛ أغلق رحلة المجموعة من مركز العمليات."
    : data.assigned_driver ? "يوجد مندوب مكلف. راجع تعيينه أولًا."
    : data.order_status !== "shipped" ? "يلزم انتقال الطلب لمرحلة خرج للتوصيل أولًا."
    : data.payment_status !== "paid" || data.payment_method === "cash"
      ? "تسوية التحصيل النقدي لم تكتمل في هذا المسار. متاح حاليًا للطلبات المدفوعة بغير النقد."
      : null;

  const save = async () => {
    if (blockedReason || saving) return;
    setSaving(true);
    try {
      await completeOrderWithoutDriver({
        orderId, method, handlerName, recipientName, confirmationReference: reference, note,
      });
      toast.success("تم توثيق التسليم بدون مندوب وتحديث حالة الطلب");
      onOpenChange(false);
      onComplete?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل التسليم");
      await workspace.refetch();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader><DialogTitle>تسجيل التسليم بدون مندوب على النظام</DialogTitle></DialogHeader>
        {workspace.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">تعذر التحقق من الطلب: {workspace.error.message}</p>}
        {blockedReason && !workspace.error && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{blockedReason}</p>}
        {data?.proof ? (
          <p className="text-sm">المستلم: {data.proof.recipient_name} · المنفذ: {data.proof.handler_name} · المرجع: {data.proof.confirmation_reference}</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1"><Label htmlFor="manual-delivery-method">طريقة التسليم</Label>
              <select id="manual-delivery-method" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={method} onChange={event => setMethod(event.target.value as ManualDeliveryMethod)} disabled={!!blockedReason}>
                {methods.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label htmlFor="manual-handler">اسم من نفّذ التسليم</Label><Input id="manual-handler" maxLength={120} value={handlerName} onChange={event => setHandlerName(event.target.value)} disabled={!!blockedReason} /></div>
            <div className="space-y-1"><Label htmlFor="manual-recipient">اسم من استلم الطلب</Label><Input id="manual-recipient" maxLength={120} value={recipientName} onChange={event => setRecipientName(event.target.value)} disabled={!!blockedReason} /></div>
            <div className="space-y-1"><Label htmlFor="manual-reference">مرجع تأكيد الاستلام</Label><Input id="manual-reference" maxLength={120} placeholder="رقم إيصال أو كود تأكيد أو وصف إثبات" value={reference} onChange={event => setReference(event.target.value)} disabled={!!blockedReason} /></div>
            <div className="space-y-1"><Label htmlFor="manual-note">ملاحظة (اختياري)</Label><Textarea id="manual-note" maxLength={500} value={note} onChange={event => setNote(event.target.value)} disabled={!!blockedReason} /></div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>رجوع</Button>
          {!data?.proof && <Button disabled={!!blockedReason || saving || handlerName.trim().length < 2 || recipientName.trim().length < 2 || reference.trim().length < 3} onClick={() => void save()}>
            {saving ? "جاري التوثيق…" : "تأكيد التسليم"}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
