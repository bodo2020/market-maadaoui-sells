
import { supabase } from "@/integrations/supabase/client";

export interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  description?: string | null;
  address?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  branch_id?: string | null;
}

export async function fetchCompanies() {
  try {
    // Get current branch
    const currentBranchId = localStorage.getItem("currentBranchId");
    
    if (!currentBranchId) {
      // No branch selected, return all companies
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("name");

      if (error) throw error;
      return data as Company[];
    }

    // Check branch type
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("branch_type, independent_inventory")
      .eq("id", currentBranchId)
      .single();

    if (branchError) {
      console.error("Error fetching branch:", branchError);
      throw branchError;
    }

    // If external branch with independent inventory, fetch only branch-specific companies
    if (branch.branch_type === 'external' && branch.independent_inventory) {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("branch_id", currentBranchId)
        .order("name");

      if (error) throw error;
      return data as Company[];
    }

    // For internal branches or external without independent inventory,
    // fetch shared companies (branch_id IS NULL) + branch-specific companies
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .or(`branch_id.is.null,branch_id.eq.${currentBranchId}`)
      .order("name");

    if (error) throw error;
    return data as Company[];

  } catch (error) {
    console.error("Error fetching companies:", error);
    throw error;
  }
}

export async function fetchCompanyById(id: string) {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching company:", error);
    throw error;
  }

  return data as Company;
}

export async function createCompany(company: Omit<Company, "id" | "created_at" | "updated_at">) {
  try {
    // Get current branch
    const currentBranchId = localStorage.getItem("currentBranchId");
    
    let branchId = null;
    
    if (currentBranchId) {
      // Check if branch is external with independent inventory
      const { data: branch, error: branchError } = await supabase
        .from("branches")
        .select("branch_type, independent_inventory")
        .eq("id", currentBranchId)
        .single();

      if (branchError) {
        console.error("Error fetching branch:", branchError);
      } else if (branch.branch_type === 'external' && branch.independent_inventory) {
        // For external branches with independent inventory, assign branch_id
        branchId = currentBranchId;
      }
      // For internal branches or external without independent inventory, keep branch_id as null (shared)
    }

    const { data, error } = await supabase
      .from("companies")
      .insert([{ ...company, branch_id: branchId }])
      .select();

    if (error) {
      console.error("Error creating company:", error);
      throw error;
    }

    return data[0] as Company;
  } catch (error) {
    console.error("Error in createCompany:", error);
    throw error;
  }
}

export async function updateCompany(id: string, company: Partial<Company>) {
  const { data, error } = await supabase
    .from("companies")
    .update(company)
    .eq("id", id)
    .select();

  if (error) {
    console.error("Error updating company:", error);
    throw error;
  }

  return data[0] as Company;
}

export async function deleteCompany(id: string) {
  const { error } = await supabase
    .from("companies")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting company:", error);
    throw error;
  }

  return true;
}

// جلب عدد المنتجات لكل شركة
export async function fetchCompaniesWithProductCount() {
  try {
    // Get current branch
    const currentBranchId = localStorage.getItem("currentBranchId");
    
    let query = supabase
      .from("companies")
      .select(`
        *,
        products_count:products(count)
      `);

    if (currentBranchId) {
      // Check branch type
      const { data: branch } = await supabase
        .from("branches")
        .select("branch_type, independent_inventory")
        .eq("id", currentBranchId)
        .single();

      if (branch?.branch_type === 'external' && branch.independent_inventory) {
        // External branch: only its companies
        query = query.eq("branch_id", currentBranchId);
      } else {
        // Internal branch: shared + branch-specific
        query = query.or(`branch_id.is.null,branch_id.eq.${currentBranchId}`);
      }
    }

    const { data, error } = await query.order("name");

    if (error) {
      console.error("Error fetching companies with product count:", error);
      throw error;
    }

    return data?.map(company => ({
      ...company,
      products_count: company.products_count[0]?.count || 0
    }));
  } catch (error) {
    console.error("Error in fetchCompaniesWithProductCount:", error);
    throw error;
  }
}

// جلب عدد المنتجات التي ليس لها شركة
export async function getProductsWithoutCompanyCount() {
  const { data, error } = await supabase
    .from("products")
    .select("id", { count: 'exact' })
    .is("company_id", null);

  if (error) {
    console.error("Error fetching products without company:", error);
    throw error;
  }

  return data?.length || 0;
}

// تحديث منتجات بدون شركة لتنتمي لشركة معينة
export async function assignProductsToCompany(companyId: string, productIds: string[]) {
  const { error } = await supabase
    .from("products")
    .update({ company_id: companyId })
    .in("id", productIds);

  if (error) {
    console.error("Error assigning products to company:", error);
    throw error;
  }

  return true;
}

// جلب المنتجات التي ليس لها شركة
export async function fetchProductsWithoutCompany() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .is("company_id", null)
    .order("name");

  if (error) {
    console.error("Error fetching products without company:", error);
    throw error;
  }

  return data;
}
