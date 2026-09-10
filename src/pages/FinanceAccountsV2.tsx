import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Landmark, Pencil, Plus, RefreshCw, ShieldCheck, Vault } from "lucide-react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranchStore } from "@/stores/branchStore";
import {
  createFinanceBankAccountV2,
  fetchFinanceAccountsAdminV2,
  setFinanceManagedAccountCustodian,
  updateFinanceBankAccountV2,
  type FinanceManagedAccount,
} from "@/services/supabase/financeAccountsV2Service";

const money = (value?: number | null) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

export default function FinanceAccountsV2() {
  const queryClient = useQueryClient();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const branchId = currentBranchId || localStorage.getItem("currentBranchId") || "";
  const [createOpen, setCreateOpen] = useState(false);
  const [bankName, setBankName] = useState("");
  const [bankCustodian, setBankCustodian] = useState("__none__");
  const [editBank, setEditBank] = useState<FinanceManagedAccount | null>(null);
  const [editName, setEditName] = useState("");
  const [editCustodian, setEditCustodian] = useState("__none__");

  const query = useQuery({
    queryKey: ["finance-accounts-admin-v2", branchId],
    enabled: Boolean(branchId),
    queryFn: () => fetchFinanceAccountsAdminV2(branchId),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finance-accounts-admin-v2", branchId] }),
      queryClient.invalidateQueries({ queryKey: ["finance-transfer-options-v2", branchId] }),
      queryClient.invalidateQueries({ queryKey: ["finance-control-center-v2", branchId] }),
      queryClient.invalidateQueries({ queryKey: ["finance-treasury-v2", branchId] }),
    ]);
  };

  const custodianMutation = useMutation({
    mutationFn: (input: { accountId: string; accountKind: "cash" | "payment"; userId?: string | null }) => setFinanceManagedAccountCustodian({ branchId, ...input }),
    onSuccess: async result => { toast.success(result.custodian_user_name ? `تم تعيين ${result.custodian_user_name} مسؤولًا عن ${result.account_name}` : `تم إلغاء مسؤول ${result.account_name}`); await refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const createMutation = useMutation({
    mutationFn: () => createFinanceBankAccountV2({ branchId, name: bankName, custodianUserId: bankCustodian === "__none__" ? null : bankCustodian }),
    onSuccess: async () => { toast.success("تم إنشاء الحساب البنكي"); setCreateOpen(false); setBankName(""); setBankCustodian("__none__"); await refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const editMutation = useMutation({
    mutationFn: (active: boolean) => {
      if (!editBank) throw new Error("الحساب غير محدد");
      return updateFinanceBankAccountV2({ accountId: editBank.account_id, name: editName, custodianUserId: editCustodian === "__none__" ? null : editCustodian, active });
    },
    onSuccess: async result => { toast.success(result.active ? "تم تحديث الحساب البنكي" : "تم إيقاف الحساب البنكي مع الاحتفاظ بالتاريخ"); setEditBank(null); await refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = query.data;
  const staff = data?.eligible_staff || [];
  const safes = data?.branch_safes || [];
  const banks = data?.bank_accounts || [];

  const openEdit = (bank: FinanceManagedAccount) => {
    setEditBank(bank);
    setEditName(bank.name);
    setEditCustodian(bank.custodian_user_id || "__none__");
  };

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6 pb-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-[#005931]" /><h1 className="text-2xl font-black">إدارة الحسابات والعهد</h1><Badge className="bg-[#005931]">V2</Badge></div>
            <p className="mt-1 text-sm text-slate-500">حدد مسؤول خزنة الفرع وأنشئ الحسابات البنكية الفعلية قبل استخدامها في الصرف أو التحويل.</p>
            <p className="mt-1 text-xs font-semibold text-slate-400">{currentBranchName || "الفرع الحالي"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => location.assign("/finance/control-center")}><Vault className="ml-2 h-4 w-4" />مركز الماليات</Button>
            <Button variant="outline" onClick={() => location.assign("/finance/transfers")}><ArrowLeftRight className="ml-2 h-4 w-4" />التحويلات</Button>
            <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
            <Button className="bg-[#005931] hover:bg-[#004426]" onClick={() => setCreateOpen(true)} disabled={!branchId}><Plus className="ml-2 h-4 w-4" />حساب بنكي جديد</Button>
          </div>
        </div>

        {!branchId && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-900">اختر الفرع أولًا.</div>}
        {query.isError && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">{query.error instanceof Error ? query.error.message : "تعذر تحميل الحسابات"}</div>}
        {query.isLoading && <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-100" />)}</div>}

        {data && (
          <>
            <section className="space-y-3">
              <div><h2 className="text-lg font-black">خزن الفرع</h2><p className="text-xs text-slate-500">لا يمكن استخدام خزنة بدون مسؤول عهدة في تحويل أو صرف مفوض.</p></div>
              <div className="grid gap-4 lg:grid-cols-2">
                {safes.map(account => <Card key={account.account_id}><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Vault className="h-5 w-5 text-[#005931]" /><strong>{account.name}</strong></div><div className="mt-3 text-2xl font-black">{money(account.balance)}</div></div><Badge variant={account.custodian_user_id ? "outline" : "destructive"}>{account.custodian_user_id ? "عهدة محددة" : "بدون مسؤول"}</Badge></div><div className="mt-4"><Label className="mb-2 block text-xs text-slate-500">مسؤول الخزنة</Label><Select value={account.custodian_user_id || "__none__"} onValueChange={value => custodianMutation.mutate({ accountId: account.account_id, accountKind: "cash", userId: value === "__none__" ? null : value })} disabled={custodianMutation.isPending}><SelectTrigger><SelectValue placeholder="اختر مسؤول العهدة" /></SelectTrigger><SelectContent><SelectItem value="__none__">بدون مسؤول</SelectItem>{staff.map(user => <SelectItem key={user.user_id} value={user.user_id}>{user.name}</SelectItem>)}</SelectContent></Select></div></CardContent></Card>)}
                {!safes.length && <div className="rounded-2xl border border-dashed p-6 text-sm text-slate-500">لا توجد خزنة فرع معرفة.</div>}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-black">الحسابات البنكية</h2><p className="text-xs text-slate-500">الحساب البنكي يبدأ برصيد صفر، ثم يدخل الرصيد عبر تحويل موثق أو قيد افتتاحي معتمد لاحقًا.</p></div><Badge variant="outline">{banks.length} حساب</Badge></div>
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {banks.map(bank => <Card key={bank.account_id} className={!bank.active ? "opacity-70" : ""}><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-[#005931]" /><strong>{bank.name}</strong></div><div className="mt-3 text-2xl font-black">{money(bank.balance)}</div></div><Badge variant={bank.active ? "outline" : "secondary"}>{bank.active ? "نشط" : "موقوف"}</Badge></div><div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"><span className="text-xs text-slate-500">مسؤول الحساب</span><div className="mt-1 font-bold">{bank.custodian_user_name || "غير محدد"}</div></div><Button className="mt-4 w-full" variant="outline" onClick={() => openEdit(bank)}><Pencil className="ml-2 h-4 w-4" />إدارة الحساب</Button></CardContent></Card>)}
                {!banks.length && <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500"><Landmark className="mx-auto mb-3 h-8 w-8 text-slate-300" />لا توجد حسابات بنكية فعلية بعد.</div>}
              </div>
            </section>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900"><strong>حسابات البطاقات والمحافظ ليست بنوكًا.</strong> تظل في Gateway Clearing لحد ما تحصل التسوية الفعلية، وبعدها تنتقل للبنك أو الخزنة بقيد واضح. ده يمنع احتساب نفس الفلوس مرتين.</div>
          </>
        )}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent dir="rtl"><DialogHeader><DialogTitle>إضافة حساب بنكي</DialogTitle></DialogHeader><div className="space-y-4 py-2"><div className="space-y-2"><Label>اسم الحساب</Label><Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="مثال: بنك مصر - الحساب التشغيلي" /></div><div className="space-y-2"><Label>مسؤول العهدة</Label><Select value={bankCustodian} onValueChange={setBankCustodian}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">بدون مسؤول مؤقتًا</SelectItem>{staff.map(user => <SelectItem key={user.user_id} value={user.user_id}>{user.name}</SelectItem>)}</SelectContent></Select></div><div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">الحساب بدون مسؤول يظهر في التقارير، لكنه لن يكون صالحًا للتحويل أو الصرف حتى تعيين مسؤول.</div></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button><Button className="bg-[#005931] hover:bg-[#004426]" disabled={bankName.trim().length < 2 || createMutation.isPending} onClick={() => createMutation.mutate()}>{createMutation.isPending ? "جاري الإنشاء..." : "إنشاء الحساب"}</Button></DialogFooter></DialogContent>
        </Dialog>

        <Dialog open={Boolean(editBank)} onOpenChange={open => { if (!open) setEditBank(null); }}>
          <DialogContent dir="rtl"><DialogHeader><DialogTitle>إدارة الحساب البنكي</DialogTitle></DialogHeader>{editBank && <div className="space-y-4 py-2"><div className="rounded-xl bg-slate-50 p-3 text-sm"><div className="text-xs text-slate-500">الرصيد الحالي</div><div className="mt-1 text-xl font-black">{money(editBank.balance)}</div></div><div className="space-y-2"><Label>اسم الحساب</Label><Input value={editName} onChange={e => setEditName(e.target.value)} /></div><div className="space-y-2"><Label>مسؤول العهدة</Label><Select value={editCustodian} onValueChange={setEditCustodian}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">بدون مسؤول</SelectItem>{staff.map(user => <SelectItem key={user.user_id} value={user.user_id}>{user.name}</SelectItem>)}</SelectContent></Select></div><div className="rounded-xl border p-3 text-xs leading-5 text-slate-600">إيقاف الحساب لا يحذف التاريخ. النظام يرفض الإيقاف لو عليه رصيد أو تحويل مفتوح.</div></div>}<DialogFooter className="gap-2"><Button variant="outline" onClick={() => setEditBank(null)}>إلغاء</Button>{editBank && <Button variant={editBank.active ? "destructive" : "outline"} disabled={editMutation.isPending || editName.trim().length < 2} onClick={() => editMutation.mutate(!editBank.active)}>{editBank.active ? "إيقاف الحساب" : "إعادة تفعيل الحساب"}</Button>}<Button className="bg-[#005931] hover:bg-[#004426]" disabled={editMutation.isPending || editName.trim().length < 2} onClick={() => editMutation.mutate(editBank?.active ?? true)}>حفظ التعديلات</Button></DialogFooter></DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
