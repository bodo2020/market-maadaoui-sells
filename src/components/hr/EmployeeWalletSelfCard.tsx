import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import JsBarcode from "jsbarcode";
import {
  Banknote,
  Barcode,
  CalendarCheck2,
  CalendarClock,
  Clock3,
  Coins,
  CreditCard,
  Gift,
  Loader2,
  ReceiptText,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyEmployeePurchaseProfile } from "@/services/employeeWalletService";
import { useBranchStore } from "@/stores/branchStore";
import { siteConfig } from "@/config/site";

const money = (value?: number | null) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;
const fmtDate = (value?: string | null) => value ? new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value)) : "—";
const fmtDateTime = (value: string) => new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const entryLabels: Record<string, string> = {
  benefit_topup: "إضافة رصيد مزايا",
  employee_purchase: "مشتريات موظف",
  credit_payment: "سداد آجل",
  payroll_settlement: "تسوية مع الراتب",
  refund: "مرتجع",
  adjustment: "تسوية حساب",
  points_earn: "نقاط مشتريات",
  points_reversal: "عكس نقاط مرتجع",
};

function EmployeeBarcode({ value }: { value?: string | null }) {
  const ref = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        displayValue: false,
        lineColor: "#111111",
        background: "#ffffff",
        width: 1.65,
        height: 58,
        margin: 0,
      });
    } catch {
      ref.current.innerHTML = "";
    }
  }, [value]);
  if (!value) return <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">جاري تجهيز باركود الموظف.</div>;
  return (
    <div className="rounded-2xl border bg-white p-4 text-center">
      <svg ref={ref} className="mx-auto max-w-full" aria-label="باركود الموظف" />
      <div className="mt-2 font-mono text-sm font-black tracking-[0.14em]" dir="ltr">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">بطاقة الموظف · تبدأ بـ 297</div>
    </div>
  );
}

