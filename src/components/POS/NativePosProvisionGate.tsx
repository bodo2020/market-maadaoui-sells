import { type ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranchStore } from '@/stores/branchStore';
import { currentStaffHasPermission } from '@/services/supabase/staffAuthService';
import { getLocalPosDevice, registerThisPosDevice, restoreNativePosDevice } from '@/services/supabase/posDeviceService';
import { isPosNative } from '@/native/posNative';
import { Button } from '@/components/ui/button';

export default function NativePosProvisionGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [ready, setReady] = useState(!isPosNative());
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isPosNative() || !currentBranchId || !user?.id) { setReady(true); return; }
    let active = true;
    setReady(false);
    setError(null);
    void (async () => {
      try {
        const device = await restoreNativePosDevice(currentBranchId);
        if (!device && navigator.onLine && (user.role === 'super_admin' || currentStaffHasPermission('pos.manage_devices'))) {
          await registerThisPosDevice(currentBranchId, `POS ${currentBranchName || 'الفرع'} Android`);
        }
      } catch (reason) {
        if (active) setError((reason as Error)?.message || 'تعذر ربط الجهاز');
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => { active = false; };
  }, [currentBranchId, currentBranchName, user?.id, user?.role, attempt]);

  if (!ready) return <div dir="rtl" className="flex min-h-screen items-center justify-center">جاري ربط جهاز الكاشير بالفرع…</div>;
  if (error && !getLocalPosDevice(currentBranchId || '')) return (
    <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <strong>تعذر ربط جهاز الكاشير</strong><p className="text-sm">{error}</p>
      <Button onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</Button>
    </div>
  );
  return <>{children}</>;
}
