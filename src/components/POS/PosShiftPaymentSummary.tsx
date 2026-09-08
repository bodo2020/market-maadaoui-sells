import { Banknote, CreditCard, Landmark, WalletCards } from "lucide-react";
import type { PosCashSummary } from "@/services/supabase/posCashService";

const money = (value: number) => `${value.toFixed(2)} ج.م`;

export default function PosShiftPaymentSummary({ summary }: { summary: PosCashSummary }) {
  return (
    <section className="space-y-3" aria-label="تحصيل الوردية حسب وسيلة الدفع">
      <div>
        <h3 className="font-semibold text-slate-900">التحصيل حسب وسيلة الدفع</h3>
        <p className="mt-1 text-sm text-slate-500">تحصيل مبيعات هذه الوردية قبل المرتجعات والتوريدات، وليس الرصيد الحالي للمحفظة أو الحساب البنكي.</p>
      </div>
      {summary.payment_breakdown.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">لا توجد تحصيلات بوسائل الدفع في هذه الوردية.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {summary.payment_breakdown.map((payment, index) => {
            const Icon = payment.method_type === "cash" ? Banknote : payment.method_type === "card" ? CreditCard : payment.method_type === "bank_transfer" ? Landmark : WalletCards;
            return (
              <div key={`${payment.code}:${payment.name}:${payment.method_type}:${index}`} className="min-w-0 rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start gap-2">
                  <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#005931]" />
                  <div className="min-w-0"><h4 className="break-words font-semibold">{payment.name}</h4><p className="text-sm text-slate-500">{payment.sale_count} عملية تحصيل</p></div>
                </div>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex flex-wrap justify-between gap-x-2"><dt>المحصل من العميل</dt><dd className="font-bold tabular-nums text-[#005931]">{money(payment.charged_amount)}</dd></div>
                  <div className="flex flex-wrap justify-between gap-x-2 text-slate-600"><dt>قيمة البيع بعد الكوبون</dt><dd className="tabular-nums">{money(payment.base_amount)}</dd></div>
                  <div className="flex flex-wrap justify-between gap-x-2 text-slate-600"><dt>رسوم على العميل</dt><dd className="tabular-nums">{money(payment.customer_fee_amount)}</dd></div>
                  <div className="flex flex-wrap justify-between gap-x-2 text-slate-600"><dt>رسوم على النشاط</dt><dd className="tabular-nums">{money(payment.merchant_fee_amount)}</dd></div>
                  <div className="flex flex-wrap justify-between gap-x-2 border-t pt-2"><dt>صافي التحصيل بعد الرسوم</dt><dd className="font-semibold tabular-nums">{money(payment.charged_amount - payment.fee_amount)}</dd></div>
                </dl>
              </div>
            );
          })}
        </div>
      )}
      <dl className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><dt>كوبونات الولاء المستخدمة</dt><dd className="tabular-nums">{money(summary.loyalty_voucher_total)}</dd></div>
        <div className="flex flex-wrap justify-between gap-2"><dt>مرتجعات إلكترونية مؤكدة</dt><dd className="tabular-nums">{money(summary.electronic_refunds_confirmed)}</dd></div>
        <div className="flex flex-wrap justify-between gap-2 text-amber-800"><dt>مرتجعات إلكترونية بانتظار الرد</dt><dd className="tabular-nums">{money(summary.electronic_refunds_pending)}</dd></div>
      </dl>
    </section>
  );
}
