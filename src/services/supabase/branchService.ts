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

// --- CRUD helpers for branches ---
export async function createBranch(payload: {
  name: string;
  code?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  active?: boolean | null;
}): Promise<Branch | null> {
  const { data, error } = await supabase
    .from("branches")
    .insert([{ ...payload }])
    .select("id, name, code, active")
    .single();
  if (error) {
    console.error("Error creating branch:", error);
    return null;
  }
  return data as Branch;
}

export async function updateBranch(id: string, updates: Partial<Branch> & {
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}): Promise<Branch | null> {
  const { data, error } = await supabase
    .from("branches")
    .update({ ...updates })
    .eq("id", id)
    .select("id, name, code, active")
    .single();
  if (error) {
    console.error("Error updating branch:", error);
    return null;
  }
  return data as Branch;
}

export async function deleteBranch(id: string): Promise<boolean> {
  const { error } = await supabase.from("branches").delete().eq("id", id);
  if (error) {
    console.error("Error deleting branch:", error);
    return false;
  }
  return true;
}
