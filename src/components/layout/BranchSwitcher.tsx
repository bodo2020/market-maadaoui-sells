import { useEffect } from "react";
import { useBranchStore } from "@/stores/branchStore";
import { fetchBranches } from "@/services/supabase/branchService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function BranchSwitcher() {
  const { branches, currentBranchId, setBranches, setCurrentBranch, ensureInitialized } = useBranchStore();

  useEffect(() => {
    (async () => {
      // Ensure we have branches and a selected one
      const id = await ensureInitialized();
      if (!branches.length) {
        const list = await fetchBranches();
        setBranches(list);
        if (!id && list[0]) setCurrentBranch(list[0].id);
      }
    })();
  }, []);

  return (
    <div className="min-w-[190px]">
      <Select value={currentBranchId ?? undefined} onValueChange={(v) => setCurrentBranch(v)}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="اختر الفرع" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
