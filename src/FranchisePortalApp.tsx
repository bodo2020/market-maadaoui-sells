import { Navigate, Route, Routes } from "react-router-dom";
import FranchisePortalRoute from "@/components/franchise/FranchisePortalRoute";
import FranchisePortalDashboard from "@/pages/FranchisePortalDashboard";
import FranchisePortalLogin from "@/pages/FranchisePortalLogin";
import FranchiseAuthCompletionPage from "@/pages/FranchiseAuthCompletionPage";

export default function FranchisePortalApp() {
  const authCallback = typeof window !== "undefined" && (window.location.hash.includes("type=invite") || window.location.hash.includes("type=recovery"));
  return (
    <Routes>
      <Route path="/franchise-login" element={<FranchisePortalLogin />} />
      <Route path="/franchise-auth" element={<FranchiseAuthCompletionPage />} />
      <Route path="/franchise-portal" element={<FranchisePortalRoute><FranchisePortalDashboard /></FranchisePortalRoute>} />
      <Route path="/franchise-portal/:merchantId" element={<FranchisePortalRoute><FranchisePortalDashboard /></FranchisePortalRoute>} />
      <Route path="*" element={authCallback ? <FranchiseAuthCompletionPage /> : <Navigate to="/franchise-login" replace />} />
    </Routes>
  );
}
