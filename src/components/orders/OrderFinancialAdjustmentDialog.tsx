import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ApprovalItem } from "@/services/supabase/approvalCenterV1Service";
import {
  fetchOrderShortageFinancialAdjustment,
  fetchOrderSubstitutionFinancialAdjustment,
  settleOrderShortageFinancialAdjustment,
  settleOrderSubstitutionFinancialAdjustment,
  type OrderShortageFinancialAdjustment,
  type OrderSubstitutionFinancialAdjustment,
} from "@/services/supabase/orderSubstitutionApprovalService";

type FinanceDetail = OrderSubstitutionFinancialAdjustment | OrderShortageFinancialAdjustment;
type Props = {
  task: ApprovalItem | null;
  onClose: () => void;
  onDone: () => void | Promise<void>;
};

const money = (value?: number | null) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const qty = (value?: number | null) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 3 });

const isShortage = (task: ApprovalItem | null): boolean => task?.source_kind === "order_shortage_financial_adjustment";
const isShortageDetail = (detail: FinanceDetail): detail is OrderShortageFinancialAdjustment => "product_name" in detail;

export default function OrderFinancialAdjustmentDialog({ task, onClose, onDone }: Props) {
  const [providerReference, setProviderReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!task) return;
    setProviderReference("");
    setNote("");
  }, [task?.id]);

  const detailQuery = useQuery({
    queryKey: ["order-financial-adjustment", task?.source_kind, task?.source_id],
    enabled: Boolean(task?.source_id),
    queryFn: async () => {
      if (!task) throw new Error("المهمة غير متاحة.");
      if (isShortage(task)) return fetchOrderShortageFinancialAdjustment(task.source_id);
      return fetchOrderSubstitutionFinancialAdjustment(task.source_id);
    },
    staleTime: 0,
  });

  const detail = detailQuery.data as FinanceDetail | undefined;
  const shortage = isShortage(task);
  const direction = detail?.direction || "refund";
  const heading = shortage
    ? "تأكيد رد قيمة الصنف الناقص"
    : direction === "refund" ? "تأكيد رد فرق البديل" : "تأكيد تحصيل فرق البديل";

  const sourceDescription = useMemo(() => {
    if (!detail) return "";
    if (isShortageDetail(detail)) {
      return `${detail.product_name} · ناقص ${qty(detail.shortage_quantity)} × ${money(detail.original_unit_price)}`;
    }
    return `${detail.original_product_name} ← ${detail.replacement_product_name}`;
  }, [detail]);

  const settle = async () => {
    if (!task || !detail || busy) return;
    if (providerReference.trim().length < 3) return toast.error("اكتب مرجع عملية مزود الدفع.");
    if (note.trim().length < 3) return toast.error("اكتب ملاحظة توضح العملية التي تمت.");
    setBusy(true);
    try {
      const result = shortage
        ? await settleOrderShortageFinancialAdjustment(detail.id, providerReference.trim(), note.trim())
        : await settleOrderSubstitutionFinancialAdjustment(detail.id, providerReference.trim(), note.trim());
      toast.success(`${direction === "refund" ? "تم تسجيل رد" : "تم تسجيل تحصيل"} ${money(Math.abs(result.signed_amount))} وتحديث إجمالي الطلب.`);
      onClose();
      await onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل التسوية المالية.");
      await detailQuery.refetch();
    } finally {
      setBusy(false);
    }
  };

  return <Dialog open={Boolean(task)} onOpenChange={open => !open && !busy && onClose()}>
    <DialogContent dir="rtl" className="max-w-xl">
      <DialogHeader><DialogTitle>{heading}</DialogTitle></DialogHeader>
      {detailQuery.isLoading ? <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#005931]" /></div>
        : detailQuery.isError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{detailQuery.error instanceof Error ? detailQuery.error.message : "تعذر تحميل بيانات التسوية."}</div>
        : detail ? <div className="space-y-4">
          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="font-black">{sourceDescription}</div>
            <p className="mt-1 text-sm text-muted-foreground">وسيلة الدفع: {detail.payment_method || "غير محددة"} · حالة الدفعة الأصلية: {detail.payment_status || "—"}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-muted-foreground">التسوية</div><div className={`mt-1 text-xl font-black ${direction === "refund" ? "text-emerald-700" : "text-amber-700"}`}>{direction === "refund" ? "رد " : "تحصيل "}{money(detail.amount)}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-muted-foreground">الإجمالي الحالي</div><div className="mt-1 text-xl font-black">{money(detail.order_total_before)}</div></div>
            <div className="rounded-xl bg-[#005931]/5 p-3"><div className="text-xs text-muted-foreground">بعد التسوية</div><div className="mt-1 text-xl font-black text-[#005931]">{money(detail.target_order_total)}</div></div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium leading-6 text-amber-900">نفّذ {direction === "refund" ? "الرد" : "التحصيل"} فعليًا في مزود الدفع أولًا. بعد إدخال المرجع، النظام يسجل حركة حقيقية في Payment Ledger ويعدّل إجمالي الطلب بشكل تراكمي وآمن.</div>
          <div className="space-y-2"><Label>مرجع عملية مزود الدفع</Label><Input value={providerReference} onChange={event => setProviderReference(event.target.value)} placeholder="رقم التحويل / مرجع المحفظة أو بوابة الدفع" /></div>
          <div className="space-y-2"><Label>ملاحظة التسوية</Label><Textarea value={note} onChange={event => setNote(event.target.value)} placeholder="ما الذي تم تنفيذه ومراجعته..." /></div>
        </div> : null}
      <DialogFooter className="gap-2 sm:justify-start">
        <Button variant="outline" onClick={onClose} disabled={busy}>إلغاء</Button>
        <Button onClick={() => void settle()} disabled={busy || !detail}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <WalletCards className="ml-2 h-4 w-4" />}{direction === "refund" ? "تأكيد الرد وتسجيله" : "تأكيد التحصيل وتسجيله"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
