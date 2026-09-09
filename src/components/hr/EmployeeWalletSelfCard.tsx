import { useQuery } from "@tanstack/react-query";
import { CreditCard, Gift, Loader2, ReceiptText, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyEmployeeWallet } from "@/services/employeeWalletService";
import { siteConfig } from "@/config/site";

const money = (value?: number | null) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;
const fmtDate = (value: string) => new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const entryLabels: Record<string, string> = {
  benefit_topup: "إضافة رصيد مزايا",
  employee_purchase: "مشتريات موظف",
  credit_payment: "سداد آجل",
  payroll_settlement: "تسوية مع الراتب",
  refund: "مرتجع",
  adjustment: "تسوية حساب",
};

export default function EmployeeWalletSelfCard() {
  const query = useQuery({ queryKey: ["my-employee-wallet-v1"], queryFn: () => getMyEmployeeWallet(30), refetchOnWindowFocus: true });
  const account = query.data?.account;
  const entries = query.data?.ledger || [];

  return (
    <Card className="overflow-hidden border-[#005931]/20">
      <CardHeader className="border-b bg-gradient-to-l from-[#005931]/10 to-white">
        <CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-[#005931]" />حساب الموظف داخل الماركت</CardTitle>
        <CardDescription>رصيد المزايا منفصل عن الآجل. مشتريات الآجل لا تُحسب نقدية، وتظهر كمستحق على الموظف حتى التسوية.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-4 md:p-5">
        {query.isLoading ? <div className="flex min-h-36 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#005931]" /></div> : query.isError ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">تعذر تحميل حساب الموظف.</div> : !account ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">لم يتم إنشاء حساب موظف حتى الآن.</div> : <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center gap-2 text-xs text-emerald-700"><Gift className="h-4 w-4" />رصيد المزايا</div><div className="mt-2 text-xl font-black text-emerald-950">{money(account.benefit_balance)}</div><div className="mt-1 text-[11px] text-emerald-700">البدل الشهري: {money(account.benefit_monthly_allowance)}</div></div>
            <div className="rounded-2xl border bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><CreditCard className="h-4 w-4 text-[#005931]" />الآجل المتاح</div><div className="mt-2 text-xl font-black">{money(account.credit_available)}</div><div className="mt-1 text-[11px] text-muted-foreground">الحد: {money(account.credit_limit)}</div></div>
            <div className={`rounded-2xl border p-4 ${account.receivable_balance > 0 ? "border-amber-200 bg-amber-50" : "bg-slate-50"}`}><div className="text-xs text-muted-foreground">المستحق للشركة</div><div className={`mt-2 text-xl font-black ${account.receivable_balance > 0 ? "text-amber-900" : ""}`}>{money(account.receivable_balance)}</div><div className="mt-1 text-[11px] text-muted-foreground">{account.payroll_deduction_enabled ? "مؤهل للتسوية عبر الراتب بعد اعتماد المسير" : "غير مربوط بخصم الراتب"}</div></div>
            <div className="rounded-2xl border bg-slate-50 p-4"><div className="text-xs text-muted-foreground">حالة الحساب</div><div className="mt-2"><Badge className={account.active ? "bg-emerald-600" : "bg-slate-500"}>{account.active ? "نشط" : "موقوف"}</Badge></div><div className="mt-2 text-[11px] text-muted-foreground">Benefit وCredit لهما Ledger مستقل.</div></div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-black"><ReceiptText className="h-4 w-4 text-[#005931]" />آخر الحركات</div>
            {entries.length === 0 ? <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">لا توجد حركات على الحساب حتى الآن.</div> : <div className="space-y-2">{entries.slice(0, 10).map((entry) => <div key={entry.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-bold">{entryLabels[entry.entry_type] || entry.entry_type}</div><div className="mt-0.5 text-xs text-muted-foreground">{entry.description || "بدون ملاحظة"} • {fmtDate(entry.created_at)}</div></div><div className="flex gap-3 text-xs"><span className={entry.benefit_delta > 0 ? "font-bold text-emerald-700" : entry.benefit_delta < 0 ? "font-bold text-red-700" : "text-muted-foreground"}>مزايا {entry.benefit_delta > 0 ? "+" : ""}{money(entry.benefit_delta)}</span><span className={entry.receivable_delta > 0 ? "font-bold text-amber-700" : entry.receivable_delta < 0 ? "font-bold text-emerald-700" : "text-muted-foreground"}>آجل {entry.receivable_delta > 0 ? "+" : ""}{money(entry.receivable_delta)}</span></div></div>)}</div>}
          </div>
        </>}
      </CardContent>
    </Card>
  );
}
