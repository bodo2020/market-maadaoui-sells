import { supabase } from "@/integrations/supabase/client";
import type { Branch } from "@/stores/branchStore";

export async function fetchBranches(): Promise<Branch[]> {
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, code, active")
    .order("name");
  if (error) {
    console.error("Error fetching branches:", error);
    return [];
  }
  return data || [];
}

export async function getMainBranchId(): Promise<string | null> {
  const { data, error } = await supabase
    .from("branches")
    .select("id, code")
    .eq("code", "MAIN")
    .maybeSingle();
  if (error) {
    console.error("Error fetching MAIN branch:", error);
    return null;
  }
  return data?.id || null;
}
