
import { supabase } from "@/integrations/supabase/client";
import { Sale, CartItem } from "@/types";

export async function createSale(sale: Omit<Sale, "id" | "created_at" | "updated_at">) {
  // Ensure the date is a string when sending to Supabase
  // and properly stringify the items array to make it compatible with Supabase Json type
  const saleData = {
    ...sale,
    date: typeof sale.date === 'object' ? (sale.date as Date).toISOString() : sale.date,
    // Convert CartItem[] to Json by stringifying it first then parsing it
    // This removes the complex object references and creates a plain object
    items: JSON.parse(JSON.stringify(sale.items))
  };

  const { data, error } = await supabase
    .from("sales")
    .insert(saleData)
    .select("*")
    .single();

  if (error) {
    console.error("Error creating sale:", error);
    throw error;
  }

  // Convert the returned data to match our Sale type
  return {
    ...data,
    items: data.items as unknown as CartItem[]
  } as Sale;
}

export async function updateSale(id: string, saleData: Partial<Sale>) {
  // Process the data before sending to Supabase
  const updateData: any = { ...saleData };
  
  // Handle date conversion if date is provided
  if (updateData.date && typeof updateData.date === 'object') {
    updateData.date = (updateData.date as Date).toISOString();
  }
  
  // Handle items array conversion if provided
  if (updateData.items) {
    updateData.items = JSON.parse(JSON.stringify(updateData.items));
  }
  
  const { data, error } = await supabase
    .from("sales")
    .update(updateData)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("Error updating sale:", error);
    throw error;
  }

  // Convert the returned data to match our Sale type
  return {
    ...data,
    items: data.items as unknown as CartItem[]
  } as Sale;
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

  // Convert all items in the array to match our Sale type
  return data.map(sale => ({
    ...sale,
    items: sale.items as unknown as CartItem[]
  })) as Sale[];
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

  // Convert the returned data to match our Sale type
  return {
    ...data,
    items: data.items as unknown as CartItem[]
  } as Sale;
}

export async function deleteSale(id: string) {
  const { error } = await supabase
    .from("sales")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting sale:", error);
    throw error;
  }

  return true;
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
