import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";
import { LoaderCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchMyFranchisePortalIdentity,
  hasFranchisePortalSession,
} from "@/services/supabase/franchisePortalService";

export default function FranchisePortalRoute({ children }: { children: ReactNode }) {
  const location = useLocation();

  const query = useQuery({
    queryKey: ["franchise-portal-identity"],
    queryFn: async () => {
      if (!(await hasFranchisePortalSession())) return null;
      return fetchMyFranchisePortalIdentity();
    },
    staleTime: 30_000,
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-slate-50 px-6">
        <div className="text-center">
          <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-[#005931]" />
          <p className="mt-3 text-sm font-bold text-slate-500">جارٍ التحقق من صلاحية بوابة الـFranchise…</p>
        </div>
      </div>
    );
  }

  if (!query.data && !query.error) {
    return <Navigate to="/franchise-login" replace state={{ from: location.pathname }} />;
  }

  if (query.error) {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-slate-50 px-6">
        <div className="w-full max-w-lg rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto h-10 w-10 text-red-600" />
          <h1 className="mt-4 text-xl font-black text-slate-950">لا يمكن فتح بوابة الـFranchise</h1>
          <p className="mt-2 text-sm font-bold leading-7 text-slate-500">
            {query.error instanceof Error ? query.error.message : "راجع صلاحية الحساب وحاول مرة أخرى."}
          </p>
          <Button className="mt-6 bg-[#005931] hover:bg-[#004a29]" onClick={() => query.refetch()}>
            إعادة المحاولة
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
