
import { supabase } from "@/integrations/supabase/client";
import { Sale } from "@/types";

export async function createSale(sale: Omit<Sale, "id" | "created_at" | "updated_at">) {
  const { data, error } = await supabase
    .from("sales")
    .insert([sale])
    .select("*")
    .single();

  if (error) {
    console.error("Error creating sale:", error);
    throw error;
  }

  return data as Sale;
}

export async function fetchSales() {
  const { data, error } = await supabase
    .from("sales")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    console.error("Error fetching sales:", error);
    throw error;
  }

  return data as Sale[];
}

export async function fetchSaleById(id: string) {
  const { data, error } = await supabase
    .from("sales")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching sale:", error);
    throw error;
  }

  return data as Sale;
}

export async function generateInvoiceNumber() {
  // Get current date
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  
  // Get count of today's invoices to increment
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  
  const { count, error } = await supabase
    .from("sales")
    .select("*", { count: 'exact', head: true })
    .gte("date", startOfDay)
    .lt("date", endOfDay);
    
  if (error) {
    console.error("Error counting today's invoices:", error);
    throw error;
  }
  
  // Format: YYMMDD-XXXX where XXXX is the sequential number for the day
  const sequentialNumber = ((count || 0) + 1).toString().padStart(4, '0');
  return `${year}${month}${day}-${sequentialNumber}`;
}
