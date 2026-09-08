import { Banknote, CreditCard, Landmark, RotateCcw, WalletCards } from "lucide-react";
import type { PosCashSummary } from "@/services/supabase/posCashService";

const money = (value: number) => `${Number(value || 0).toFixed(2)} ج.م`;

export default function PosShiftPaymentSummary({ summary }: { summary: PosCashSummary }) {
  return (
    <section className="space-y-3" aria-label="تحصيل الوردية حسب وسيلة الدفع">
      <div>
        <h3 className="font-semibold text-slate-900">التحصيل حسب وسيلة الدفع</h3>
        <p className="mt-1 text-sm text-slate-500">كل وسيلة تعرض الآن التحصيل والمرتجعات وصافي أثر الوردية، وللوسائل الإلكترونية يظهر أيضًا الرصيد الفعلي للحساب المرتبط بها.</p>
      </div>
      {summary.payment_breakdown.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">لا توجد تحصيلات بوسائل الدفع في هذه الوردية.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {summary.payment_breakdown.map((payment, index) => {
            const Icon = payment.method_type === "cash" ? Banknote : payment.method_type === "card" ? CreditCard : payment.method_type === "bank_transfer" ? Landmark : WalletCards;
            const hasRefunds = payment.confirmed_refund_amount > 0 || payment.pending_refund_amount > 0;
            return (
              <div key={`${payment.code}:${payment.name}:${payment.method_type}:${index}`} className="min-w-0 rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#005931]" />
                    <div className="min-w-0"><h4 className="break-words font-semibold">{payment.name}</h4><p className="text-sm text-slate-500">{payment.sale_count} عملية تحصيل</p></div>
                  </div>
                  {hasRefunds && <RotateCcw className="h-4 w-4 shrink-0 text-amber-700" aria-label="يوجد مرتجع" />}
                </div>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex flex-wrap justify-between gap-x-2"><dt>إجمالي المحصل</dt><dd className="font-bold tabular-nums text-[#005931]">{money(payment.charged_amount)}</dd></div>
                  <div className="flex flex-wrap justify-between gap-x-2 text-slate-600"><dt>قيمة البيع بعد الكوبون</dt><dd className="tabular-nums">{money(payment.base_amount)}</dd></div>
                  {payment.merchant_fee_amount > 0 && <div className="flex flex-wrap justify-between gap-x-2 text-slate-600"><dt>رسوم على النشاط</dt><dd className="tabular-nums">- {money(payment.merchant_fee_amount)}</dd></div>}
                  {payment.customer_fee_amount > 0 && <div className="flex flex-wrap justify-between gap-x-2 text-slate-600"><dt>رسوم حصلت من العميل</dt><dd className="tabular-nums">+ {money(payment.customer_fee_amount)}</dd></div>}
                  {payment.confirmed_refund_amount > 0 && (
                    <div className="flex flex-wrap justify-between gap-x-2 font-semibold text-red-700"><dt>مرتجعات تم تحويلها</dt><dd className="tabular-nums">- {money(payment.confirmed_refund_amount)}</dd></div>
                  )}
                  {payment.pending_refund_amount > 0 && (
                    <div className="flex flex-wrap justify-between gap-x-2 text-amber-800"><dt>مرتجعات بانتظار التحويل</dt><dd className="tabular-nums">{money(payment.pending_refund_amount)}</dd></div>
                  )}
                  <div className="flex flex-wrap justify-between gap-x-2 border-t pt-2"><dt>صافي أثر الوردية</dt><dd className={`font-black tabular-nums ${payment.net_shift_amount < 0 ? "text-red-700" : "text-[#005931]"}`}>{money(payment.net_shift_amount)}</dd></div>
                  {payment.account_balance !== null && (
                    <div className="mt-2 flex flex-wrap justify-between gap-x-2 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-900"><dt className="font-semibold">الرصيد الفعلي للحساب</dt><dd className="font-black tabular-nums">{money(payment.account_balance)}</dd></div>
                  )}
                </dl>
              </div>
            );
          })}
        </div>
      )}
      <dl className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><dt>كوبونات الولاء المستخدمة</dt><dd className="tabular-nums">{money(summary.loyalty_voucher_total)}</dd></div>
        <div className="flex flex-wrap justify-between gap-2 text-red-700"><dt>إجمالي مرتجعات إلكترونية مؤكدة</dt><dd className="font-semibold tabular-nums">- {money(summary.electronic_refunds_confirmed)}</dd></div>
        <div className="flex flex-wrap justify-between gap-2 text-amber-800"><dt>مرتجعات إلكترونية بانتظار الرد</dt><dd className="tabular-nums">{money(summary.electronic_refunds_pending)}</dd></div>
      </dl>
    </section>
  );
}
