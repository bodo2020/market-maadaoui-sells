import { Check, RotateCcw, ShieldCheck } from "lucide-react";
import PaymentMethodBrand from "@/components/payments/PaymentMethodBrand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PosShiftReconciliationPreview } from "@/services/supabase/posShiftService";

type Props = {
  preview: PosShiftReconciliationPreview;
  values: Record<string, string>;
  reasons: Record<string, string>;
  onValueChange: (code: string, value: string) => void;
  onReasonChange: (code: string, value: string) => void;
};

const money = (value: number | null | undefined) => `${Number(value || 0).toFixed(2)} ج.م`;

export function reconciliationVariance(expected: number, raw: string) {
  if (!raw.trim()) return null;
  const counted = Number(raw);
  if (!Number.isFinite(counted)) return null;
  return Math.round((counted - expected) * 100) / 100;
}

export default function PosShiftReconciliationForm({ preview, values, reasons, onValueChange, onReasonChange }: Props) {
  return (
    <section className="space-y-4" aria-label="مطابقة وسائل الدفع عند إغلاق الوردية">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#005931]" />
          <div>
            <h3 className="font-bold text-emerald-950">تأكيد عهدة الوردية حسب كل وسيلة دفع</h3>
            <p className="mt-1 text-xs leading-5 text-emerald-900/75">راجع النقد الموجود فعليًا في الدرج، وللدفع الإلكتروني اكتب صافي حركة الوردية الظاهر في المحفظة أو ماكينة/بوابة الدفع. أي فرق لازم يتسجل له سبب.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {preview.methods.map((method) => {
          const raw = values[method.code] ?? "";
          const variance = reconciliationVariance(method.expected_amount, raw);
          const hasDifference = variance !== null && Math.abs(variance) >= 0.01;
          const isValid = raw.trim() !== "" && Number.isFinite(Number(raw)) && !(method.method_type === "cash" && Number(raw) < 0);
          return (
            <div key={method.code} className={`rounded-2xl border p-4 ${hasDifference ? "border-amber-300 bg-amber-50/30" : "border-slate-200 bg-white"}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <PaymentMethodBrand method={method} compact />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-slate-900">{method.name}</h4>
                      {method.method_type === "cash" ? <Badge variant="secondary">درج الكاشير</Badge> : <Badge variant="outline">{method.sale_count} عملية</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {method.method_type === "cash" ? "الرصيد المتوقع في الدرج لحظة الإغلاق" : "صافي التحصيل بعد الرسوم والمرتجعات المؤكدة داخل الوردية"}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-2 text-left sm:min-w-[145px]">
                  <div className="text-[11px] text-slate-500">المتوقع بالنظام</div>
                  <div className={`font-black tabular-nums ${method.expected_amount < 0 ? "text-red-700" : "text-[#005931]"}`}>{money(method.expected_amount)}</div>
                </div>
              </div>

              {method.method_type !== "cash" && (
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 p-2"><span className="text-slate-500">المحصل</span><strong className="mr-2 tabular-nums">{money(method.charged_amount)}</strong></div>
                  <div className="rounded-xl bg-slate-50 p-2"><span className="text-slate-500">مرتجع مؤكد</span><strong className="mr-2 tabular-nums">{money(method.confirmed_refund_amount)}</strong></div>
                  <div className="rounded-xl bg-slate-50 p-2"><span className="text-slate-500">رصيد الحساب الحالي</span><strong className="mr-2 tabular-nums">{method.account_balance === null ? "—" : money(method.account_balance)}</strong></div>
                </div>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor={`reconcile-${method.code}`}>{method.method_type === "cash" ? "النقد المعدود فعليًا" : "المبلغ الفعلي المؤكد للوردية"}</Label>
                  <div className="relative">
                    <Input
                      id={`reconcile-${method.code}`}
                      inputMode="decimal"
                      value={raw}
                      onChange={(event) => onValueChange(method.code, event.target.value)}
                      placeholder="0.00"
                      className="h-11 pl-14 text-base tabular-nums"
                    />
                    <span className="absolute inset-y-0 left-3 flex items-center text-xs text-slate-500">ج.م</span>
                  </div>
                </div>
                <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => onValueChange(method.code, method.expected_amount.toFixed(2))}>
                  <Check className="h-4 w-4" /> مطابق
                </Button>
              </div>

              {isValid && variance !== null && (
                <div className={`mt-3 flex items-center justify-between rounded-xl px-3 py-2 text-sm ${hasDifference ? "bg-amber-100 text-amber-950" : "bg-emerald-50 text-emerald-900"}`}>
                  <span>{hasDifference ? "الفرق المسجل" : "مطابق للنظام"}</span>
                  <strong className="tabular-nums">{money(variance)}</strong>
                </div>
              )}

              {hasDifference && (
                <div className="mt-3 space-y-1.5">
                  <Label htmlFor={`reason-${method.code}`} className="flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" /> سبب الفرق — إجباري</Label>
                  <Input id={`reason-${method.code}`} value={reasons[method.code] ?? ""} onChange={(event) => onReasonChange(method.code, event.target.value)} placeholder="مثلاً: فرق عد، تحويل غير ظاهر، عملية معلقة..." />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
