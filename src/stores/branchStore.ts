import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

interface BranchState {
  currentBranchId: string | null;
  currentBranchName: string | null;
  initialized: boolean;
  setBranch: (id: string | null, name?: string | null) => void;
  init: () => Promise<void>;
}

export const useBranchStore = create<BranchState>((set, get) => ({
  currentBranchId: null,
  currentBranchName: null,
  initialized: false,
  setBranch: (id, name = null) => {
    // Save to localStorage whenever branch is set
    if (id) {
      localStorage.setItem('currentBranchId', id);
      localStorage.setItem('currentBranchName', name || '');
    } else {
      localStorage.removeItem('currentBranchId');
      localStorage.removeItem('currentBranchName');
    }
    set({ currentBranchId: id, currentBranchName: name });
  },
  init: async () => {
    if (get().initialized) return;

    try {
      // Try to load from localStorage first
      const savedId = localStorage.getItem('currentBranchId');
      const savedName = localStorage.getItem('currentBranchName');
      if (savedId) {
        set({ currentBranchId: savedId, currentBranchName: savedName, initialized: true });
        return;
      }

      // Otherwise, fetch the first active branch and set it as default
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('active', true)
        .order('created_at', { ascending: true })
        .limit(1);

      if (!error && data && data.length > 0) {
        const branch = data[0];
        localStorage.setItem('currentBranchId', branch.id);
        localStorage.setItem('currentBranchName', branch.name || '');
        set({ currentBranchId: branch.id, currentBranchName: branch.name || null, initialized: true });
      } else {
        set({ initialized: true });
      }
    } catch (_e) {
      set({ initialized: true });
    }
  }
}));
