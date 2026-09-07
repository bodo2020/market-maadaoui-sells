import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { LogIn, Eye, EyeOff, AlertTriangle, Store, ArrowRight, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectingBranchId, setSelectingBranchId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const {
    login,
    logout,
    selectBranch,
    isAuthenticated,
    branchOptions,
    branchSelectionRequired,
    isLoading,
  } = useAuth();
  const { toast } = useToast();

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError(null);

    if (!username.trim() || !password) {
      setLoginError("اكتب اسم المستخدم وكلمة المرور.");
      toast({
        title: "بيانات ناقصة",
        description: "اكتب اسم المستخدم وكلمة المرور للمتابعة",
        variant: "destructive",
      });
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

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const busy = isSubmitting || isLoading;

  return (
    <div dir="rtl" className="min-h-screen bg-[radial-gradient(circle_at_top,#e8f5ee_0,#f8faf9_42%,#f4f6f5_100%)] px-4 py-8 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#005931] text-white shadow-lg shadow-green-900/15">
            <Store className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">إدارة المعداوي</h1>
          <p className="mt-1 text-sm text-slate-500">دخول الموظفين والفروع</p>
        </div>

        {branchSelectionRequired ? (
          <Card className="border-0 shadow-xl shadow-slate-900/5">
            <CardHeader className="pb-4">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-[#005931]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <CardTitle className="text-xl">هتشتغل من أنهي فرع؟</CardTitle>
              <CardDescription>
                حسابك مسموح له بأكتر من فرع. اختار فرع العمل الحالي، والصلاحيات والمخزون هيتحددوا تلقائيًا.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loginError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4 ml-2" />
                  <AlertDescription>{loginError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                {branchOptions.map(branch => {
                  const loadingThis = selectingBranchId === branch.branch_id;
                  return (
                    <button
                      key={branch.branch_id}
                      type="button"
                      disabled={Boolean(selectingBranchId)}
                      onClick={() => void handleBranchSelection(branch.branch_id)}
                      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-right transition hover:border-[#005931]/40 hover:bg-green-50/50 disabled:opacity-60"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-[#005931]">
                          <Store className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-bold text-slate-900">{branch.branch_name}</span>
                            {branch.is_primary && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">أساسي</span>}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-500">
                            <span>{branch.branch_code}</span>
                            <span>•</span>
                            <span>{branch.role_name_ar}</span>
                          </div>
                        </div>
                        <div className="text-[#005931]">
                          {loadingThis ? <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ArrowRight className="h-5 w-5 rotate-180" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <Button type="button" variant="ghost" className="w-full" onClick={() => void changeAccount()} disabled={Boolean(selectingBranchId)}>
                تسجيل الدخول بحساب مختلف
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-xl shadow-slate-900/5">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl">أهلًا برجوعك</CardTitle>
              <CardDescription>اكتب بيانات حسابك، وإحنا هنحدد الفروع المسموح لك بيها تلقائيًا.</CardDescription>
            </CardHeader>
            <CardContent>
              {loginError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertTriangle className="h-4 w-4 ml-2" />
                  <AlertDescription>{loginError}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="username">اسم المستخدم</Label>
                  <Input
                    id="username"
                    autoComplete="username"
                    placeholder="اسم المستخدم"
                    value={username}
                    onChange={event => setUsername(event.target.value)}
                    className="h-12 rounded-xl"
                    disabled={busy}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">كلمة المرور</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="كلمة المرور"
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      className="h-12 rounded-xl pl-11"
                      disabled={busy}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(value => !value)}
                      className="absolute inset-y-0 left-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-700"
                      aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="h-12 w-full rounded-xl bg-[#005931] hover:bg-[#004a29]" disabled={busy}>
                  {busy ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      جاري تسجيل الدخول
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <LogIn className="h-4 w-4" />
                      تسجيل الدخول
                    </span>
                  )}
                </Button>
              </form>

              <p className="mt-5 text-center text-xs leading-5 text-slate-500">
                مش محتاج تكتب كود الفرع. بعد التحقق من الحساب هنفتح الفرع الوحيد تلقائيًا أو نخليك تختار من الفروع المسموح لك بيها.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