export default function EmployeeWalletSelfCard() {
  const { currentBranchId } = useBranchStore();
  const query = useQuery({
    queryKey: ["my-employee-purchase-profile-v1", currentBranchId],
    queryFn: () => getMyEmployeePurchaseProfile(currentBranchId || null, 30),
    refetchOnWindowFocus: true,
  });
  const profile = query.data;
  const wallet = profile?.wallet;
  const entries = wallet?.ledger || [];
  const attendance = profile?.attendance;
  const latestPayroll = profile?.payroll?.latest;
  const advanceOutstanding = (profile?.advances || []).reduce((sum, row) => sum + Number(row.outstanding_amount || 0), 0);

  return (
    <Card className="overflow-hidden border-[#005931]/20">
      <CardHeader className="border-b bg-gradient-to-l from-[#005931]/10 to-white">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-[#005931]" />بطاقة وحساب الموظف</CardTitle>
            <CardDescription className="mt-1">بطاقة الشراء، النقاط، الآجل، الحضور، الراتب والسلف من مصدر واحد.</CardDescription>
          </div>
          {wallet && <Badge className={wallet.active ? "w-fit bg-emerald-600" : "w-fit bg-slate-500"}>{wallet.active ? "الحساب نشط" : "الحساب موقوف"}</Badge>}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 md:p-5">
        {query.isLoading ? (
          <div className="flex min-h-44 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#005931]" /></div>
        ) : query.isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">تعذر تحميل بطاقة وحساب الموظف.</div>
        ) : !wallet ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">لم يتم إنشاء حساب موظف حتى الآن.</div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2 text-xs text-emerald-700"><Coins className="h-4 w-4" />نقاط الموظف</div>
                  <div className="mt-2 text-2xl font-black text-emerald-950">{Number(wallet.points_balance || 0).toLocaleString("ar-EG")} نقطة</div>
                  <div className="mt-1 text-[11px] text-emerald-700">5 نقاط لكل جنيه مدفوع فعليًا · الآجل لا يكسب نقاط</div>
                </div>

                <div className="rounded-2xl border bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><CreditCard className="h-4 w-4 text-[#005931]" />الآجل المتاح</div>
                  <div className="mt-2 text-2xl font-black">{money(wallet.credit_available)}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">الحد: {money(wallet.credit_limit)}</div>
                </div>

                <div className={`rounded-2xl border p-4 ${Number(wallet.receivable_balance || 0) > 0 ? "border-amber-200 bg-amber-50" : "bg-slate-50"}`}>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><ReceiptText className="h-4 w-4" />المستحق للشركة</div>
                  <div className={`mt-2 text-2xl font-black ${Number(wallet.receivable_balance || 0) > 0 ? "text-amber-900" : ""}`}>{money(wallet.receivable_balance)}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{wallet.payroll_deduction_enabled ? "مؤهل للتسوية عبر الراتب بعد الاعتماد" : "غير مربوط بخصم الراتب"}</div>
                </div>

                <div className="rounded-2xl border bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Gift className="h-4 w-4 text-[#005931]" />رصيد المزايا</div>
                  <div className="mt-2 text-2xl font-black">{money(wallet.benefit_balance)}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">البدل الشهري: {money(wallet.benefit_monthly_allowance)}</div>
                </div>
              </div>

              <div className="space-y-3 rounded-3xl border bg-slate-50/70 p-4">
                <div className="flex items-center gap-2 font-black"><Barcode className="h-5 w-5 text-[#005931]" />باركود الموظف</div>
                <EmployeeBarcode value={wallet.barcode_token} />
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-white p-3"><div className="text-muted-foreground">رقم العضوية</div><div className="mt-1 font-mono font-black" dir="ltr">{wallet.membership_number || "—"}</div></div>
                  <div className="rounded-xl bg-white p-3"><div className="text-muted-foreground">إجمالي النقاط المكتسبة</div><div className="mt-1 font-black">{Number(wallet.lifetime_points_earned || 0).toLocaleString("ar-EG")}</div></div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarCheck2 className="h-4 w-4 text-[#005931]" />الحضور هذا الشهر</div>
                <div className="mt-2 text-xl font-black">{Number(attendance?.attended_days || 0).toLocaleString("ar-EG")} يوم</div>
                <div className="mt-1 text-[11px] text-muted-foreground">من {Number(attendance?.scheduled_days || 0).toLocaleString("ar-EG")} يوم مجدول</div>
              </div>
              <div className={`rounded-2xl border p-4 ${Number(attendance?.absent_days || 0) > 0 ? "border-amber-200 bg-amber-50" : ""}`}>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4" />الغياب / التأخير</div>
                <div className="mt-2 text-xl font-black">{Number(attendance?.absent_days || 0).toLocaleString("ar-EG")} غياب</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{Number(attendance?.late_days || 0).toLocaleString("ar-EG")} يوم تأخير · إجازة {Number(attendance?.approved_leave_days || 0).toLocaleString("ar-EG")}</div>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarClock className="h-4 w-4 text-[#005931]" />موعد القبض القادم</div>
                <div className="mt-2 text-lg font-black">{fmtDate(profile?.payroll?.next_pay_date)}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{latestPayroll ? `آخر صافي مسير: ${money(latestPayroll.net_amount)}` : "لا يوجد مسير رواتب سابق"}</div>
              </div>
              <div className={`rounded-2xl border p-4 ${advanceOutstanding > 0 ? "border-amber-200 bg-amber-50" : ""}`}>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Banknote className="h-4 w-4" />السلف</div>
                <div className="mt-2 text-xl font-black">{advanceOutstanding > 0 ? money(advanceOutstanding) : "لا توجد سلفة"}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{advanceOutstanding > 0 ? `${(profile?.advances || []).length.toLocaleString("ar-EG")} سلفة/التزام مفتوح` : "لا يوجد رصيد سلفة مستحق"}</div>
              </div>
            </div>

            {Number(attendance?.scheduled_days || 0) > 0 && Number(attendance?.absent_days || 0) > 0 && (
              <div className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /><div>الغياب محسوب حتى تاريخ اليوم بناءً على جدول الورديات والحضور والإجازات المعتمدة.</div></div>
            )}

            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-black"><ReceiptText className="h-4 w-4 text-[#005931]" />آخر حركات الحساب</div>
              {entries.length === 0 ? (
                <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">لا توجد حركات على الحساب حتى الآن.</div>
              ) : (
                <div className="space-y-2">{entries.slice(0, 12).map(entry => (
                  <div key={entry.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-bold">{entryLabels[entry.entry_type] || entry.entry_type}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{entry.description || "بدون ملاحظة"} • {fmtDateTime(entry.created_at)}</div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs">
                      {Number(entry.points_delta || 0) !== 0 && <span className={Number(entry.points_delta || 0) > 0 ? "font-bold text-emerald-700" : "font-bold text-red-700"}>نقاط {Number(entry.points_delta || 0) > 0 ? "+" : ""}{Number(entry.points_delta || 0).toLocaleString("ar-EG")}</span>}
                      {Number(entry.benefit_delta || 0) !== 0 && <span className={Number(entry.benefit_delta || 0) > 0 ? "font-bold text-emerald-700" : "font-bold text-red-700"}>مزايا {Number(entry.benefit_delta || 0) > 0 ? "+" : ""}{money(entry.benefit_delta)}</span>}
                      {Number(entry.receivable_delta || 0) !== 0 && <span className={Number(entry.receivable_delta || 0) > 0 ? "font-bold text-amber-700" : "font-bold text-emerald-700"}>آجل {Number(entry.receivable_delta || 0) > 0 ? "+" : ""}{money(entry.receivable_delta)}</span>}
                    </div>
                  </div>
                ))}</div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
