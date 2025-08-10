import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";

export interface Branch {
  id: string;
  name: string;
  code?: string | null;
  active?: boolean | null;
}

interface BranchState {
  branches: Branch[];
  currentBranchId: string | null;
  setBranches: (branches: Branch[]) => void;
  setCurrentBranch: (id: string) => void;
  ensureInitialized: () => Promise<string | null>;
}

export const useBranchStore = create<BranchState>((set, get) => ({
  branches: [],
  currentBranchId: null,
  setBranches: (branches) => set({ branches }),
  setCurrentBranch: (id) => set({ currentBranchId: id }),
  ensureInitialized: async () => {
    const { currentBranchId, branches } = get();
    if (currentBranchId) return currentBranchId;
    try {
      // Load branches
      const { data: list } = await supabase.from("branches").select("id, name, code, active").order("name");
      if (list && list.length > 0) {
        set({ branches: list });
        // Prefer MAIN branch if found
        const main = list.find((b) => b.code === "MAIN");
        const firstId = (main || list[0]).id;
        set({ currentBranchId: firstId });
        return firstId;
      }
      return null;
    } catch (e) {
      console.error("Failed to initialize branches", e);
      return null;
    }
  },
}));
