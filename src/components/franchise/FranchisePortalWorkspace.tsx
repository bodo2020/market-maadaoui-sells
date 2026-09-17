import { useNavigate, useParams } from 'react-router-dom';
import { Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import FranchisePortalDashboard from '@/pages/FranchisePortalDashboard';

export default function FranchisePortalWorkspace() {
  const navigate = useNavigate();
  const { merchantId } = useParams<{ merchantId: string }>();

  return (
    <>
      <FranchisePortalDashboard />
      <div dir='rtl' className='fixed bottom-5 left-4 right-4 z-40 flex justify-center sm:left-6 sm:right-auto'>
        <Button
          className='h-12 rounded-2xl bg-[#005931] px-5 font-black shadow-xl hover:bg-[#004a29]'
          onClick={() => navigate(merchantId ? `/franchise-portal/${merchantId}/operations` : '/franchise-portal/operations')}
        >
          <Boxes className='ml-2 h-5 w-5' />
          إدارة التشغيل والمخزون
        </Button>
      </div>
    </>
  );
}
