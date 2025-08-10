import { supabase } from "@/integrations/supabase/client";

export type BranchUserRole = 'branch_admin' | 'branch_manager' | 'employee';

export interface BranchUserAssignment {
  id: string;
  user_id: string;
  branch_id: string;
  role: string;
  user_name?: string;
  user_phone?: string | null;
}

export async function listBranchAssignments(branchId: string): Promise<BranchUserAssignment[]> {
  const { data, error } = await supabase
    .from('user_branch_roles')
    .select('id, user_id, branch_id, role, users:user_id(name, phone)')
    .eq('branch_id', branchId);
  if (error) {
    console.error('Error listing branch assignments:', error);
    return [];
  }
  return (data || []).map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    branch_id: row.branch_id,
    role: row.role,
    user_name: row.users?.name,
    user_phone: row.users?.phone,
  }));
}

export async function assignUserToBranch(params: { user_id: string; branch_id: string; role?: BranchUserRole }) {
  const { data, error } = await supabase
    .from('user_branch_roles')
    .insert([{ user_id: params.user_id, branch_id: params.branch_id, role: params.role || 'branch_admin' }])
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function removeUserFromBranch(assignmentId: string) {
  const { error } = await supabase
    .from('user_branch_roles')
    .delete()
    .eq('id', assignmentId);
  if (error) throw error;
  return true;
}
