import { create } from 'zustand';

interface BranchState {
  currentBranchId: string | null;
  currentBranchName: string | null;
  initialized: boolean;
  setBranch: (id: string | null, name?: string | null) => void;
  init: () => Promise<void>;
}

export const useBranchStore = create<BranchState>((set) => {
  const savedId = typeof window !== 'undefined' ? localStorage.getItem('currentBranchId') : null;
  const savedName = typeof window !== 'undefined' ? localStorage.getItem('currentBranchName') : null;

  return {
    currentBranchId: savedId,
    currentBranchName: savedName,
    initialized: true,
    setBranch: (id, name = null) => {
      if (id) {
        localStorage.setItem('currentBranchId', id);
        localStorage.setItem('currentBranchName', name || '');
      } else {
        localStorage.removeItem('currentBranchId');
        localStorage.removeItem('currentBranchName');
      }
      set({ currentBranchId: id, currentBranchName: name, initialized: true });
    },
    // Branch selection is authentication context, not an application default.
    // AuthContext validates/restores the branch through get_my_staff_branches().
    init: async () => {
      const currentId = localStorage.getItem('currentBranchId');
      const currentName = localStorage.getItem('currentBranchName');
      set({ currentBranchId: currentId, currentBranchName: currentName, initialized: true });
    },
  };
});
