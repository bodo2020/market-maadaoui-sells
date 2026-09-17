import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { fetchMyTenantRuntime } from "@/services/supabase/saasControlService";
import { UserRole } from "@/types";

function BlockedState({ title, message, onRetry, loading }: {
  title: string;
  message: string;
  onRetry: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-5" dir="rtl">
      <div className="w-full max-w-lg rounded-3xl border border-red-200 bg-white p-7 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-700">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-xl font-black text-slate-950">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">{message}</p>
        <Button variant="outline" className="mt-6" onClick={onRetry} disabled={loading}>
          <RefreshCw className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          إعادة التحقق
        </Button>
      </div>
    </div>
  );
}

export default function TenantRuntimeGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;

  const query = useQuery({
    queryKey: ["tenant-runtime-control", user?.id],
    queryFn: fetchMyTenantRuntime,
    enabled: Boolean(user && !isSuperAdmin),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  // Platform operators must always be able to enter the control center and restore a tenant.
  if (isSuperAdmin) return <>{children}</>;

  if (query.isLoading) {
    return <div className="flex h-screen items-center justify-center bg-slate-50 text-sm font-bold text-slate-500">جاري التحقق من حالة النظام...</div>;
  }

  if (query.isError || !query.data) {
    return (
      <BlockedState
        title="تعذر التحقق من ترخيص النظام"
        message="لم نتمكن من التحقق من حالة تشغيل حساب الشركة. أعد المحاولة بعد استعادة الاتصال."
        onRetry={() => void query.refetch()}
        loading={query.isFetching}
      />
    );
  }

  const runtime = query.data;
  const message = runtime.block_message_ar || runtime.block_reason || "الخدمة متوقفة مؤقتًا. تواصل مع إدارة المنصة للمزيد من التفاصيل.";

  if (!runtime.app_access_enabled) {
    return <BlockedState title="تم إيقاف النظام لهذه الشركة" message={message} onRetry={() => void query.refetch()} loading={query.isFetching} />;
  }

  const isPosRoute = location.pathname === "/" || location.pathname === "/pos";
  if (isPosRoute && !runtime.pos_enabled) {
    return <BlockedState title="نقطة البيع متوقفة" message={message} onRetry={() => void query.refetch()} loading={query.isFetching} />;
  }

  if (!isPosRoute && !runtime.admin_enabled) {
    return <BlockedState title="لوحة الإدارة متوقفة" message={message} onRetry={() => void query.refetch()} loading={query.isFetching} />;
  }

  return <>{children}</>;
}
