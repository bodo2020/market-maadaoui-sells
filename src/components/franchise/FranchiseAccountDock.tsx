import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import {
  Ban,
  Clock3,
  History,
  KeyRound,
  Laptop2,
  Mail,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchFranchiseAccounts,
  franchiseAccountRoleLabel,
  inviteFranchiseAccount,
  resendFranchiseInvitation,
  revokeFranchiseInvitation,
  sendFranchisePasswordReset,
  setFranchiseAccountActive,
  updateFranchiseAccountRole,
  type FranchiseAccountRole,
} from "@/services/supabase/franchiseAccountService";
import { toast } from "sonner";

const roleOptions: FranchiseAccountRole[] = ["owner", "admin", "manager"];

const eventLabels: Record<string, string> = {
  invitation_created: "إنشاء دعوة",
  invitation_refreshed: "تجديد دعوة",
  invitation_delivery_sent: "إرسال الدعوة",
  invitation_delivery_failed: "فشل إرسال الدعوة",
  invitation_accepted: "قبول الدعوة",
  invitation_revoked: "إلغاء الدعوة",
  member_role_changed: "تغيير الدور",
  member_disabled: "إيقاف الحساب",
  member_reactivated: "إعادة تفعيل الحساب",
  password_reset_sent: "إرسال إعادة تعيين كلمة المرور",
  password_reset_failed: "فشل إعادة تعيين كلمة المرور",
};

function dateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
}

