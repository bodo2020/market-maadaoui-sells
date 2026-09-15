import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Copy,
  KeyRound,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  UserRound,
  WalletCards,
} from "lucide-react";
import {
  closeManagerPosShiftV2,
  fetchGrowthITSuperAdminCenter,
  fetchManagerShiftReconciliationPreview,
  GrowthITAccount,
  GrowthITPosDrawer,
  GrowthITSuperAdminCenter,
  resetGrowthITStaffPassword,
  ShiftReconciliationPreview,
} from "@/services/growthITAdminService";

const money = (value: number | null | undefined) => `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
const dateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : "—";

function generateSecurePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_+-";
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let value = "Md@";
  for (const byte of bytes) value += alphabet[byte % alphabet.length];
  return `${value}7a`;
}

function isStrongPassword(value: string) {
  return value.length >= 12 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

function accountRoleLabel(role: string | null) {
  const key = String(role || "").toLowerCase();
  if (key === "delivery") return "مندوب توصيل";
  if (key === "cashier") return "كاشير";
  if (key === "admin") return "أدمن";
  if (key === "super_admin" || key === "superadmin") return "سوبر أدمن";
  if (key === "employee" || key === "staff") return "موظف";
  return role || "موظف";
}

export default function GrowthITSuperAdminPanel() {
  const [center, setCenter] = useState<GrowthITSuperAdminCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [query, setQuery] = useState("");

  const [passwordAccount, setPasswordAccount] = useState<GrowthITAccount | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordReason, setPasswordReason] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordCompleted, setPasswordCompleted] = useState(false);
  const [passwordWasGenerated, setPasswordWasGenerated] = useState(false);

  const [shiftTarget, setShiftTarget] = useState<GrowthITPosDrawer | null>(null);
  const [shiftPreview, setShiftPreview] = useState<ShiftReconciliationPreview | null>(null);
  const [shiftCounts, setShiftCounts] = useState<Record<string, string>>({});
  const [varianceReasons, setVarianceReasons] = useState<Record<string, string>>({});
  const [shiftReason, setShiftReason] = useState("");
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftBusy, setShiftBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await fetchGrowthITSuperAdminCenter();
      if (!result.is_super_admin) {
        setDenied(true);
        setCenter(null);
        return;
      }
      setDenied(false);
      setCenter(result);
    } catch (error: any) {
      const message = String(error?.message || "");
      if (message.includes("SUPER_ADMIN_REQUIRED") || message.includes("PERMISSION_DENIED")) {
        setDenied(true);
        setCenter(null);
        return;
      }
      if (!silent) toast.error(message || "تعذر تحميل أدوات السوبر أدمن");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const filteredAccounts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = center?.accounts || [];
    if (!needle) return rows;
    return rows.filter((account) => [account.name, account.username, account.role, account.auth_email]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)));
  }, [center?.accounts, query]);

  const openPasswordDialog = (account: GrowthITAccount) => {
    setPasswordAccount(account);
    setPasswordValue("");
    setPasswordReason("");
    setPasswordCompleted(false);
    setPasswordWasGenerated(false);
  };

  const closePasswordDialog = () => {
    setPasswordAccount(null);
    setPasswordValue("");
    setPasswordReason("");
    setPasswordCompleted(false);
    setPasswordWasGenerated(false);
  };

  const generatePassword = () => {
    setPasswordValue(generateSecurePassword());
    setPasswordWasGenerated(true);
    setPasswordCompleted(false);
  };

  const submitPasswordReset = async () => {
    if (!passwordAccount) return;
    if (!isStrongPassword(passwordValue)) {
      toast.error("كلمة المرور لازم تكون 12 حرف على الأقل وتحتوي كبير وصغير ورقم ورمز");
      return;
    }
    if (passwordReason.trim().length < 3) {
      toast.error("اكتب سبب تجديد كلمة المرور");
      return;
    }
    setPasswordBusy(true);
    try {
      await resetGrowthITStaffPassword({
        targetUserId: passwordAccount.id,
        newPassword: passwordValue,
        reason: passwordReason,
      });
      setPasswordCompleted(true);
      toast.success(`تم تجديد كلمة مرور ${passwordAccount.name || passwordAccount.username || "الموظف"}`);
      await load(true);
    } catch (error: any) {
      const message = String(error?.message || "");
      toast.error(message.includes("super_admin") || message.includes("SUPER_ADMIN")
        ? "العملية متاحة للسوبر أدمن فقط"
        : (message || "تعذر تجديد كلمة المرور"));
    } finally {
      setPasswordBusy(false);
    }
  };

  const openShiftDialog = async (drawer: GrowthITPosDrawer) => {
    if (!drawer.shift_id) return;
    setShiftTarget(drawer);
    setShiftPreview(null);
    setShiftCounts({});
    setVarianceReasons({});
    setShiftReason("");
    setShiftLoading(true);
    try {
      const preview = await fetchManagerShiftReconciliationPreview(drawer.shift_id);
      setShiftPreview(preview);
      setShiftCounts(Object.fromEntries((preview.methods || []).map((method) => [method.code, ""])));
    } catch (error: any) {
      toast.error(error?.message || "تعذر تحميل تسوية الوردية");
      setShiftTarget(null);
    } finally {
      setShiftLoading(false);
    }
  };

  const closeShiftDialog = () => {
    if (shiftBusy) return;
    setShiftTarget(null);
    setShiftPreview(null);
    setShiftCounts({});
    setVarianceReasons({});
    setShiftReason("");
  };

  const submitShiftClose = async () => {
    if (!shiftTarget?.shift_id || !shiftPreview) return;
    if (shiftReason.trim().length < 3) {
      toast.error("اكتب سبب إنهاء الوردية");
      return;
    }

    const reconciliation: Array<{ code: string; counted_amount: number; variance_reason: string | null }> = [];
    for (const method of shiftPreview.methods || []) {
      const raw = shiftCounts[method.code];
      if (raw == null || raw.trim() === "" || !Number.isFinite(Number(raw))) {
        toast.error(`اكتب المبلغ المعدود لوسيلة ${method.name}`);
        return;
      }
      const counted = Math.round(Number(raw) * 100) / 100;
      const expected = Math.round(Number(method.expected_amount || 0) * 100) / 100;
      const variance = Math.round((counted - expected) * 100) / 100;
      const reason = varianceReasons[method.code]?.trim() || "";
      if (Math.abs(variance) > 0.005 && reason.length < 3) {
        toast.error(`اكتب سبب الفرق في ${method.name}`);
        return;
      }
      reconciliation.push({
        code: method.code,
        counted_amount: counted,
        variance_reason: Math.abs(variance) > 0.005 ? reason : null,
      });
    }

    if (!window.confirm(`تأكيد إنهاء وردية ${shiftTarget.cashier_name || shiftTarget.cashier_username || "الكاشير"} على ${shiftTarget.device_name}؟`)) return;

    setShiftBusy(true);
    try {
      await closeManagerPosShiftV2({
        shiftId: shiftTarget.shift_id,
        reconciliation,
        notes: shiftReason,
      });
      toast.success("تم إنهاء الوردية وتسجيل التسوية");
      closeShiftDialog();
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || "تعذر إنهاء الوردية");
    } finally {
      setShiftBusy(false);
    }
  };

  if (denied) return null;
  if (loading && !center) {
    return (
      <section dir="rtl" className="mx-auto mt-5 w-full max-w-[1600px] px-3 pb-6 md:px-6">
        <Card className="rounded-3xl border-[#005931]/15"><CardContent className="flex items-center justify-center gap-2 py-8 text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" />جاري تحميل أدوات السوبر أدمن…</CardContent></Card>
      </section>
    );
  }
  if (!center?.is_super_admin) return null;

  const openShifts = center.pos_drawers.filter((drawer) => Boolean(drawer.shift_id));

  return (
    <section dir="rtl" className="mx-auto mt-5 w-full max-w-[1600px] space-y-4 px-3 pb-8 md:px-6">
      <Card className="overflow-hidden rounded-3xl border-[#005931]/20 shadow-sm">
        <CardHeader className="border-b bg-gradient-to-l from-[#005931]/10 to-white">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-black text-[#005931]"><ShieldCheck className="h-4 w-4" /> SUPER ADMIN ONLY</div>
              <CardTitle className="text-xl">إدارة حسابات الموظفين وخزن الكاشير</CardTitle>
              <CardDescription className="mt-1">تجديد كلمات مرور الموظفين ومراجعة الخزن والورديات المفتوحة وإنهاؤها بتسوية كاملة.</CardDescription>
            </div>
            <Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} />تحديث</Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-bold text-slate-500"><UserRound className="h-4 w-4 text-[#005931]" />حسابات الموظفين</div><div className="mt-1 text-2xl font-black">{center.accounts.length}</div></div>
          <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-bold text-slate-500"><Store className="h-4 w-4 text-[#005931]" />خزن POS</div><div className="mt-1 text-2xl font-black">{center.pos_drawers.length}</div></div>
          <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-bold text-slate-500"><WalletCards className="h-4 w-4 text-[#005931]" />ورديات مفتوحة</div><div className="mt-1 text-2xl font-black">{openShifts.length}</div></div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div><CardTitle className="flex items-center gap-2 text-lg"><UserRound className="h-5 w-5 text-[#005931]" />حسابات الموظفين</CardTitle><CardDescription>كلمة المرور القديمة لا يمكن عرضها؛ يمكن فقط استبدالها بكلمة جديدة.</CardDescription></div>
            <div className="relative w-full md:w-80"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(e) => setQuery(e.target.value)} className="pr-9" placeholder="بحث بالاسم أو username أو الدور" /></div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {filteredAccounts.length === 0 && <div className="col-span-full py-8 text-center text-sm text-slate-500">لا توجد حسابات مطابقة.</div>}
          {filteredAccounts.map((account) => (
            <div key={account.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><strong className="truncate text-base">{account.name || account.username || "موظف"}</strong><Badge variant="outline">{accountRoleLabel(account.role)}</Badge><Badge className={account.active ? "bg-emerald-600" : "bg-slate-500"}>{account.active ? "نشط" : "موقوف"}</Badge></div>
                  <div className="mt-2 text-xs text-slate-500">@{account.username || "—"}{account.auth_email ? ` • ${account.auth_email}` : ""}</div>
                  <div className="mt-1 text-xs text-slate-500">إنشاء الحساب: {dateTime(account.created_at)} • آخر دخول: {dateTime(account.last_sign_in_at)}</div>
                  {account.branches?.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{account.branches.map((branch, index) => <Badge key={`${account.id}-${branch.branch_id || index}`} variant="outline">{branch.branch_name || "فرع"}{branch.role ? ` • ${branch.role}` : ""}</Badge>)}</div>}
                </div>
                <Button size="sm" variant="outline" disabled={!account.active} onClick={() => openPasswordDialog(account)}><KeyRound className="h-4 w-4" />تجديد الباسورد</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Store className="h-5 w-5 text-[#005931]" />الخزن والورديات</CardTitle><CardDescription>كل جهاز POS ظاهر هنا مع الموظف الذي فاتح الوردية الحالية ورصيد الدرج وآخر اتصال.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {center.pos_drawers.map((drawer) => (
            <div key={drawer.device_id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3"><div><div className="font-black">{drawer.device_name}</div><div className="mt-1 font-mono text-[11px] text-slate-400">{drawer.device_code || "—"}</div></div><Badge className={drawer.online ? "bg-emerald-600" : "bg-slate-500"}>{drawer.online ? "Online" : "Offline"}</Badge></div>
              <div className="mt-3 grid gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 p-2"><span className="text-slate-400">الفرع</span><div className="mt-0.5 font-bold">{drawer.branch_name || "—"}</div></div>
                <div className="rounded-xl bg-slate-50 p-2"><span className="text-slate-400">الوردية الحالية</span><div className="mt-0.5 font-bold">{drawer.shift_id ? `${drawer.cashier_name || "كاشير"}${drawer.cashier_username ? ` (@${drawer.cashier_username})` : ""}` : "لا توجد وردية مفتوحة"}</div>{drawer.opened_at && <div className="mt-1 text-slate-500">من {dateTime(drawer.opened_at)}</div>}</div>
                <div className="rounded-xl bg-slate-50 p-2"><span className="text-slate-400">رصيد الدرج</span><div className="mt-0.5 font-bold">{drawer.drawer_account_id ? money(drawer.drawer_balance) : "لا يوجد حساب درج"}</div></div>
              </div>
              {drawer.shift_id && <Button className="mt-3 w-full" variant="destructive" onClick={() => void openShiftDialog(drawer)}>إنهاء الوردية</Button>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={Boolean(passwordAccount)} onOpenChange={(open) => !open && closePasswordDialog()}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader><DialogTitle>تجديد كلمة مرور الموظف</DialogTitle><DialogDescription>{passwordAccount?.name || passwordAccount?.username} • @{passwordAccount?.username || "—"}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>كلمة المرور الجديدة</Label><div className="flex gap-2"><Input type="text" autoComplete="new-password" value={passwordValue} disabled={passwordCompleted} onChange={(e) => { setPasswordValue(e.target.value); setPasswordWasGenerated(false); }} placeholder="12 حرف على الأقل" /><Button type="button" variant="outline" disabled={passwordCompleted} onClick={generatePassword}>توليد</Button></div><p className="text-xs text-slate-500">لا يتم حفظ كلمة المرور في قاعدة بيانات التطبيق أو localStorage؛ Supabase Auth يستبدلها مباشرة.</p></div>
            <div className="space-y-2"><Label>سبب التجديد</Label><Input value={passwordReason} disabled={passwordCompleted} onChange={(e) => setPasswordReason(e.target.value)} placeholder="مثال: الموظف نسي كلمة المرور" /></div>
            {passwordCompleted && passwordWasGenerated && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3"><div className="text-sm font-black text-amber-900">انسخ كلمة المرور الآن</div><div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-white px-3 py-2 text-left text-sm" dir="ltr">{passwordValue}</code><Button size="icon" variant="outline" onClick={() => void navigator.clipboard.writeText(passwordValue).then(() => toast.success("تم النسخ"))}><Copy className="h-4 w-4" /></Button></div><div className="mt-2 text-xs text-amber-800">هتختفي من الشاشة عند قفل النافذة ومش هنقدر نعرضها تاني.</div></div>}
          </div>
          <DialogFooter className="gap-2 sm:justify-start"><Button variant="outline" onClick={closePasswordDialog}>{passwordCompleted ? "إغلاق" : "إلغاء"}</Button>{!passwordCompleted && <Button disabled={passwordBusy} onClick={() => void submitPasswordReset()}>{passwordBusy && <RefreshCw className="h-4 w-4 animate-spin" />}تجديد كلمة المرور</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(shiftTarget)} onOpenChange={(open) => !open && closeShiftDialog()}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>إنهاء وردية POS</DialogTitle><DialogDescription>{shiftTarget?.device_name} • {shiftTarget?.cashier_name || shiftTarget?.cashier_username || "الكاشير"}. لازم مراجعة كل وسيلة دفع قبل الإنهاء.</DialogDescription></DialogHeader>
          {shiftLoading && <div className="flex items-center justify-center gap-2 py-8 text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" />جاري تحميل التسوية…</div>}
          {shiftPreview && <div className="space-y-3">
            {(shiftPreview.methods || []).map((method) => {
              const counted = shiftCounts[method.code] === "" ? null : Number(shiftCounts[method.code]);
              const variance = counted == null || !Number.isFinite(counted) ? null : Math.round((counted - Number(method.expected_amount || 0)) * 100) / 100;
              return <div key={method.code} className="rounded-2xl border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-black">{method.name}</div><div className="text-xs text-slate-500">المتوقع: <strong className="text-slate-900">{money(method.expected_amount)}</strong></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><div><Label>المبلغ المعدود فعليًا</Label><Input className="mt-1" inputMode="decimal" value={shiftCounts[method.code] ?? ""} onChange={(e) => setShiftCounts((old) => ({ ...old, [method.code]: e.target.value }))} placeholder={String(Number(method.expected_amount || 0).toFixed(2))} /></div><div><Label>الفرق</Label><div className={`mt-1 flex h-10 items-center rounded-md border px-3 text-sm font-bold ${variance != null && Math.abs(variance) > 0.005 ? "border-amber-300 bg-amber-50 text-amber-900" : "bg-slate-50"}`}>{variance == null ? "—" : money(variance)}</div></div></div>{variance != null && Math.abs(variance) > 0.005 && <div className="mt-2"><Label>سبب الفرق</Label><Input className="mt-1" value={varianceReasons[method.code] || ""} onChange={(e) => setVarianceReasons((old) => ({ ...old, [method.code]: e.target.value }))} placeholder="اكتب سبب الفرق" /></div>}</div>;
            })}
            <div className="space-y-2"><Label>سبب إنهاء الوردية</Label><Input value={shiftReason} onChange={(e) => setShiftReason(e.target.value)} placeholder="مثال: وردية قديمة معلقة / نهاية الشيفت" /></div>
          </div>}
          <DialogFooter className="gap-2 sm:justify-start"><Button variant="outline" disabled={shiftBusy} onClick={closeShiftDialog}>إلغاء</Button><Button variant="destructive" disabled={shiftBusy || shiftLoading || !shiftPreview} onClick={() => void submitShiftClose()}>{shiftBusy && <RefreshCw className="h-4 w-4 animate-spin" />}تأكيد وإنهاء الوردية</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
