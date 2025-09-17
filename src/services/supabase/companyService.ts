
import { supabase } from "@/integrations/supabase/client";

export interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  description?: string | null;
  address?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}

export async function fetchCompanies() {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("name");

  if (error) {
    console.error("Error fetching companies:", error);
    throw error;
  }

  return data as Company[];
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
  const { data, error } = await supabase
    .from("companies")
    .insert([company])
    .select();

  if (error) {
    console.error("Error creating company:", error);
    throw error;
  }

  return data[0] as Company;
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
  const { data, error } = await supabase
    .from("companies")
    .select(`
      *,
      products_count:products(count)
    `)
    .order("name");

  if (error) {
    console.error("Error fetching companies with product count:", error);
    throw error;
  }

  return data?.map(company => ({
    ...company,
    products_count: company.products_count[0]?.count || 0
  }));
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
