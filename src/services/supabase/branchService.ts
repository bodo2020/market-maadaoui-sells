import { supabase } from "@/integrations/supabase/client";
import { Branch } from "@/types";
import { toast } from "sonner";

// Fetch all branches
export async function fetchBranches(): Promise<Branch[]> {
  try {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching branches:', error);
      toast.error("تعذر تحميل قائمة الفروع");
      throw error;
    }

    return (data || []).map(branch => ({
      ...branch,
      settings: branch.settings as Record<string, any> || {}
    }));
  } catch (error) {
    console.error('Error in fetchBranches:', error);
    throw error;
  }
}

// Fetch branch by ID
export async function fetchBranchById(id: string): Promise<Branch> {
  try {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching branch:', error);
      toast.error("تعذر تحميل بيانات الفرع");
      throw error;
    }

    return {
      ...data,
      settings: data.settings as Record<string, any> || {}
    };
  } catch (error) {
    console.error('Error in fetchBranchById:', error);
    throw error;
  }
}

// Create new branch
export async function createBranch(branch: Omit<Branch, "id" | "created_at" | "updated_at">): Promise<Branch> {
  try {
    const { data, error } = await supabase
      .from('branches')
      .insert([branch])
      .select()
      .single();

    if (error) {
      console.error('Error creating branch:', error);
      toast.error("تعذر إنشاء الفرع الجديد");
      throw error;
    }

    toast.success("تم إنشاء الفرع الجديد بنجاح");

    return {
      ...data,
      settings: data.settings as Record<string, any> || {}
    };
  } catch (error) {
    console.error('Error in createBranch:', error);
    throw error;
  }
}

// Update branch
export async function updateBranch(id: string, updates: Partial<Branch>): Promise<Branch> {
  try {
    const { data, error } = await supabase
      .from('branches')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating branch:', error);
      toast.error("تعذر تحديث بيانات الفرع");
      throw error;
    }

    toast.success("تم تحديث بيانات الفرع بنجاح");

    return {
      ...data,
      settings: data.settings as Record<string, any> || {}
    };
  } catch (error) {
    console.error('Error in updateBranch:', error);
    throw error;
  }
}

// Delete branch
export async function deleteBranch(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('branches')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting branch:', error);
      toast.error("تعذر حذف الفرع");
      throw error;
    }

    toast.success("تم حذف الفرع بنجاح");
    return true;
  } catch (error) {
    console.error('Error in deleteBranch:', error);
    return false;
  }
}

// Get user's branch
export async function getUserBranch(userId: string): Promise<Branch | null> {
  try {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('branch_id')
      .eq('id', userId)
      .single();

    if (userError || !userData?.branch_id) {
      return null;
    }

    const { data: branchData, error: branchError } = await supabase
      .from('branches')
      .select('*')
      .eq('id', userData.branch_id)
      .single();

    if (branchError) {
      console.error('Error fetching user branch:', branchError);
      return null;
    }

    return {
      ...branchData,
      settings: branchData.settings as Record<string, any> || {}
    };
  } catch (error) {
    console.error('Error in getUserBranch:', error);
    return null;
  }
}

// Assign user to branch
export async function assignUserToBranch(userId: string, branchId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('users')
      .update({ branch_id: branchId })
      .eq('id', userId);

    if (error) {
      console.error('Error assigning user to branch:', error);
      toast.error("تعذر تعيين المستخدم للفرع");
      throw error;
    }

    toast.success("تم تعيين المستخدم للفرع بنجاح");
    return true;
  } catch (error) {
    console.error('Error in assignUserToBranch:', error);
    return false;
  }
}

// Get branch statistics
export async function getBranchStatistics(branchId: string) {
  try {
    // Get sales count and total for the branch
    const { data: salesData, error: salesError } = await supabase
      .from('sales')
      .select('total')
      .eq('branch_id', branchId);

    if (salesError) {
      console.error('Error fetching sales data:', salesError);
    }

    // Get products count for the branch
    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('id')
      .eq('branch_id', branchId);

    if (productsError) {
      console.error('Error fetching products data:', productsError);
    }

    // Get employees count for the branch
    const { data: employeesData, error: employeesError } = await supabase
      .from('users')
      .select('id')
      .eq('branch_id', branchId);

    if (employeesError) {
      console.error('Error fetching employees data:', employeesError);
    }

    const totalSales = salesData?.reduce((sum, sale) => sum + (sale.total || 0), 0) || 0;
    const salesCount = salesData?.length || 0;
    const productsCount = productsData?.length || 0;
    const employeesCount = employeesData?.length || 0;

    return {
      totalSales,
      salesCount,
      productsCount,
      employeesCount
    };
  } catch (error) {
    console.error('Error in getBranchStatistics:', error);
    return {
      totalSales: 0,
      salesCount: 0,
      productsCount: 0,
      employeesCount: 0
    };
  }
}