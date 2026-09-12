import { useState } from "react";
import { Navigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, BriefcaseBusiness, Building2, Eye, EyeOff, LogIn, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function offerPasswordManagerSave(username: string, password: string) {
  try {
    const PasswordCredentialCtor = (window as any).PasswordCredential;
    const credentialStore = (navigator as any).credentials;
    if (!PasswordCredentialCtor || !credentialStore?.store) return;
    const credential = new PasswordCredentialCtor({
      id: username,
      name: username,
      password,
    });
    await credentialStore.store(credential);
  } catch {
    // Android/Google Password Manager may handle saving via Autofill instead.
  }
}

export default function HrLogin() {
  const { login, logout, selectBranch, isAuthenticated, branchSelectionRequired, branchOptions, isLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectingBranchId, setSelectingBranchId] = useState<string | null>(null);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError("اكتب اسم المستخدم وكلمة المرور.");
      return;
    }
    const normalizedUsername = username.trim();
    try {
      setSubmitting(true);
      await login(normalizedUsername, password);
      await offerPasswordManagerSave(normalizedUsername, password);
    } catch (e: any) {
      setError(e?.message || "تعذر تسجيل الدخول");
    } finally {
      setSubmitting(false);
    }
  };

  const chooseBranch = async (branchId: string) => {
    setError(null);
    try {
      setSelectingBranchId(branchId);
      await selectBranch(branchId);
    } catch (e: any) {
      setError(e?.message || "تعذر اختيار الفرع");
    } finally {
      setSelectingBranchId(null);
    }
  };

  const shell = (content: React.ReactNode) => (
    <div dir="rtl" className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[minmax(0,1fr)_440px]">
      <section className="relative hidden overflow-hidden bg-[#005931] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_15%_15%,white_0,transparent_30%),radial-gradient(circle_at_85%_85%,#4ade80_0,transparent_26%)]" />
        <div className="relative z-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/20">
            <BriefcaseBusiness className="h-8 w-8" />
          </div>
          <p className="mt-8 text-sm font-bold text-emerald-100">ELMADAWY HR</p>
          <h1 className="mt-2 text-4xl font-black">المعداوي HR</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-emerald-50">
            إدارة الموظفين، الحضور، الشيفتات، الإجازات، الرواتب، المهام والموافقات في تطبيق مستقل وآمن.
          </p>
        </div>
        <div className="relative z-10 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><UserRound className="h-5 w-5" /><div className="mt-2 font-bold">Employee 360</div></div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><Building2 className="h-5 w-5" /><div className="mt-2 font-bold">فروع وهيكل تنظيمي</div></div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><ShieldCheck className="h-5 w-5" /><div className="mt-2 font-bold">صلاحيات وموافقات</div></div>
        </div>
      </section>

      <main className="flex min-h-screen items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#005931] text-white"><BriefcaseBusiness className="h-6 w-6" /></div>
            <div><h1 className="text-xl font-black">المعداوي HR</h1><p className="text-xs text-muted-foreground">نظام الموارد البشرية</p></div>
          </div>
          {content}
          <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">استخدم حساب الموظف المعتمد. كل عملية حساسة يتم تسجيلها ومراجعتها حسب الصلاحيات.</p>
        </div>
      </main>
    </div>
  );

  if (branchSelectionRequired) {
    return shell(
      <Card className="rounded-3xl border-0 shadow-xl shadow-slate-900/5">
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-[#005931]"><Building2 className="h-5 w-5" /></div>
          <CardTitle className="text-2xl font-black">اختار نطاق العمل</CardTitle>
          <CardDescription>اختار الفرع اللي هتدير بياناته في جلسة HR الحالية.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
          {branchOptions.map((branch) => {
            const selecting = selectingBranchId === branch.branch_id;
            return (
              <button
                key={branch.branch_id}
                type="button"
                disabled={Boolean(selectingBranchId)}
                onClick={() => void chooseBranch(branch.branch_id)}
                className="flex w-full items-center gap-3 rounded-2xl border bg-white p-4 text-right transition hover:border-[#005931]/40 hover:bg-emerald-50/40 disabled:opacity-60"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#005931]"><Building2 className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="truncate font-black">{branch.branch_name}</span>{branch.is_primary && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">أساسي</span>}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{branch.role_name_ar}</div>
                </div>
                {selecting ? <RefreshCw className="h-5 w-5 animate-spin text-[#005931]" /> : <ArrowLeft className="h-5 w-5 text-[#005931]" />}
              </button>
            );
          })}
          <Button variant="ghost" className="w-full" onClick={() => void logout()} disabled={Boolean(selectingBranchId)}>الدخول بحساب مختلف</Button>
        </CardContent>
      </Card>
    );
  }

  return shell(
    <Card className="rounded-3xl border-0 shadow-xl shadow-slate-900/5">
      <CardHeader>
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-[#005931]"><LogIn className="h-5 w-5" /></div>
        <CardTitle className="text-2xl font-black">تسجيل دخول HR</CardTitle>
        <CardDescription>سجّل بحساب الموظف ونفس الصلاحيات المعتمدة داخل منظومة المعداوي.</CardDescription>
      </CardHeader>
      <CardContent>
        <form id="hr-login-form" onSubmit={submit} autoComplete="on" className="space-y-4">
          {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="space-y-2">
            <Label htmlFor="hr-username">اسم المستخدم</Label>
            <Input
              id="hr-username"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              enterKeyHint="next"
              className="h-12 rounded-xl"
              placeholder="اسم المستخدم"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hr-password">كلمة المرور</Label>
            <div className="relative">
              <Input
                id="hr-password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                className="h-12 rounded-xl pl-12"
                placeholder="كلمة المرور"
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="إظهار أو إخفاء كلمة المرور">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
          </div>
          <Button type="submit" disabled={submitting || isLoading} className="h-12 w-full rounded-xl bg-[#005931] font-black hover:bg-[#004526]">
            {submitting || isLoading ? <RefreshCw className="ml-2 h-4 w-4 animate-spin" /> : <LogIn className="ml-2 h-4 w-4" />}
            دخول النظام
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
