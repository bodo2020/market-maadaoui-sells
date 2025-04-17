
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
