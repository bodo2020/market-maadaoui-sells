import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Delete, Eye, EyeOff, KeyRound, LockKeyhole, LogIn, RefreshCw, Settings2, ShieldCheck, Store, UserRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchPosQuickStaff, getAnyLocalPosDevice, type PosQuickStaff } from "@/services/supabase/posDeviceService";

export default function StaffLoginV2() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showFullLogin, setShowFullLogin] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectingBranchId, setSelectingBranchId] = useState<string | null>(null);
  const [quickStaff, setQuickStaff] = useState<PosQuickStaff[]>([]);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<PosQuickStaff | null>(null);
  const [pin, setPin] = useState("");

  const localDevice = useMemo(() => getAnyLocalPosDevice(), []);
  const { login, quickLogin, logout, selectBranch, isAuthenticated, branchOptions, branchSelectionRequired, isLoading } = useAuth();
  const busy = submitting || isLoading;

  const loadQuickStaff = async () => {
    if (!localDevice) return;
    setQuickLoading(true);
    setQuickError(null);
    try { setQuickStaff(await fetchPosQuickStaff(localDevice)); }
    catch (error: any) { setQuickStaff([]); setQuickError(error?.message || "تعذر تحميل موظفي الجهاز"); }
    finally { setQuickLoading(false); }
  };

  useEffect(() => {
    if (localDevice && !showFullLogin && !branchSelectionRequired && !isAuthenticated) void loadQuickStaff();
  }, [showFullLogin, branchSelectionRequired, isAuthenticated]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError(null);
    if (!username.trim() || !password) return setLoginError("اكتب اسم المستخدم وكلمة المرور.");
    try { setSubmitting(true); await login(username.trim(), password); }
    catch (error: any) { setLoginError(error?.message || "تعذر تسجيل الدخول"); }
    finally { setSubmitting(false); }
  };

  const handleQuickLogin = async () => {
    if (!localDevice || !selectedStaff || !/^\d{4,6}$/.test(pin)) return;
    setLoginError(null);
    try { setSubmitting(true); await quickLogin(localDevice, selectedStaff.user_id, pin); }
    catch (error: any) { setLoginError(error?.message || "PIN غير صحيح"); setPin(""); }
    finally { setSubmitting(false); }
  };

  const pressDigit = (digit: string) => {
    if (busy) return;
    setLoginError(null);
    setPin(value => value.length < 6 ? `${value}${digit}` : value);
  };

  const handleBranchSelection = async (branchId: string) => {
    setLoginError(null);
    try { setSelectingBranchId(branchId); await selectBranch(branchId); }
    catch (error: any) { setLoginError(error?.message || "تعذر اختيار الفرع"); }
    finally { setSelectingBranchId(null); }
  };

  if (isAuthenticated) return <Navigate to="/" replace />;

  const shell = (content: React.ReactNode, hint?: React.ReactNode) => (
    <div dir="rtl" className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="relative hidden overflow-hidden bg-[#005931] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_10%,white_0,transparent_32%),radial-gradient(circle_at_80%_90%,#3ddc97_0,transparent_28%)]" />
        <div className="relative z-10"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/20"><Store className="h-7 w-7" /></div><h1 className="mt-6 text-4xl font-black">ماركت المعداوي</h1><p className="mt-3 max-w-xl text-lg leading-8 text-emerald-50">بوابة واحدة آمنة لكل الموظفين: تشغيل، حضور، مهام، موارد بشرية ومالية حسب صلاحية كل حساب.</p></div>
        <div className="relative z-10 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><ShieldCheck className="h-5 w-5" /><div className="mt-2 font-bold">صلاحيات حسب الدور</div></div><div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><KeyRound className="h-5 w-5" /><div className="mt-2 font-bold">PIN شخصي للتطبيق</div></div><div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><LockKeyhole className="h-5 w-5" /><div className="mt-2 font-bold">أجهزة وجلسات موثوقة</div></div></div>
      </section>
      <main className="flex min-h-screen items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-6 lg:hidden"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#005931] text-white"><Store className="h-6 w-6" /></div><div><h1 className="text-xl font-black">ماركت المعداوي</h1><p className="text-xs text-muted-foreground">بوابة الموظفين</p></div></div></div>
          {hint}
          {content}
          <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">بعد تسجيل الدخول يتم فتح التطبيق بالـPIN الشخصي للموظف. لا تشارك كلمة المرور أو PIN مع أي شخص.</p>
        </div>
      </main>
    </div>
  );

  if (branchSelectionRequired) {
    return shell(<Card className="rounded-3xl border-0 shadow-xl shadow-slate-900/5"><CardHeader><div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-[#005931]"><Store className="h-5 w-5" /></div><CardTitle className="text-2xl font-black">اختار فرع العمل</CardTitle><CardDescription>صلاحياتك والمخزون والعهدة هيتحددوا على الفرع اللي هتختاره.</CardDescription></CardHeader><CardContent className="space-y-3">{loginError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{loginError}</AlertDescription></Alert>}{branchOptions.map(branch => { const selecting = selectingBranchId === branch.branch_id; return <button key={branch.branch_id} type="button" disabled={Boolean(selectingBranchId)} onClick={() => void handleBranchSelection(branch.branch_id)} className="flex w-full items-center gap-3 rounded-2xl border bg-white p-4 text-right transition hover:border-[#005931]/40 hover:bg-emerald-50/40 disabled:opacity-60"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#005931]"><Store className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate font-black">{branch.branch_name}</span>{branch.is_primary && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">أساسي</span>}</div><div className="mt-1 text-xs text-muted-foreground">{branch.role_name_ar}</div></div>{selecting ? <RefreshCw className="h-5 w-5 animate-spin text-[#005931]" /> : <ArrowRight className="h-5 w-5 rotate-180 text-[#005931]" />}</button>; })}<Button variant="ghost" className="w-full" onClick={() => void logout()} disabled={Boolean(selectingBranchId)}>الدخول بحساب مختلف</Button></CardContent></Card>);
  }

  if (localDevice && !showFullLogin) {
    if (selectedStaff) {
      return shell(<Card className="rounded-3xl border-0 shadow-xl shadow-slate-900/5"><CardHeader className="items-center text-center"><button type="button" className="self-start text-sm text-muted-foreground hover:text-slate-900" onClick={() => { setSelectedStaff(null); setPin(""); setLoginError(null); }}>رجوع للموظفين</button><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-2xl font-black text-[#005931]">{selectedStaff.name.trim().charAt(0) || "م"}</div><CardTitle>{selectedStaff.name}</CardTitle><CardDescription>{selectedStaff.role_name_ar} · {localDevice.device_name}</CardDescription></CardHeader><CardContent className="space-y-4">{loginError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{loginError}</AlertDescription></Alert>}<div className="flex h-14 items-center justify-center gap-2 rounded-2xl border bg-slate-50">{Array.from({ length: 6 }).map((_, index) => <span key={index} className={`h-3 w-3 rounded-full ${index < pin.length ? "bg-[#005931]" : "bg-slate-200"}`} />)}</div><div className="grid grid-cols-3 gap-2" dir="ltr">{["1","2","3","4","5","6","7","8","9"].map(digit => <Button key={digit} variant="outline" className="h-14 rounded-xl text-lg" onClick={() => pressDigit(digit)} disabled={busy}>{digit}</Button>)}<Button variant="ghost" className="h-14" onClick={() => setPin("")} disabled={busy}>مسح</Button><Button variant="outline" className="h-14 text-lg" onClick={() => pressDigit("0")} disabled={busy}>0</Button><Button variant="ghost" className="h-14" onClick={() => setPin(value => value.slice(0, -1))} disabled={busy}><Delete className="h-5 w-5" /></Button></div><Button className="h-12 w-full rounded-xl bg-[#005931] hover:bg-[#004526]" onClick={() => void handleQuickLogin()} disabled={busy || pin.length < 4}>{busy ? <RefreshCw className="ml-2 h-4 w-4 animate-spin" /> : <KeyRound className="ml-2 h-4 w-4" />}دخول سريع بالـPIN</Button></CardContent></Card>);
    }

    return shell(<Card className="rounded-3xl border-0 shadow-xl shadow-slate-900/5"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-2xl font-black">اختار حساب الكاشير</CardTitle><CardDescription className="mt-1">دخول سريع على {localDevice.device_name}</CardDescription></div><div className="rounded-2xl bg-emerald-50 p-3 text-[#005931]"><ShieldCheck className="h-5 w-5" /></div></div></CardHeader><CardContent className="space-y-4">{quickError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{quickError}</AlertDescription></Alert>}{quickLoading ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />جاري تحميل الموظفين</div> : quickStaff.length ? <div className="grid grid-cols-2 gap-3">{quickStaff.map(staff => <button key={staff.user_id} type="button" onClick={() => { setSelectedStaff(staff); setPin(""); setLoginError(null); }} className="rounded-2xl border bg-white p-4 text-center transition hover:border-[#005931]/40 hover:bg-emerald-50/40"><div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 font-black text-[#005931]">{staff.name.trim().charAt(0) || <UserRound className="h-5 w-5" />}</div><div className="truncate font-black">{staff.name}</div><div className="mt-1 text-xs text-muted-foreground">{staff.role_name_ar}</div></button>)}</div> : <div className="rounded-2xl border border-dashed p-6 text-center"><UserRound className="mx-auto mb-2 h-8 w-8 text-slate-300" /><div className="font-black">لا يوجد كاشير جاهز للدخول السريع</div><p className="mt-1 text-xs leading-5 text-muted-foreground">استخدم دخول حساب الموظف لإعداد الصلاحيات أو PIN.</p></div>}<div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => void loadQuickStaff()} disabled={quickLoading}><RefreshCw className={`ml-2 h-4 w-4 ${quickLoading ? "animate-spin" : ""}`} />تحديث</Button><Button variant="outline" onClick={() => { setShowFullLogin(true); setLoginError(null); }}><Settings2 className="ml-2 h-4 w-4" />دخول موظف</Button></div></CardContent></Card>, <div className="mb-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900">هذا الجهاز مسجل كنقطة بيع؛ لذلك الدخول السريع ظاهر أولًا. أي مدير أو موظف غير كاشير يقدر يستخدم «دخول موظف».</div>);
  }

  return shell(<Card className="rounded-3xl border-0 shadow-xl shadow-slate-900/5"><CardHeader><div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-[#005931]"><LogIn className="h-5 w-5" /></div><CardTitle className="text-2xl font-black">تسجيل دخول الموظف</CardTitle><CardDescription>استخدم اسم المستخدم وكلمة المرور. بعد التحقق هتدخل PIN حسابك لفتح التطبيق.</CardDescription></CardHeader><CardContent>{loginError && <Alert variant="destructive" className="mb-4"><AlertTriangle className="h-4 w-4" /><AlertDescription>{loginError}</AlertDescription></Alert>}<form onSubmit={handleLogin} className="space-y-5"><div className="space-y-2"><Label htmlFor="username">اسم المستخدم</Label><Input id="username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} className="h-12 rounded-xl" placeholder="اسم المستخدم" disabled={busy} /></div><div className="space-y-2"><Label htmlFor="password">كلمة المرور</Label><div className="relative"><Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="h-12 rounded-xl pl-11" placeholder="كلمة المرور" disabled={busy} /><button type="button" className="absolute inset-y-0 left-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-700" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div><Button type="submit" className="h-12 w-full rounded-xl bg-[#005931] hover:bg-[#004526]" disabled={busy}>{busy ? <RefreshCw className="ml-2 h-4 w-4 animate-spin" /> : <LogIn className="ml-2 h-4 w-4" />}تسجيل الدخول</Button></form>{localDevice && <Button variant="ghost" className="mt-3 w-full" onClick={() => { setShowFullLogin(false); setLoginError(null); }}>الرجوع للدخول السريع للكاشير</Button>}</CardContent></Card>);
}
