import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, CreditCard, RefreshCw, RotateCcw, Scale } from "lucide-react";
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
  getPosSaleReturnPreview,
  submitPosQuickReturn,
  type PosQuickReturnResult,
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
  if (currentReturnTotal <= 0 || preview.sale_total <= 0) return { cash: 0, card: 0 };
  const targetTotal = round2(preview.returned_total + currentReturnTotal);
  const targetCash = targetTotal >= preview.sale_total - 0.009
    ? Number(preview.cash_amount || 0)
    : Math.min(Number(preview.cash_amount || 0), round2(targetTotal * Number(preview.cash_amount || 0) / Number(preview.sale_total || 1)));
  const cash = Math.max(0, Math.min(currentReturnTotal, round2(targetCash - Number(preview.returned_cash || 0))));
  return { cash, card: round2(currentReturnTotal - cash) };
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
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<PosQuickReturnResult | null>(null);
  const [providerReference, setProviderReference] = useState("");
  const [cardConfirmed, setCardConfirmed] = useState(false);

  const reset = () => {
    setPreview(null);
    setError(null);
    setSelected({});
    setQuantities({});
    setReason("");
    setResult(null);
    setProviderReference("");
    setCardConfirmed(false);
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
  const split = useMemo(() => preview ? estimateSplit(preview, returnTotal) : { cash: 0, card: 0 }, [preview, returnTotal]);

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
      onSuccess?.();
    } catch (e: any) {
      setError(e.message || "تعذر تنفيذ المرتجع");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmCard = async () => {
    if (!result?.card_refund_id) return;
    try {
      setConfirmingCard(true);
      setError(null);
      await confirmPosCardRefund(result.card_refund_id, providerReference);
      setCardConfirmed(true);
      setResult(prev => prev ? { ...prev, refund_status: "completed", card_refund_pending: false } : prev);
      onSuccess?.();
    } catch (e: any) {
      setError(e.message || "تعذر تأكيد رد البطاقة");
    } finally {
      setConfirmingCard(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => {
      if (submitting || confirmingCard) return;
      if (!next) reset();
      onOpenChange(next);
    }}>
      <DialogContent dir="rtl" className="max-h-[94vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-[#005931]" /> مرتجع سريع من الفاتورة</DialogTitle>
          <DialogDescription>{sale?.invoice_number || "الفاتورة"} · المرتجع مرتبط بالوردية والجهاز الحاليين ويتم تسجيله Atomic.</DialogDescription>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Banknote className="h-4 w-4" /> رد نقدي من الدرج</div><div className="mt-1 text-xl font-black">{money(result.refund_cash_amount)}</div></div>
              <div className="rounded-2xl border p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><CreditCard className="h-4 w-4" /> رد بطاقة</div><div className="mt-1 text-xl font-black">{money(result.refund_card_amount)}</div></div>
            </div>

            {result.refund_card_amount > 0 && !cardConfirmed && result.card_refund_pending && (
              <div className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <div className="font-bold text-amber-900">متبقي تأكيد رد البطاقة</div>
                <p className="text-sm leading-6 text-amber-800">نفّذ رد {money(result.refund_card_amount)} على جهاز/مزود البطاقة، وبعدها اكتب رقم مرجع العملية هنا. المخزون والجزء النقدي تم تسجيلهم بالفعل.</p>
                <div className="space-y-2"><Label>مرجع رد البطاقة</Label><Input value={providerReference} onChange={event => setProviderReference(event.target.value)} placeholder="مثال: REF-123456" /></div>
                <Button className="w-full bg-[#005931] hover:bg-[#004a29]" disabled={confirmingCard || providerReference.trim().length < 3} onClick={() => void confirmCard()}>
                  {confirmingCard ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} تأكيد رد البطاقة
                </Button>
              </div>
            )}

            {(cardConfirmed || result.refund_card_amount === 0) && <Alert className="border-emerald-200 bg-emerald-50"><CheckCircle2 className="h-4 w-4 text-emerald-700" /><AlertDescription>المرتجع مكتمل ماليًا ومخزنيًا.</AlertDescription></Alert>}
            <Button variant="outline" className="h-11 w-full" onClick={() => onOpenChange(false)}>إغلاق</Button>
          </div>
        ) : preview ? (
          <div className="space-y-5">
            {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] text-muted-foreground">قيمة الفاتورة</div><strong>{money(preview.sale_total)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] text-muted-foreground">مرتجع سابق</div><strong>{money(preview.returned_total)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] text-muted-foreground">متبقي للإرجاع</div><strong className="text-[#005931]">{money(preview.remaining_total)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] text-muted-foreground">طريقة الدفع</div><strong>{preview.payment_method === "mixed" ? "مختلط" : preview.payment_method === "card" ? "بطاقة" : "نقدي"}</strong></div>
            </div>

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
              <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3">
                <div className="rounded-xl bg-white p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground"><Banknote className="h-3.5 w-3.5" /> من درج الكاشير</div><strong>{money(split.cash)}</strong></div>
                <div className="rounded-xl bg-white p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground"><CreditCard className="h-3.5 w-3.5" /> رد بطاقة</div><strong>{money(split.card)}</strong></div>
              </div>
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
