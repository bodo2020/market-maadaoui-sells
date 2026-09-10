import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Barcode, Coins, CreditCard, Loader2, ReceiptText, Save, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { configureEmployeeWallet, getEmployeeWalletAdmin } from "@/services/employeeWalletService";
import { siteConfig } from "@/config/site";

const money = (value?: number | null) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;
const fmt = (value: string) => new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));

export default function EmployeeWalletAdminPanel({ employeeId, branchId }: { employeeId: string; branchId: string | null }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["employee-wallet-admin-v1", employeeId, branchId],
    enabled: Boolean(employeeId && branchId),
    queryFn: () => getEmployeeWalletAdmin(employeeId, branchId as string, 60),
  });
  const account = query.data?.account;
  const [creditLimit, setCreditLimit] = useState("0");
  const [monthlyBenefit, setMonthlyBenefit] = useState("0");
  const [payrollDeduction, setPayrollDeduction] = useState(true);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!account) return;
    setCreditLimit(String(Number(account.credit_limit || 0)));
    setMonthlyBenefit(String(Number(account.benefit_monthly_allowance || 0)));
    setPayrollDeduction(Boolean(account.payroll_deduction_enabled));
    setActive(Boolean(account.active));
  }, [account]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error("اختر الفرع أولًا.");
      const limit = Number(creditLimit || 0);
      const benefit = Number(monthlyBenefit || 0);
      if (!Number.isFinite(limit) || limit < 0) throw new Error("حد الآجل غير صحيح.");
      if (!Number.isFinite(benefit) || benefit < 0) throw new Error("رصيد المزايا الشهري غير صحيح.");
      if (account && limit + 0.009 < Number(account.receivable_balance || 0)) throw new Error("لا يمكن خفض حد الآجل عن المبلغ المستحق حاليًا.");
      return configureEmployeeWallet({
        employeeId,
        branchId,
        creditLimit: limit,
        benefitMonthlyAllowance: benefit,
        payrollDeductionEnabled: payrollDeduction,
        active,
      });
    },
    onSuccess: () => {
      toast.success("تم تحديث حساب الموظف والحد الائتماني.");
      queryClient.invalidateQueries({ queryKey: ["employee-wallet-admin-v1", employeeId] });
    },
    onError: (e: any) => toast.error(e?.message || "تعذر تحديث حساب الموظف."),
  });

  if (!branchId) return <Card><CardContent className="p-6 text-sm text-muted-foreground">اختر فرعًا لإدارة حساب الموظف.</CardContent></Card>;
  if (query.isLoading) return <Card><CardContent className="flex min-h-36 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#005931]" /></CardContent></Card>;
  if (query.isError || !account) return <Card className="border-red-200"><CardContent className="p-6 text-sm text-red-700">{query.error instanceof Error ? query.error.message : "تعذر تحميل حساب الموظف."}</CardContent></Card>;

  return (
    <Card className="overflow-hidden border-amber-200">
      <CardHeader className="border-b bg-gradient-to-l from-amber-50 to-white">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-amber-800" />حساب الموظف والشراء الآجل</CardTitle>
            <CardDescription className="mt-1">إدارة حد الآجل ومراجعة النقاط والمستحقات. مشتريات الآجل لا تدخل تحصيلات الوردية.</CardDescription>
          </div>
          <Badge className={account.active ? "w-fit bg-emerald-600" : "w-fit bg-slate-500"}>{account.active ? "نشط" : "موقوف"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-4 md:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><CreditCard className="h-4 w-4 text-[#005931]" />الآجل المتاح</div><div className="mt-2 text-xl font-black">{money(account.credit_available)}</div><div className="mt-1 text-[11px] text-muted-foreground">الحد: {money(account.credit_limit)}</div></div>
          <div className={`rounded-2xl border p-4 ${Number(account.receivable_balance || 0) > 0 ? "border-amber-200 bg-amber-50" : "bg-slate-50"}`}><div className="flex items-center gap-2 text-xs text-muted-foreground"><ReceiptText className="h-4 w-4" />المستحق</div><div className="mt-2 text-xl font-black">{money(account.receivable_balance)}</div></div>
          <div className="rounded-2xl border bg-emerald-50 p-4"><div className="flex items-center gap-2 text-xs text-emerald-700"><Coins className="h-4 w-4" />النقاط</div><div className="mt-2 text-xl font-black text-emerald-950">{Number(account.points_balance || 0).toLocaleString("ar-EG")}</div><div className="mt-1 text-[11px] text-emerald-700">المكتسبة تاريخيًا: {Number(account.lifetime_points_earned || 0).toLocaleString("ar-EG")}</div></div>
          <div className="rounded-2xl border bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Barcode className="h-4 w-4 text-[#005931]" />باركود الموظف</div><div className="mt-2 font-mono text-sm font-black" dir="ltr">{account.barcode_token || "—"}</div><div className="mt-1 text-[11px] text-muted-foreground">{account.membership_number || "بدون عضوية"}</div></div>
        </div>

        <div className="grid gap-4 rounded-2xl border p-4 md:grid-cols-2 xl:grid-cols-4">
          <div><Label>حد الآجل</Label><Input className="mt-1" inputMode="decimal" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} /></div>
          <div><Label>بدل المزايا الشهري</Label><Input className="mt-1" inputMode="decimal" value={monthlyBenefit} onChange={e => setMonthlyBenefit(e.target.value)} /></div>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border p-3"><input type="checkbox" className="h-4 w-4" checked={payrollDeduction} onChange={e => setPayrollDeduction(e.target.checked)} /><span><span className="block text-sm font-bold">تسوية عبر الراتب</span><span className="text-[11px] text-muted-foreground">يسمح بخصم المستحق بعد اعتماد المسير</span></span></label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border p-3"><input type="checkbox" className="h-4 w-4" checked={active} onChange={e => setActive(e.target.checked)} /><span><span className="block text-sm font-bold">الحساب نشط</span><span className="text-[11px] text-muted-foreground">إيقافه يمنع شراء آجل جديد</span></span></label>
        </div>

        <Button className="bg-[#005931] hover:bg-[#004426]" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}><Save className="ml-2 h-4 w-4" />{saveMutation.isPending ? "جاري الحفظ..." : "حفظ إعدادات الحساب"}</Button>

        <div>
          <div className="mb-2 text-sm font-black">آخر الحركات</div>
          {(query.data?.ledger || []).length === 0 ? <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">لا توجد حركات حتى الآن.</div> : <div className="space-y-2">{(query.data?.ledger || []).slice(0, 12).map(entry => <div key={entry.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-bold">{entry.description || entry.entry_type}</div><div className="text-xs text-muted-foreground">{fmt(entry.created_at)}</div></div><div className="flex flex-wrap gap-3 text-xs">{Number(entry.points_delta || 0) !== 0 && <span className={Number(entry.points_delta || 0) > 0 ? "font-bold text-emerald-700" : "font-bold text-red-700"}>نقاط {Number(entry.points_delta || 0) > 0 ? "+" : ""}{Number(entry.points_delta || 0).toLocaleString("ar-EG")}</span>}{Number(entry.receivable_delta || 0) !== 0 && <span className={Number(entry.receivable_delta || 0) > 0 ? "font-bold text-amber-700" : "font-bold text-emerald-700"}>آجل {Number(entry.receivable_delta || 0) > 0 ? "+" : ""}{money(entry.receivable_delta)}</span>}</div></div>)}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
