import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getHrAccess, hasHrCapability, HrCapability } from "@/lib/hrAccess";

export default function HrAccessRoute({ children, capability }: { children: ReactNode; capability: HrCapability }) {
  const { user } = useAuth();
  const location = useLocation();
  const access = getHrAccess(user);

  if (!hasHrCapability(access, capability)) {
    return <Navigate to="/" replace state={{ deniedPath: location.pathname }} />;
  }

  return <>{children}</>;
}
