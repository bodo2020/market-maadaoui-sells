
import { supabase } from "@/integrations/supabase/client";
import { Sale } from "@/types";

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

export async function createSale(sale: Omit<Sale, "id" | "created_at" | "updated_at">) {
  // Generate a unique invoice number based on date and time if not provided
  if (!sale.invoice_number) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const timeStr = new Date().toISOString().slice(11, 19).replace(/:/g, "");
    sale.invoice_number = `INV-${dateStr}-${timeStr}`;
  }

  const { data, error } = await supabase
    .from("sales")
    .insert([{
      date: sale.date,
      items: sale.items,
      cashier_id: sale.cashier_id,
      subtotal: sale.subtotal,
      discount: sale.discount,
      total: sale.total,
      profit: sale.profit,
      payment_method: sale.payment_method,
      card_amount: sale.card_amount,
      cash_amount: sale.cash_amount,
      customer_name: sale.customer_name,
      customer_phone: sale.customer_phone,
      invoice_number: sale.invoice_number
    }])
    .select();

  if (error) {
    console.error("Error creating sale:", error);
    throw error;
  }

  return data[0] as Sale;
}

export async function updateSale(id: string, sale: Partial<Sale>) {
  const updateData: any = {};
  
  // Only include fields that are present in the sale object
  Object.keys(sale).forEach(key => {
    if (sale[key as keyof Sale] !== undefined) {
      updateData[key] = sale[key as keyof Sale];
    }
  });

  const { data, error } = await supabase
    .from("sales")
    .update(updateData)
    .eq("id", id)
    .select();

  if (error) {
    console.error("Error updating sale:", error);
    throw error;
  }

  return data[0] as Sale;
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
