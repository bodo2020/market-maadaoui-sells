import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { LogIn, Eye, EyeOff, AlertTriangle, Store, ArrowRight, ShieldCheck, UserRound, KeyRound, Delete, RefreshCw, Settings2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { fetchPosQuickStaff, getAnyLocalPosDevice, PosQuickStaff } from "@/services/supabase/posDeviceService";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectingBranchId, setSelectingBranchId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [quickStaff, setQuickStaff] = useState<PosQuickStaff[]>([]);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<PosQuickStaff | null>(null);
  const [pin, setPin] = useState("");
  const [showFullLogin, setShowFullLogin] = useState(false);

  const localDevice = useMemo(() => getAnyLocalPosDevice(), []);

  const {
    login,
    quickLogin,
    logout,
    selectBranch,
    isAuthenticated,
    branchOptions,
    branchSelectionRequired,
    isLoading,
  } = useAuth();
  const { toast } = useToast();

  const loadQuickStaff = async () => {
    if (!localDevice) return;
    setQuickLoading(true);
    setQuickError(null);
    try {
      const staff = await fetchPosQuickStaff(localDevice);
      setQuickStaff(staff);
    } catch (error: any) {
      setQuickStaff([]);
      setQuickError(error.message || "تعذر تحميل موظفي الجهاز");
    } finally {
      setQuickLoading(false);
    }
  };

  useEffect(() => {
    if (localDevice && !showFullLogin && !branchSelectionRequired && !isAuthenticated) {
      void loadQuickStaff();
    }
  }, [showFullLogin, branchSelectionRequired, isAuthenticated]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError(null);

    if (!username.trim() || !password) {
      setLoginError("اكتب اسم المستخدم وكلمة المرور.");
      return;
    }

    try {
      setIsSubmitting(true);
      await login(username.trim(), password);
    } catch (error: any) {
      setLoginError(error.message || "حدث خطأ في تسجيل الدخول");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickLogin = async () => {
    if (!localDevice || !selectedStaff || !/^\d{4,6}$/.test(pin)) return;
    setLoginError(null);
    try {
      setIsSubmitting(true);
      await quickLogin(localDevice, selectedStaff.user_id, pin);
    } catch (error: any) {
      setLoginError(error.message || "PIN غير صحيح");
      setPin("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const pressDigit = (digit: string) => {
    if (isSubmitting) return;
    setLoginError(null);
    setPin(value => (value.length < 6 ? `${value}${digit}` : value));
  };

  const handleBranchSelection = async (branchId: string) => {
    setLoginError(null);
    try {
      setSelectingBranchId(branchId);
      await selectBranch(branchId);
    } catch (error: any) {
      setLoginError(error.message || "تعذر اختيار الفرع");
    } finally {
      setSelectingBranchId(null);
    }
  };

  const changeAccount = async () => {
    await logout();
    setPassword("");
    setLoginError(null);
  };

  if (isAuthenticated) return <Navigate to="/" replace />;

  const busy = isSubmitting || isLoading;

  const shell = (children: React.ReactNode) => (
    <div dir="rtl" className="min-h-screen bg-[radial-gradient(circle_at_top,#e8f5ee_0,#f8faf9_42%,#f4f6f5_100%)] px-4 py-8 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#005931] text-white shadow-lg shadow-green-900/15">
            <Store className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">المعداوي POS</h1>
          <p className="mt-1 text-sm text-slate-500">دخول سريع وآمن لموظفي الفرع</p>
        </div>
        {children}
      </div>
    </div>
  );

  if (branchSelectionRequired) {
    return shell(
      <Card className="border-0 shadow-xl shadow-slate-900/5">
        <CardHeader className="pb-4">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-[#005931]"><ShieldCheck className="h-5 w-5" /></div>
          <CardTitle className="text-xl">هتشتغل من أنهي فرع؟</CardTitle>
          <CardDescription>اختار فرع العمل الحالي، والصلاحيات والمخزون هيتحددوا تلقائيًا.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loginError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4 ml-2" /><AlertDescription>{loginError}</AlertDescription></Alert>}
          <div className="space-y-2">
            {branchOptions.map(branch => {
              const loadingThis = selectingBranchId === branch.branch_id;
              return (
                <button key={branch.branch_id} type="button" disabled={Boolean(selectingBranchId)} onClick={() => void handleBranchSelection(branch.branch_id)} className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-right transition hover:border-[#005931]/40 hover:bg-green-50/50 disabled:opacity-60">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-[#005931]"><Store className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="truncate font-bold text-slate-900">{branch.branch_name}</span>{branch.is_primary && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">أساسي</span>}</div>
                      <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-500"><span>{branch.branch_code}</span><span>•</span><span>{branch.role_name_ar}</span></div>
                    </div>
                    <div className="text-[#005931]">{loadingThis ? <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ArrowRight className="h-5 w-5 rotate-180" />}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <Button type="button" variant="ghost" className="w-full" onClick={() => void changeAccount()} disabled={Boolean(selectingBranchId)}>تسجيل الدخول بحساب مختلف</Button>
        </CardContent>
      </Card>,
    );
  }

  if (localDevice && !showFullLogin) {
    if (selectedStaff) {
      return shell(
        <Card className="border-0 shadow-xl shadow-slate-900/5">
          <CardHeader className="items-center text-center pb-3">
            <button type="button" onClick={() => { setSelectedStaff(null); setPin(""); setLoginError(null); }} className="self-start text-sm text-slate-500 hover:text-slate-900">رجوع للموظفين</button>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-2xl font-bold text-[#005931]">{selectedStaff.name.trim().charAt(0) || "م"}</div>
            <CardTitle className="text-xl">{selectedStaff.name}</CardTitle>
            <CardDescription>{selectedStaff.role_name_ar} · {localDevice.device_name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loginError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4 ml-2" /><AlertDescription>{loginError}</AlertDescription></Alert>}
            <div className="flex h-12 items-center justify-center gap-2 rounded-2xl border bg-slate-50">
              {Array.from({ length: 6 }).map((_, index) => <span key={index} className={`h-3 w-3 rounded-full ${index < pin.length ? "bg-[#005931]" : "bg-slate-200"}`} />)}
            </div>
            <div className="grid grid-cols-3 gap-2" dir="ltr">
              {["1","2","3","4","5","6","7","8","9"].map(digit => <Button key={digit} type="button" variant="outline" className="h-14 text-lg" onClick={() => pressDigit(digit)} disabled={busy}>{digit}</Button>)}
              <Button type="button" variant="ghost" className="h-14" onClick={() => setPin("")} disabled={busy}>مسح</Button>
              <Button type="button" variant="outline" className="h-14 text-lg" onClick={() => pressDigit("0")} disabled={busy}>0</Button>
              <Button type="button" variant="ghost" className="h-14" onClick={() => setPin(value => value.slice(0,-1))} disabled={busy}><Delete className="h-5 w-5" /></Button>
            </div>
            <Button className="h-12 w-full bg-[#005931] hover:bg-[#004a29]" onClick={() => void handleQuickLogin()} disabled={busy || pin.length < 4}>
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} دخول بالـPIN
            </Button>
          </CardContent>
        </Card>,
      );
    }

    return shell(
      <Card className="border-0 shadow-xl shadow-slate-900/5">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div><CardTitle className="text-xl">اختار اسمك</CardTitle><CardDescription className="mt-1">{localDevice.device_name} · جهاز مسجل للفرع</CardDescription></div>
            <div className="rounded-xl bg-green-50 p-2 text-[#005931]"><ShieldCheck className="h-5 w-5" /></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {quickError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4 ml-2" /><AlertDescription>{quickError}</AlertDescription></Alert>}
          {quickLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" /> جاري تحميل الموظفين</div>
          ) : quickStaff.length ? (
            <div className="grid grid-cols-2 gap-3">
              {quickStaff.map(staff => (
                <button key={staff.user_id} type="button" onClick={() => { setSelectedStaff(staff); setPin(""); setLoginError(null); }} className="rounded-2xl border bg-white p-4 text-center transition hover:border-[#005931]/40 hover:bg-green-50/50">
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 font-bold text-[#005931]">{staff.name.trim().charAt(0) || <UserRound className="h-5 w-5" />}</div>
                  <div className="truncate font-bold text-slate-900">{staff.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{staff.role_name_ar}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-6 text-center">
              <UserRound className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              <div className="font-semibold text-slate-800">مفيش موظفين جاهزين للدخول السريع</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">ادخل بحساب المدير، ومن المستخدمين فعّل POS وحدد PIN لكل كاشير.</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => void loadQuickStaff()} disabled={quickLoading}><RefreshCw className={`h-4 w-4 ${quickLoading ? "animate-spin" : ""}`} /> تحديث</Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={() => { setShowFullLogin(true); setLoginError(null); }}><Settings2 className="h-4 w-4" /> دخول المدير</Button>
          </div>
        </CardContent>
      </Card>,
    );
  }

  return shell(
    <Card className="border-0 shadow-xl shadow-slate-900/5">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-xl">دخول المدير / الحساب الكامل</CardTitle>
        <CardDescription>استخدم اسم المستخدم وكلمة المرور للإدارة أو إعداد جهاز الكاشير.</CardDescription>
      </CardHeader>
      <CardContent>
        {loginError && <Alert variant="destructive" className="mb-4"><AlertTriangle className="h-4 w-4 ml-2" /><AlertDescription>{loginError}</AlertDescription></Alert>}
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2"><Label htmlFor="username">اسم المستخدم</Label><Input id="username" autoComplete="username" placeholder="اسم المستخدم" value={username} onChange={event => setUsername(event.target.value)} className="h-12 rounded-xl" disabled={busy} /></div>
          <div className="space-y-2">
            <Label htmlFor="password">كلمة المرور</Label>
            <div className="relative">
              <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="كلمة المرور" value={password} onChange={event => setPassword(event.target.value)} className="h-12 rounded-xl pl-11" disabled={busy} />
              <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 left-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-700" aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
          </div>
          <Button type="submit" className="h-12 w-full rounded-xl bg-[#005931] hover:bg-[#004a29]" disabled={busy}>{busy ? <span className="flex items-center gap-2"><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> جاري تسجيل الدخول</span> : <span className="flex items-center gap-2"><LogIn className="h-4 w-4" /> تسجيل الدخول</span>}</Button>
        </form>
        {localDevice && <Button type="button" variant="ghost" className="mt-3 w-full" onClick={() => { setShowFullLogin(false); setLoginError(null); }}>الرجوع لدخول الكاشير السريع</Button>}
      </CardContent>
    </Card>,
  );
}