export default function FranchiseAccountDock() {
  const location = useLocation();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const match = useMemo(() => location.pathname.match(/^\/franchise\/([^/]+)$/), [location.pathname]);
  const merchantId = match?.[1] && match[1] !== "new" ? match[1] : null;
  const [open, setOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<FranchiseAccountRole>("manager");

  const queryKey = ["franchise-accounts", merchantId];
  const query = useQuery({
    queryKey,
    queryFn: () => fetchFranchiseAccounts(merchantId!),
    enabled: Boolean(open && merchantId && isAdmin),
    staleTime: 10_000,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["franchise-accounts", merchantId] });
  };

  const inviteMutation = useMutation({
    mutationFn: () => inviteFranchiseAccount(merchantId!, inviteEmail.trim(), inviteRole),
    onSuccess: async (result: any) => {
      toast.success(result?.existing_account ? "تم إرسال رابط إعداد/استرجاع للحساب الموجود" : "تم إرسال دعوة إنشاء حساب الـFranchise");
      setInviteEmail("");
      setInviteRole("manager");
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر إرسال الدعوة"),
  });

  const resendMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: FranchiseAccountRole }) => resendFranchiseInvitation(merchantId!, email, role),
    onSuccess: async () => { toast.success("تمت إعادة إرسال رابط الدعوة"); await refresh(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر إعادة الإرسال"),
  });

  const revokeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string | null }) => revokeFranchiseInvitation(id, reason),
    onSuccess: async () => { toast.success("تم إلغاء الدعوة"); await refresh(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر إلغاء الدعوة"),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: FranchiseAccountRole }) => updateFranchiseAccountRole(merchantId!, userId, role, "تغيير الدور من Franchise 360"),
    onSuccess: async () => { toast.success("تم تحديث دور الحساب"); await refresh(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث الدور"),
  });

  const activeMutation = useMutation({
    mutationFn: ({ userId, active, reason }: { userId: string; active: boolean; reason: string | null }) => setFranchiseAccountActive(merchantId!, userId, active, reason),
    onSuccess: async (result: any) => { toast.success(result?.is_active ? "تمت إعادة تفعيل الحساب" : "تم إيقاف الحساب"); await refresh(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث حالة الحساب"),
  });

  const resetMutation = useMutation({
    mutationFn: (userId: string) => sendFranchisePasswordReset(merchantId!, userId),
    onSuccess: async () => { toast.success("تم إرسال رابط إعادة تعيين كلمة المرور"); await refresh(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر إرسال رابط إعادة التعيين"),
  });

  if (!merchantId || !isAdmin) return null;

  const data = query.data;
  const pendingInvites = data?.invitations.filter((item) => item.status === "pending") || [];
  const activePortalAccounts = data?.accounts.filter((item) => item.portal_access && item.is_active).length || 0;

  const submitInvite = (event: React.FormEvent) => {
    event.preventDefault();
    if (!inviteEmail.trim()) return toast.error("اكتب البريد الإلكتروني للمشغل");
    inviteMutation.mutate();
  };

  const disableAccount = (userId: string) => {
    const reason = window.prompt("اكتب سبب إيقاف حساب الـFranchise:");
    if (reason === null) return;
    if (!reason.trim()) return toast.error("سبب الإيقاف مطلوب");
    activeMutation.mutate({ userId, active: false, reason: reason.trim() });
  };

  const revokeInvite = (id: string) => {
    const reason = window.prompt("سبب إلغاء الدعوة (اختياري):");
    if (reason === null) return;
    revokeMutation.mutate({ id, reason: reason.trim() || null });
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-40 h-12 rounded-full bg-[#005931] px-5 shadow-xl hover:bg-[#004a29]"
      >
        <UsersRound className="ml-2 h-5 w-5" />
        حسابات المشغل
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-h-[92vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl font-black">
              <ShieldCheck className="h-6 w-6 text-[#005931]" />
              حسابات ودعوات الـFranchise
            </DialogTitle>
            <DialogDescription>
              إدارة وصول المشغل بدون مشاركة كلمات المرور. الدعوات وReset Password يتم إرسالهم من Supabase Auth مباشرة للمستخدم.
            </DialogDescription>
          </DialogHeader>

          {query.isLoading ? (
            <div className="grid min-h-[280px] place-items-center text-sm font-bold text-slate-400">
              <div className="text-center"><RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-[#005931]" />جارٍ تحميل الحسابات…</div>
            </div>
          ) : query.error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 font-bold text-red-800">
              {query.error instanceof Error ? query.error.message : "تعذر تحميل حسابات المشغل"}
            </div>
          ) : data ? (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border bg-slate-50 p-4"><div className="text-xs font-black text-slate-400">الحسابات النشطة</div><div className="mt-1 text-2xl font-black">{activePortalAccounts}</div></div>
                <div className="rounded-2xl border bg-slate-50 p-4"><div className="text-xs font-black text-slate-400">دعوات معلقة</div><div className="mt-1 text-2xl font-black">{pendingInvites.length}</div></div>
                <div className="rounded-2xl border bg-slate-50 p-4"><div className="text-xs font-black text-slate-400">المشغل</div><div className="mt-1 truncate text-lg font-black">{data.merchant.name}</div></div>
              </div>

              <form onSubmit={submitInvite} className="rounded-3xl border border-emerald-100 bg-emerald-50/40 p-4">
                <div className="mb-3 flex items-center gap-2 font-black text-[#005931]"><UserPlus className="h-5 w-5" />دعوة حساب جديد</div>
                <div className="grid gap-3 md:grid-cols-[1fr_190px_auto] md:items-end">
                  <div className="space-y-1.5">
                    <Label>البريد الإلكتروني</Label>
                    <Input dir="ltr" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="owner@example.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>الدور</Label>
                    <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as FranchiseAccountRole)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      {roleOptions.map((role) => <option key={role} value={role}>{franchiseAccountRoleLabel(role)}</option>)}
                    </select>
                  </div>
                  <Button type="submit" className="bg-[#005931] hover:bg-[#004a29]" disabled={inviteMutation.isPending}>
                    <Mail className="ml-2 h-4 w-4" />
                    {inviteMutation.isPending ? "جارٍ الإرسال…" : "إرسال الدعوة"}
                  </Button>
                </div>
              </form>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-black">الحسابات المرتبطة</h3>
                  <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
                    <RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث
                  </Button>
                </div>
                {data.accounts.length ? data.accounts.map((account) => (
                  <div key={account.user_id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span dir="ltr" className="font-black text-slate-900">{account.email || account.user_id}</span>
                          <Badge variant="outline" className={account.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}>{account.is_active ? "نشط" : "موقوف"}</Badge>
                          <Badge variant="outline">{franchiseAccountRoleLabel(account.role)}</Badge>
                          {account.account_kind === "internal_staff_link" ? <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">حساب موظف داخلي</Badge> : <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Franchise Email</Badge>}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-bold text-slate-500">
                          <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />آخر دخول: {dateTime(account.last_sign_in_at)}</span>
                          <span className="inline-flex items-center gap-1"><Laptop2 className="h-3.5 w-3.5" />جلسات فعالة: {account.active_session_count || 0}</span>
                          {account.last_user_agent ? <span className="max-w-[420px] truncate" dir="ltr">{account.last_user_agent}</span> : null}
                        </div>
                      </div>

                      {account.portal_access ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={account.role}
                            disabled={roleMutation.isPending}
                            onChange={(event) => roleMutation.mutate({ userId: account.user_id, role: event.target.value as FranchiseAccountRole })}
                            className="h-9 rounded-md border border-input bg-background px-2 text-xs font-bold"
                          >
                            {roleOptions.map((role) => <option key={role} value={role}>{franchiseAccountRoleLabel(role)}</option>)}
                          </select>
                          {account.email_deliverable ? (
                            <Button variant="outline" size="sm" onClick={() => resetMutation.mutate(account.user_id)} disabled={resetMutation.isPending}>
                              <KeyRound className="ml-2 h-4 w-4" />Reset Password
                            </Button>
                          ) : null}
                          {account.is_active ? (
                            <Button variant="outline" size="sm" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => disableAccount(account.user_id)} disabled={activeMutation.isPending}>
                              <Ban className="ml-2 h-4 w-4" />إيقاف
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => activeMutation.mutate({ userId: account.user_id, active: true, reason: "إعادة تفعيل من Franchise 360" })} disabled={activeMutation.isPending}>
                              <RotateCcw className="ml-2 h-4 w-4" />إعادة تفعيل
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )) : <div className="rounded-2xl border border-dashed p-7 text-center text-sm font-bold text-slate-400">لا توجد حسابات مرتبطة.</div>}
              </section>

              <section className="space-y-3">
                <h3 className="text-lg font-black">الدعوات</h3>
                {data.invitations.length ? data.invitations.slice(0, 20).map((invite) => (
                  <div key={invite.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span dir="ltr" className="font-black">{invite.email}</span>
                        <Badge variant="outline">{franchiseAccountRoleLabel(invite.role)}</Badge>
                        <Badge variant="outline" className={invite.status === "pending" ? "border-amber-200 bg-amber-50 text-amber-700" : invite.status === "accepted" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}>{invite.status}</Badge>
                      </div>
                      <p className="mt-1 text-[11px] font-bold text-slate-500">أُرسلت: {dateTime(invite.last_sent_at || invite.invited_at)} • تنتهي: {dateTime(invite.expires_at)}{invite.last_error_code ? ` • خطأ: ${invite.last_error_code}` : ""}</p>
                    </div>
                    {invite.status === "pending" ? (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => resendMutation.mutate({ email: invite.email, role: invite.role })} disabled={resendMutation.isPending}>
                          <Mail className="ml-2 h-4 w-4" />إعادة إرسال
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-700" onClick={() => revokeInvite(invite.id)} disabled={revokeMutation.isPending}>إلغاء</Button>
                      </div>
                    ) : null}
                  </div>
                )) : <div className="rounded-2xl border border-dashed p-7 text-center text-sm font-bold text-slate-400">لا توجد دعوات.</div>}
              </section>

              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-lg font-black"><History className="h-5 w-5 text-[#005931]" />آخر نشاط للحسابات</h3>
                {data.events.length ? data.events.slice(0, 15).map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                    <div><span className="font-black">{eventLabels[event.action] || event.action}</span>{event.reason ? <span className="mr-2 text-slate-500">• {event.reason}</span> : null}</div>
                    <span className="shrink-0 font-bold text-slate-400">{dateTime(event.created_at)}</span>
                  </div>
                )) : <div className="text-sm text-slate-400">لا يوجد نشاط بعد.</div>}
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
