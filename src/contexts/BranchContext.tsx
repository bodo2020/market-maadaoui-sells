import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Branch } from "@/types";
import { fetchBranches, getUserBranch } from "@/services/supabase/branchService";
import { useAuth } from "./AuthContext";

interface BranchContextType {
  currentBranch: Branch | null;
  allBranches: Branch[];
  isLoading: boolean;
  setCurrentBranch: (branch: Branch | null) => void;
  refreshBranches: () => Promise<void>;
  canManageMultipleBranches: boolean;
}

const BranchContext = createContext<BranchContextType>({
  currentBranch: null,
  allBranches: [],
  isLoading: true,
  setCurrentBranch: () => {},
  refreshBranches: async () => {},
  canManageMultipleBranches: false,
});

export const useBranch = () => useContext(BranchContext);

interface BranchProviderProps {
  children: ReactNode;
}

export const BranchProvider = ({ children }: BranchProviderProps) => {
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  // Check if user can manage multiple branches (super admin)
  const canManageMultipleBranches = user?.role === 'super_admin';

  const loadBranches = async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      
      if (canManageMultipleBranches) {
        // Super admin can see all branches
        const branches = await fetchBranches();
        setAllBranches(branches);
        
        // Set current branch from localStorage or first branch
        const savedBranchId = localStorage.getItem('selectedBranchId');
        if (savedBranchId) {
          const savedBranch = branches.find(b => b.id === savedBranchId);
          if (savedBranch) {
            setCurrentBranch(savedBranch);
          } else {
            setCurrentBranch(branches[0] || null);
          }
        } else {
          setCurrentBranch(branches[0] || null);
        }
      } else {
        // Other users only see their assigned branch
        const userBranch = await getUserBranch(user.id);
        if (userBranch) {
          setCurrentBranch(userBranch);
          setAllBranches([userBranch]);
        }
      }
    } catch (error) {
      console.error('Error loading branches:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetCurrentBranch = (branch: Branch | null) => {
    setCurrentBranch(branch);
    if (branch && canManageMultipleBranches) {
      localStorage.setItem('selectedBranchId', branch.id);
    }
  };

  const refreshBranches = async () => {
    await loadBranches();
  };

  useEffect(() => {
    if (user) {
      loadBranches();
    } else {
      setCurrentBranch(null);
      setAllBranches([]);
      setIsLoading(false);
    }
  }, [user, canManageMultipleBranches]);

  return (
    <BranchContext.Provider
      value={{
        currentBranch,
        allBranches,
        isLoading,
        setCurrentBranch: handleSetCurrentBranch,
        refreshBranches,
        canManageMultipleBranches,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
};
