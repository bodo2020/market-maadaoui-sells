import { Navigate, Route, Routes } from 'react-router-dom';
import FranchisePortalRoute from '@/components/franchise/FranchisePortalRoute';
import FranchisePortalWorkspace from '@/components/franchise/FranchisePortalWorkspace';
import FranchisePortalLogin from '@/pages/FranchisePortalLogin';
import FranchiseAuthCompletionPage from '@/pages/FranchiseAuthCompletionPage';
import FranchiseOperationsPage from '@/pages/FranchiseOperationsPage';

export default function FranchisePortalApp() {
  const authCallback = typeof window !== 'undefined' && (window.location.hash.includes('type=invite') || window.location.hash.includes('type=recovery'));
  return (
    <Routes>
      <Route path='/franchise-login' element={<FranchisePortalLogin />} />
      <Route path='/franchise-auth' element={<FranchiseAuthCompletionPage />} />
      <Route path='/franchise-portal' element={<FranchisePortalRoute><FranchisePortalWorkspace /></FranchisePortalRoute>} />
      <Route path='/franchise-portal/operations' element={<FranchisePortalRoute><FranchiseOperationsPage /></FranchisePortalRoute>} />
      <Route path='/franchise-portal/:merchantId' element={<FranchisePortalRoute><FranchisePortalWorkspace /></FranchisePortalRoute>} />
      <Route path='/franchise-portal/:merchantId/operations' element={<FranchisePortalRoute><FranchiseOperationsPage /></FranchisePortalRoute>} />
      <Route path='*' element={authCallback ? <FranchiseAuthCompletionPage /> : <Navigate to='/franchise-login' replace />} />
    </Routes>
  );
}
