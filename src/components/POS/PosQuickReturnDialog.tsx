import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, Gift, RefreshCw, RotateCcw, Scale, WalletCards } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Sale } from "@/types";
import {
  confirmPosCardRefund,
  confirmPosPaymentRefundV3,
  getPosSaleReturnPreview,
  submitPosQuickReturn,
  type PosQuickReturnResult,
  type PosReturnPaymentPartV3,
  type PosReturnPreview,
  type PosReturnPreviewLine,
} from "@/services/supabase/posReturnService";

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} ج.م`;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function estimateLineRefund(line: PosReturnPreviewLine, quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0 || line.available_quantity <= 0) return 0;
  const safe = Math.min(quantity, line.available_quantity);
  if (Math.abs(safe - line.available_quantity) < 0.0005) return Number(line.remaining_amount || 0);
  return Math.min(Number(line.remaining_amount || 0), round2((Number(line.line_total || 0) / Number(line.sold_quantity || 1)) * safe));
}

function estimateSplit(preview: PosReturnPreview, currentReturnTotal: number) {
  if (currentReturnTotal <= 0 || preview.sale_total <= 0) return { cash: 0, card: 0, loyalty: 0, customerMoney: 0 };

  const targetTotal = round2(Number(preview.returned_total || 0) + currentReturnTotal);
  const originalLoyalty = Math.max(0, Math.min(Number(preview.loyalty_voucher_amount || 0), Number(preview.sale_total || 0)));
  const targetLoyalty = originalLoyalty > 0
    ? targetTotal >= Number(preview.sale_total) - 0.009
      ? originalLoyalty
      : Math.min(originalLoyalty, round2(targetTotal * originalLoyalty / Number(preview.sale_total || 1)))
    : 0;
  const loyalty = Math.max(0, round2(targetLoyalty - Number(preview.returned_loyalty || 0)));
  const customerMoney = Math.max(0, round2(currentReturnTotal - loyalty));

  const paidTotal = Math.max(0, Number(preview.amount_paid ?? (preview.sale_total - originalLoyalty)));
  const originalCash = preview.payment_method === "cash"
    ? paidTotal
    : preview.payment_method === "card"
      ? 0
      : Math.max(0, Math.min(paidTotal, Number(preview.cash_amount || 0)));

  const targetPaid = Math.max(0, round2(targetTotal - targetLoyalty));
  const targetCash = paidTotal <= 0
    ? 0
    : targetTotal >= Number(preview.sale_total) - 0.009
      ? originalCash
      : Math.min(originalCash, round2(targetPaid * originalCash / paidTotal));
  const cash = Math.max(0, Math.min(customerMoney, round2(targetCash - Number(preview.returned_cash || 0))));
  const card = Math.max(0, round2(customerMoney - cash));

  return { cash, card, loyalty, customerMoney };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale | null;
  onSuccess?: () => void;
};

export default function PosQuickReturnDialog({ open, onOpenChange, sale, onSuccess }: Props) {
  const [preview, setPreview] = useState<PosReturnPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingCard, setConfirmingCard] = useState(false);
  const [confirmingRefundId, setConfirmingRefundId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<PosQuickReturnResult | null>(null);
  const [providerReference, setProviderReference] = useState("");
  const [providerReferences, setProviderReferences] = useState<Record<string, string>>({});
  const [cardConfirmed, setCardConfirmed] = useState(false);

  const reset = () => {
    setPreview(null);
    setError(null);
    setSelected({});
    setQuantities({});
    setReason("");
    setResult(null);
    setProviderReference("");
    setProviderReferences({});
    setCardConfirmed(false);
    setConfirmingRefundId(null);
  };

  useEffect(() => {
    if (!open || !sale?.id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getPosSaleReturnPreview(sale.id)
      .then(data => {
        if (cancelled) return;
        setPreview(data);
        setSelected({});
        setQuantities(Object.fromEntries(data.lines.map(line => [line.line_index, Number(line.available_quantity).toFixed(line.weight_based ? 3 : 0)])));
      })
      .catch((e: any) => { if (!cancelled) setError(e.message || "تعذر تحميل الفاتورة للمرتجع"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, sale?.id]);

  const selectedLines = useMemo(() => {
    if (!preview) return [];
    return preview.lines
      .filter(line => selected[line.line_index])
      .map(line => ({ line, quantity: Number(quantities[line.line_index] || 0) }))
      .filter(row => Number.isFinite(row.quantity) && row.quantity > 0);
  }, [preview, selected, quantities]);

  const returnTotal = useMemo(
    () => round2(selectedLines.reduce((sum, row) => sum + estimateLineRefund(row.line, row.quantity), 0)),
    [selectedLines],
  );
  const split = useMemo(
    () => preview ? estimateSplit(preview, returnTotal) : { cash: 0, card: 0, loyalty: 0, customerMoney: 0 },
    [preview, returnTotal],
  );

  const originalPaymentName = preview?.payment_method_name || (preview?.payment_method === "cash" ? "نقدي" : preview?.payment_method === "mixed" ? "دفع مختلط" : "وسيلة الدفع الإلكترونية");
  const electronicRefundName = result?.refund_payment_method_name || originalPaymentName || "وسيلة الدفع الإلكترونية";
  const originalPaymentBreakdown = Array.isArray(preview?.payment_breakdown) ? preview!.payment_breakdown!.filter(part => Number(part.base_amount || 0) > 0) : [];
  const refundBreakdown = Array.isArray(result?.refund_breakdown) ? result!.refund_breakdown! : [];
  const isMixedRefundV3 = Number(result?.return_version || 0) >= 3 && refundBreakdown.length > 0;
  const pendingMixedRefunds = isMixedRefundV3 ? refundBreakdown.filter(part => part.status === "pending" && part.method_type !== "cash") : [];
  const mixedRefundComplete = isMixedRefundV3 && pendingMixedRefunds.length === 0;

  const allAvailableSelected = Boolean(preview?.lines.filter(line => line.available_quantity > 0).length)
    && preview!.lines.filter(line => line.available_quantity > 0).every(line => selected[line.line_index]);

  const toggleAll = () => {
    if (!preview) return;
    const next = !allAvailableSelected;
    setSelected(Object.fromEntries(preview.lines.map(line => [line.line_index, next && line.available_quantity > 0])));
  };

  const submit = async () => {
    if (!preview) return;
    if (reason.trim().length < 3) {
      setError("اكتب سبب المرتجع بوضوح قبل التنفيذ.");
      return;
    }
    for (const row of selectedLines) {
      if (row.quantity > row.line.available_quantity + 0.0004) {
        setError(`${row.line.product_name}: الكمية أكبر من المتاح للإرجاع.`);
        return;
      }
      if (!row.line.weight_based && !Number.isInteger(row.quantity)) {
        setError(`${row.line.product_name}: الكمية لازم تكون رقمًا صحيحًا.`);
        return;
      }
    }
    if (!selectedLines.length || returnTotal <= 0) {
      setError("اختار صنفًا واحدًا على الأقل للإرجاع.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const response = await submitPosQuickReturn(
        preview,
        selectedLines.map(row => ({ line_index: row.line.line_index, quantity: row.quantity })),
        reason,
      );
      setResult(response);
      setProviderReferences({});
      onSuccess?.();
    } catch (e: any) {
      setError(e.message || "تعذر تنفيذ المرتجع");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmElectronicRefund = async () => {
    if (!result?.card_refund_id) return;
    try {
      setConfirmingCard(true);
      setError(null);
      await confirmPosCardRefund(result.card_refund_id, providerReference);
      setCardConfirmed(true);
      setResult(prev => prev ? { ...prev, refund_status: "completed", card_refund_pending: false } : prev);
      onSuccess?.();
    } catch (e: any) {
      setError(e.message || `تعذر تأكيد رد ${electronicRefundName}`);
    } finally {
      setConfirmingCard(false);
    }
  };

  const confirmMixedRefund = async (part: PosReturnPaymentPartV3) => {
    const reference = (providerReferences[part.id] || "").trim();
    if (reference.length < 3) {
      setError(`اكتب مرجع رد ${part.name || "وسيلة الدفع"}.`);
      return;
    }
    try {
      setConfirmingRefundId(part.id);
      setError(null);
      const confirmation = await confirmPosPaymentRefundV3(part.id, reference);
      setResult(prev => {
        if (!prev) return prev;
        const updatedBreakdown = (prev.refund_breakdown || []).map(row => row.id === part.id
          ? { ...row, status: "confirmed" as const, provider_reference: reference }
          : row);
        const stillPending = updatedBreakdown.filter(row => row.status === "pending" && row.method_type !== "cash");
        return {
          ...prev,
          refund_breakdown: updatedBreakdown,
          payment_refunds_pending: stillPending,
          refund_status: stillPending.length === 0 || confirmation.return_status === "completed" ? "completed" : prev.refund_status,
          card_refund_pending: stillPending.length > 0,
        };
      });
      onSuccess?.();
    } catch (e: any) {
      setError(e.message || `تعذر تأكيد رد ${part.name || "وسيلة الدفع"}`);
    } finally {
      setConfirmingRefundId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => {
      if (submitting || confirmingCard || confirmingRefundId) return;
      if (!next) reset();
      onOpenChange(next);
    }}>
      <DialogContent dir="rtl" className="max-h-[94vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-[#005931]" /> مرتجع سريع من الفاتورة</DialogTitle>
          <DialogDescription>{sale?.invoice_number || "الفاتورة"} · المبلغ المدفوع وكوبون الخصم يتم إرجاع كل جزء إلى مصدره تلقائيًا.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> جاري مراجعة الفاتورة والمرتجعات السابقة</div>
        ) : result ? (
          <div className="space-y-4">
            <div className="rounded-3xl bg-emerald-50 p-5 text-center text-emerald-900">
              <CheckCircle2 className="mx-auto mb-2 h-9 w-9 text-[#005931]" />
              <div className="text-lg font-black">تم تسجيل المرتجع</div>
              <div className="mt-1 text-2xl font-black">{money(result.total_amount)}</div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Gift className="h-4 w-4" /> رجع لكوبون الخصم</div><div className="mt-1 text-xl font-black text-amber-700">{money(result.refund_loyalty_amount)}</div></div>
              <div className="rounded-2xl border p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Banknote className="h-4 w-4" /> رد نقدي من الدرج</div><div className="mt-1 text-xl font-black">{money(result.refund_cash_amount)}</div></div>
              <div className="rounded-2xl border p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><WalletCards className="h-4 w-4" /> إجمالي الرد الإلكتروني</div><div className="mt-1 text-xl font-black">{money(result.refund_card_amount)}</div></div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">إجمالي يرجع للعميل كفلوس</span><strong>{money(result.refund_customer_money)}</strong></div>
              {result.refund_loyalty_amount > 0 && <p className="mt-2 text-xs leading-5 text-slate-500">جزء كوبون الخصم رجع لنفس الكوبون، لذلك لا يخرج من درج الكاشير ولا من وسيلة الدفع.</p>}
            </div>

            {isMixedRefundV3 && (
              <div className="space-y-3 rounded-2xl border bg-white p-4">
                <div>
                  <div className="font-black">توزيع المرتجع على وسائل الدفع الأصلية</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">كل وسيلة إلكترونية لها عملية رد ومرجع تأكيد مستقل. الجزء النقدي تم رده من درج الوردية.</p>
                </div>
                <div className="space-y-2">
                  {refundBreakdown.map(part => {
                    const isCash = part.method_type === "cash";
                    const done = part.status === "completed" || part.status === "confirmed";
                    return (
                      <div key={part.id} className={`rounded-xl border p-3 ${done ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-bold">{part.name || part.code || "وسيلة دفع"}</div>
                            {part.original_payment_reference && <div className="mt-0.5 break-all text-[11px] text-muted-foreground">مرجع البيع: {part.original_payment_reference}</div>}
                          </div>
                          <div className="text-left">
                            <div className="font-black">{money(Number(part.base_refund_amount || 0))}</div>
                            <Badge variant={done ? "secondary" : "outline"}>{isCash ? "تم الرد نقدًا" : done ? "تم التأكيد" : "بانتظار التأكيد"}</Badge>
                          </div>
                        </div>
                        {part.provider_reference && <div className="mt-2 text-xs text-emerald-800">مرجع الرد: <span dir="ltr" className="font-bold">{part.provider_reference}</span></div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {isMixedRefundV3 && pendingMixedRefunds.map(part => {
              const name = part.name || part.code || "وسيلة الدفع";
              const reference = providerReferences[part.id] || "";
              const busy = confirmingRefundId === part.id;
              return (
                <div key={`confirm-${part.id}`} className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
                  <div className="font-bold text-amber-900">متبقي تأكيد رد {name}</div>
                  <p className="text-sm leading-6 text-amber-800">نفّذ رد {money(Number(part.base_refund_amount || 0))} على {name}، ثم اكتب مرجع عملية الرد الخاصة بهذه الوسيلة. لا تستخدم مرجع وسيلة أخرى.</p>
                  {part.original_payment_reference && <Badge variant="outline">مرجع البيع الأصلي: {part.original_payment_reference}</Badge>}
                  <div className="space-y-2">
                    <Label>مرجع رد {name}</Label>
                    <Input
                      value={reference}
                      onChange={event => setProviderReferences(prev => ({ ...prev, [part.id]: event.target.value }))}
                      placeholder={`مرجع رد ${name}`}
                      disabled={Boolean(confirmingRefundId)}
                    />
                  </div>
                  <Button className="w-full bg-[#005931] hover:bg-[#004a29]" disabled={Boolean(confirmingRefundId) || reference.trim().length < 3} onClick={() => void confirmMixedRefund(part)}>
                    {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} تأكيد رد {name}
                  </Button>
                </div>
              );
            })}

            {!isMixedRefundV3 && result.refund_card_amount > 0 && !cardConfirmed && result.card_refund_pending && (
              <div className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <div className="font-bold text-amber-900">متبقي تأكيد رد {electronicRefundName}</div>
                <p className="text-sm leading-6 text-amber-800">نفّذ رد {money(result.refund_card_amount)} على {electronicRefundName}، وبعدها اكتب رقم مرجع عملية الرد هنا. المخزون والجزء النقدي وكوبون الخصم تم تسجيلهم بالفعل.</p>
                <div className="space-y-2"><Label>مرجع رد {electronicRefundName}</Label><Input value={providerReference} onChange={event => setProviderReference(event.target.value)} placeholder="مثال: REF-123456" /></div>
                <Button className="w-full bg-[#005931] hover:bg-[#004a29]" disabled={confirmingCard || providerReference.trim().length < 3} onClick={() => void confirmElectronicRefund()}>
                  {confirmingCard ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} تأكيد رد {electronicRefundName}
                </Button>
              </div>
            )}

            {(mixedRefundComplete || (!isMixedRefundV3 && (cardConfirmed || result.refund_card_amount === 0))) && <Alert className="border-emerald-200 bg-emerald-50"><CheckCircle2 className="h-4 w-4 text-emerald-700" /><AlertDescription>المرتجع مكتمل ماليًا ومخزنيًا، وتمت إعادة جزء الولاء للكوبون إن وجد.</AlertDescription></Alert>}
            <Button variant="outline" className="h-11 w-full" disabled={Boolean(confirmingRefundId) || confirmingCard} onClick={() => onOpenChange(false)}>إغلاق</Button>
          </div>
        ) : preview ? (
          <div className="space-y-5">
            {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

            {originalPaymentBreakdown.length > 1 ? (
              <div className="space-y-3 rounded-xl border bg-white p-3 text-sm">
                <div className="flex items-center gap-2">
                  <WalletCards className="h-4 w-4 text-[#005931]" />
                  <span className="text-muted-foreground">الدفع الأصلي:</span>
                  <strong>دفع مختلط · {originalPaymentBreakdown.length} وسائل</strong>
                </div>
                <div className="space-y-2 border-t pt-2">
                  {originalPaymentBreakdown.map((part, index) => (
                    <div key={`${part.payment_method_id || part.code || "payment"}-${index}`} className="rounded-lg bg-slate-50 p-2.5">
                      <div className="flex items-center justify-between gap-3"><strong>{part.name || part.code || "وسيلة دفع"}</strong><strong>{money(Number(part.charged_amount ?? part.base_amount ?? 0))}</strong></div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        {part.reference && <span>مرجع البيع: {part.reference}</span>}
                        {Number(part.customer_fee_amount || 0) > 0 && <span>رسوم العميل: {money(Number(part.customer_fee_amount || 0))}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3 text-sm">
                <WalletCards className="h-4 w-4 text-[#005931]" />
                <span className="text-muted-foreground">وسيلة الدفع الأصلية:</span>
                <strong>{originalPaymentName}</strong>
                {preview.payment_reference && <Badge variant="outline">مرجع البيع: {preview.payment_reference}</Badge>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] text-muted-foreground">قيمة الفاتورة</div><strong>{money(preview.sale_total)}</strong></div>
              <div className="rounded-xl bg-amber-50 p-3"><div className="text-[11px] text-amber-700">كوبون الخصم</div><strong className="text-amber-800">{money(preview.loyalty_voucher_amount)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] text-muted-foreground">المحصّل من العميل</div><strong>{money(preview.amount_charged ?? preview.amount_paid)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] text-muted-foreground">متبقي من قيمة المنتجات</div><strong className="text-[#005931]">{money(preview.remaining_total)}</strong></div>
            </div>

            {Number(preview.customer_payment_fee_amount || 0) > 0 && preview.payment_fee_refundable === false && (
              <Alert className="border-amber-200 bg-amber-50"><AlertTriangle className="h-4 w-4 text-amber-700" /><AlertDescription>المبلغ المحصّل يتضمن رسوم وسيلة دفع بقيمة {money(Number(preview.customer_payment_fee_amount || 0))}. رسوم وسيلة الدفع منفصلة عن قيمة المنتجات ولا تدخل تلقائيًا في حساب مرتجع الأصناف.</AlertDescription></Alert>
            )}

            {preview.returned_total > 0 && (
              <div className="rounded-xl border bg-white p-3 text-xs text-muted-foreground">
                مرتجعات سابقة: {money(preview.returned_total)} · رجع منها للكوبون {money(preview.returned_loyalty)} · رجع كفلوس {money(preview.returned_customer_money)}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="font-bold">اختر المنتجات والكميات</div>
              <Button variant="outline" size="sm" onClick={toggleAll}>{allAvailableSelected ? "إلغاء تحديد الكل" : "تحديد المتاح كله"}</Button>
            </div>

            <div className="space-y-2">
              {preview.lines.map(line => {
                const available = Number(line.available_quantity || 0);
                const isSelected = Boolean(selected[line.line_index]);
                const qty = quantities[line.line_index] ?? "";
                return (
                  <div key={line.line_index} className={`rounded-2xl border p-4 ${available <= 0 ? "bg-slate-50 opacity-60" : isSelected ? "border-[#005931]/30 bg-emerald-50/30" : "bg-white"}`}>
                    <div className="flex items-start gap-3">
                      <Checkbox disabled={available <= 0} checked={isSelected} onCheckedChange={value => setSelected(prev => ({ ...prev, [line.line_index]: Boolean(value) }))} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{line.product_name}</span>{line.weight_based && <Badge variant="secondary"><Scale className="ml-1 h-3 w-3" /> موزون</Badge>}{line.is_bulk && <Badge variant="secondary">جملة</Badge>}</div>
                        <div className="mt-1 text-xs text-muted-foreground">اتباع {line.sold_quantity}{line.weight_based ? " كجم" : " وحدة"} · سبق إرجاع {line.returned_quantity} · المتاح {line.available_quantity}</div>
                        <div className="mt-1 text-xs text-muted-foreground">المتبقي من قيمة السطر {money(line.remaining_amount)}</div>
                      </div>
                      <div className="w-28 shrink-0">
                        <Label className="text-[11px]">كمية المرتجع</Label>
                        <Input
                          disabled={!isSelected || available <= 0}
                          type="number"
                          min={line.weight_based ? "0.001" : "1"}
                          max={available}
                          step={line.weight_based ? "0.001" : "1"}
                          inputMode={line.weight_based ? "decimal" : "numeric"}
                          value={qty}
                          onChange={event => setQuantities(prev => ({ ...prev, [line.line_index]: event.target.value }))}
                          className="mt-1 h-9 text-center"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2"><Label>سبب المرتجع — إجباري</Label><Textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="مثال: المنتج تالف / العميل رجع المنتج بحالته" /></div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between text-sm"><span>إجمالي المرتجع المتوقع</span><strong className="text-xl">{money(returnTotal)}</strong></div>
              <div className="mt-3 grid grid-cols-1 gap-2 border-t pt-3 sm:grid-cols-3">
                <div className="rounded-xl bg-amber-50 p-3"><div className="flex items-center gap-1 text-xs text-amber-700"><Gift className="h-3.5 w-3.5" /> يرجع لكوبون الخصم</div><strong className="text-amber-800">{money(split.loyalty)}</strong></div>
                <div className="rounded-xl bg-white p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground"><Banknote className="h-3.5 w-3.5" /> من درج الكاشير</div><strong>{money(split.cash)}</strong></div>
                <div className="rounded-xl bg-white p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground"><WalletCards className="h-3.5 w-3.5" /> رد إلكتروني</div><strong>{money(split.card)}</strong></div>
              </div>
              {originalPaymentBreakdown.length > 1 && split.card > 0 && <p className="mt-3 text-xs leading-5 text-slate-500">بعد تسجيل المرتجع سيقسم النظام الجزء الإلكتروني تلقائيًا على نفس وسائل الدفع الأصلية، ويطلب مرجع رد منفصل لكل وسيلة.</p>}
              {split.loyalty > 0 && <p className="mt-3 text-xs leading-5 text-slate-500">الكوبون لا يُرد كاش. الجزء الخاص به يرجع لرصيد نفس كوبون الخصم، والمبلغ المدفوع فقط يرجع إلى مصدر الدفع الأصلي.</p>}
            </div>

            <Button className="h-12 w-full bg-[#005931] hover:bg-[#004a29]" disabled={submitting || returnTotal <= 0 || reason.trim().length < 3} onClick={() => void submit()}>
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} {submitting ? "جاري تنفيذ المرتجع..." : `تنفيذ المرتجع · ${money(returnTotal)}`}
            </Button>
          </div>
        ) : (
          <Alert variant="destructive"><AlertDescription>{error || "تعذر تحميل الفاتورة للمرتجع."}</AlertDescription></Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
