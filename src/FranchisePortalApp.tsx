import { Navigate, Route, Routes } from "react-router-dom";
import FranchisePortalRoute from "@/components/franchise/FranchisePortalRoute";
import FranchisePortalDashboard from "@/pages/FranchisePortalDashboard";
import FranchisePortalLogin from "@/pages/FranchisePortalLogin";

export default function FranchisePortalApp() {
  return (
    <Routes>
      <Route path="/franchise-login" element={<FranchisePortalLogin />} />
      <Route path="/franchise-portal" element={<FranchisePortalRoute><FranchisePortalDashboard /></FranchisePortalRoute>} />
      <Route path="/franchise-portal/:merchantId" element={<FranchisePortalRoute><FranchisePortalDashboard /></FranchisePortalRoute>} />
      <Route path="*" element={<Navigate to="/franchise-login" replace />} />
    </Routes>
  );
}
