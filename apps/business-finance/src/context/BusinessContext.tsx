import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchBusinessAccess, type StaffBranch, type StaffIdentity } from '../services/businessFinance';

type BusinessContextValue = {
  identity: StaffIdentity | null;
  branches: StaffBranch[];
  selectedBranch: StaffBranch | null;
  loading: boolean;
  error: string | null;
  selectBranch: (branchId: string) => void;
  reload: () => Promise<void>;
};

const BusinessContext = createContext<BusinessContextValue | null>(null);
const branchStorageKey = 'elmadawyBusinessBranchId';

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<StaffIdentity | null>(null);
  const [branches, setBranches] = useState<StaffBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(() => localStorage.getItem(branchStorageKey));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const access = await fetchBusinessAccess();
      setIdentity(access.identity);
      setBranches(access.branches);
      setSelectedBranchId((current) => {
        const valid = access.branches.some((branch) => branch.branch_id === current);
        const next = valid
          ? current
          : (access.branches.find((branch) => branch.is_primary) || access.branches[0])?.branch_id || null;
        if (next) localStorage.setItem(branchStorageKey, next);
        return next;
      });
    } catch (cause) {
      setIdentity(null);
      setBranches([]);
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل صلاحيات التطبيق.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.branch_id === selectedBranchId) || null,
    [branches, selectedBranchId],
  );

  function selectBranch(branchId: string) {
    if (!branches.some((branch) => branch.branch_id === branchId)) return;
    localStorage.setItem(branchStorageKey, branchId);
    setSelectedBranchId(branchId);
  }

  return <BusinessContext.Provider value={{ identity, branches, selectedBranch, loading, error, selectBranch, reload }}>
    {children}
  </BusinessContext.Provider>;
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (!context) throw new Error('useBusiness must be used inside BusinessProvider');
  return context;
}
