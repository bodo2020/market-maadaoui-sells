import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, RefreshCw, ShieldCheck, Store, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  acceptMyFranchiseInvitation,
  fetchMyPendingFranchiseInvitations,
  franchiseAccountRoleLabel,
  setFranchiseAccountPassword,
} from "@/services/supabase/franchiseAccountService";

function validPassword(value: string) {
  return value.length >= 12 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

export default function FranchiseAuthCompletionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedInviteId, setSelectedInviteId] = useState<string | null>(null);

  const resetRequested = useMemo(() => new URLSearchParams(location.search).get("mode") === "reset", [location.search]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error) setSessionError("تعذر التحقق من رابط الدخول.");
      if (data.session?.user) setUserId(data.session.user.id);
      setSessionReady(true);
    };
    void load();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) {
        setUserId(session.user.id);
        setSessionError(null);
        setSessionReady(true);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const invitesQuery = useQuery({
    queryKey: ["my-pending-franchise-invitations", userId],
    queryFn: fetchMyPendingFranchiseInvitations,
    enabled: Boolean(userId),
    retry: false,
  });

  useEffect(() => {
    if (!selectedInviteId && invitesQuery.data?.length) setSelectedInviteId(invitesQuery.data[0].id);
  }, [invitesQuery.data, selectedInviteId]);

  const selectedInvite = invitesQuery.data?.find((item) => item.id === selectedInviteId) || null;
  const isInvitationFlow = Boolean(selectedInvite || invitesQuery.data?.length);

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!validPassword(password)) {
        throw new Error("كلمة المرور لازم تكون 12 حرف على الأقل وتحتوي حرف كبير وصغير ورقم ورمز.");
      }
      if (password !== confirmPassword) throw new Error("تأكيد كلمة المرور غير مطابق.");
      await setFranchiseAccountPassword(password);
      if (selectedInviteId) return acceptMyFranchiseInvitation(selectedInviteId);
      return null;
    },
    onSuccess: async (result) => {
      if (result?.merchant_id) {
        navigate(`/franchise-portal/${result.merchant_id}`, { replace: true });
      } else {
        await supabase.auth.signOut();
        navigate("/franchise-login", { replace: true });
      }
    },
  });

  if (!sessionReady) {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <div className="text-center font-bold text-slate-500"><RefreshCw className="mx-auto mb-3 h-7 w-7 animate-spin text-[#005931]" />جارٍ التحقق من رابط الحساب…</div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <Card className="w-full max-w-lg rounded-3xl border-0 shadow-xl">
          <CardHeader><CardTitle className="text-2xl font-black">الرابط غير صالح أو انتهت صلاحيته</CardTitle><CardDescription>{sessionError || "اطلب من مسؤول المعداوي إعادة إرسال الدعوة أو رابط استرجاع كلمة المرور."}</CardDescription></CardHeader>
          <CardContent><Button className="w-full bg-[#005931] hover:bg-[#004a29]" onClick={() => navigate("/franchise-login", { replace: true })}>العودة لتسجيل الدخول</Button></CardContent>
        </Card>
      </div>
    );
  }

  if (invitesQuery.isLoading) {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <div className="text-center font-bold text-slate-500"><RefreshCw className="mx-auto mb-3 h-7 w-7 animate-spin text-[#005931]" />جارٍ تحميل بيانات الدعوة…</div>
      </div>
    );
  }

  if (!isInvitationFlow && !resetRequested) {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <Card className="w-full max-w-lg rounded-3xl border-0 shadow-xl">
          <CardHeader><CardTitle className="text-2xl font-black">لا توجد دعوة معلقة لهذا البريد</CardTitle><CardDescription>قد تكون الدعوة قُبلت بالفعل أو انتهت صلاحيتها.</CardDescription></CardHeader>
          <CardContent><Button className="w-full bg-[#005931] hover:bg-[#004a29]" onClick={() => navigate("/franchise-login", { replace: true })}>فتح بوابة الـFranchise</Button></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[minmax(0,1fr)_470px]">
      <section className="relative hidden overflow-hidden bg-[#005931] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_10%,white_0,transparent_32%),radial-gradient(circle_at_80%_90%,#3ddc97_0,transparent_28%)]" />
        <div className="relative z-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/20"><Store className="h-7 w-7" /></div>
          <h1 className="mt-6 text-4xl font-black">بوابة Franchise المعداوي</h1>
          <p className="mt-3 max-w-xl text-lg leading-8 text-emerald-50">الحساب ملكك أنت. مسؤول المعداوي يحدد الصلاحية، لكن كلمة المرور لا يراها ولا يكتبها أي مدير.</p>
        </div>
        <div className="relative z-10 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><ShieldCheck className="h-5 w-5" /><div className="mt-2 font-bold">دعوة مرتبطة بالبريد</div></div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><LockKeyhole className="h-5 w-5" /><div className="mt-2 font-bold">كلمة مرور خاصة بك</div></div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><UserCheck className="h-5 w-5" /><div className="mt-2 font-bold">صلاحية حسب الدور</div></div>
        </div>
      </section>

      <main className="flex min-h-screen items-center justify-center p-4 sm:p-8">
        <Card className="w-full max-w-md rounded-3xl border-0 shadow-xl shadow-slate-900/5">
          <CardHeader>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#005931]"><KeyRound className="h-6 w-6" /></div>
            <CardTitle className="text-2xl font-black">{isInvitationFlow ? "إعداد حساب الـFranchise" : "تعيين كلمة مرور جديدة"}</CardTitle>
            <CardDescription>{isInvitationFlow ? "راجع الدعوة واختار كلمة مرور قوية، وبعدها هيتفعل وصولك مباشرة." : "اختار كلمة مرور جديدة للحساب ثم سجل دخولك مرة ثانية."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {isInvitationFlow && invitesQuery.data?.length ? (
              <div className="space-y-2">
                <Label>الدعوة</Label>
                {invitesQuery.data.map((invite) => (
                  <button key={invite.id} type="button" onClick={() => setSelectedInviteId(invite.id)} className={`w-full rounded-2xl border p-3 text-right transition ${selectedInviteId === invite.id ? "border-[#005931] bg-emerald-50" : "border-slate-200 bg-white"}`}>
                    <div className="flex items-center justify-between gap-2"><span className="font-black">{invite.merchant_name}</span><Badge variant="outline">{franchiseAccountRoleLabel(invite.role)}</Badge></div>
                    <p className="mt-1 text-[11px] font-bold text-slate-500">تنتهي {new Date(invite.expires_at).toLocaleString("ar-EG")}</p>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>كلمة المرور الجديدة</Label>
              <div className="relative">
                <Input dir="ltr" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="pl-10" autoComplete="new-password" />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
              <p className="text-[11px] leading-5 text-slate-400">12 حرف على الأقل + حرف كبير + حرف صغير + رقم + رمز.</p>
            </div>

            <div className="space-y-2">
              <Label>تأكيد كلمة المرور</Label>
              <Input dir="ltr" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
            </div>

            {completeMutation.error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{completeMutation.error instanceof Error ? completeMutation.error.message : "تعذر إكمال الحساب"}</div> : null}

            <Button className="h-12 w-full rounded-xl bg-[#005931] hover:bg-[#004a29]" disabled={completeMutation.isPending || !password || !confirmPassword || (isInvitationFlow && !selectedInviteId)} onClick={() => completeMutation.mutate()}>
              {completeMutation.isPending ? <RefreshCw className="ml-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-2 h-5 w-5" />}
              {completeMutation.isPending ? "جارٍ الحفظ…" : isInvitationFlow ? "تعيين كلمة المرور وقبول الدعوة" : "حفظ كلمة المرور الجديدة"}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
