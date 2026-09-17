import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Building2, Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck, Store, UserRound } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchMyFranchisePortalIdentity,
  hasFranchisePortalSession,
  signInFranchisePortal,
} from "@/services/supabase/franchisePortalService";

export default function FranchisePortalLogin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!(await hasFranchisePortalSession())) return;
        const identity = await fetchMyFranchisePortalIdentity();
        if (active) navigate(`/franchise-portal/${identity.default_merchant_id}`, { replace: true });
      } catch {
        // Existing non-franchise sessions remain untouched; the form can replace them on submit.
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => { active = false; };
  }, [navigate]);

  const mutation = useMutation({
    mutationFn: () => signInFranchisePortal(login, password),
    onSuccess: async (identity) => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["franchise-portal-identity"] });
      navigate(`/franchise-portal/${identity.default_merchant_id}`, { replace: true });
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "تعذر تسجيل الدخول."),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  };

  if (checking) {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-slate-50">
        <LoaderCircle className="h-8 w-8 animate-spin text-[#005931]" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[minmax(0,1fr)_440px]">
      <section className="relative hidden overflow-hidden bg-[#005931] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_10%,white_0,transparent_34%),radial-gradient(circle_at_85%_90%,#42dfa0_0,transparent_28%)]" />
        <div className="relative z-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <Store className="h-7 w-7" />
          </div>
          <h1 className="mt-7 text-4xl font-black">المعداوي Franchise</h1>
          <p className="mt-4 max-w-2xl text-lg font-medium leading-9 text-emerald-50">
            بوابتك لمتابعة الفروع والمبيعات والمخزون والتسويات من مكان واحد، بصلاحيات منفصلة بالكامل عن الإدارة الداخلية لماركت المعداوي.
          </p>
        </div>
        <div className="relative z-10 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><Building2 className="h-5 w-5" /><div className="mt-2 font-bold">فروعك فقط</div></div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><ShieldCheck className="h-5 w-5" /><div className="mt-2 font-bold">عزل بالصلاحيات</div></div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><LockKeyhole className="h-5 w-5" /><div className="mt-2 font-bold">تسويات آمنة</div></div>
        </div>
      </section>

      <main className="flex min-h-screen items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#005931] text-white"><Store className="h-6 w-6" /></div>
            <div><h1 className="text-xl font-black text-slate-950">المعداوي Franchise</h1><p className="text-xs font-bold text-slate-500">بوابة مشغلي الامتياز</p></div>
          </div>

          <Card className="rounded-3xl border-0 shadow-xl shadow-slate-900/5">
            <CardHeader>
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-[#005931]"><UserRound className="h-5 w-5" /></div>
              <CardTitle className="text-2xl font-black">تسجيل دخول المشغّل</CardTitle>
              <CardDescription className="leading-6">استخدم البريد الإلكتروني أو اسم المستخدم المرتبط بحساب الـFranchise.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
                <div className="space-y-2">
                  <Label htmlFor="franchise-login">البريد أو اسم المستخدم</Label>
                  <Input id="franchise-login" autoComplete="username" value={login} onChange={(event) => setLogin(event.target.value)} placeholder="name@example.com" className="h-12 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="franchise-password">كلمة المرور</Label>
                  <div className="relative">
                    <Input id="franchise-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 rounded-xl pl-12" />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="h-12 w-full rounded-xl bg-[#005931] font-black hover:bg-[#004a29]" disabled={mutation.isPending || !login.trim() || !password}>
                  {mutation.isPending ? <LoaderCircle className="ml-2 h-4 w-4 animate-spin" /> : <LockKeyhole className="ml-2 h-4 w-4" />}
                  دخول البوابة
                </Button>
              </form>
            </CardContent>
          </Card>
          <p className="mt-5 text-center text-[11px] font-medium leading-5 text-slate-400">الحسابات تُدار بواسطة المعداوي. لا تشارك بيانات الدخول مع أي شخص.</p>
        </div>
      </main>
    </div>
  );
}
