
import { supabase } from "@/integrations/supabase/client";
import { Sale, CartItem } from "@/types";
import { Json } from "@/integrations/supabase/types";

// Interface to match the database schema
interface DbSale {
  id: string;
  date: string;
  items: Json;
  cashier_id?: string;
  subtotal: number;
  discount: number;
  total: number;
  profit: number;
  payment_method: string;
  card_amount?: number;
  cash_amount?: number;
  customer_name?: string;
  customer_phone?: string;
  invoice_number: string;
  created_at: string;
  updated_at?: string;
}

// Convert database sale to app sale
function dbSaleToAppSale(dbSale: DbSale): Sale {
  return {
    id: dbSale.id,
    date: dbSale.date,
    items: dbSale.items as unknown as CartItem[],
    cashier_id: dbSale.cashier_id,
    subtotal: dbSale.subtotal,
    discount: dbSale.discount,
    total: dbSale.total,
    profit: dbSale.profit,
    payment_method: dbSale.payment_method as 'cash' | 'card' | 'mixed',
    card_amount: dbSale.card_amount,
    cash_amount: dbSale.cash_amount,
    customer_name: dbSale.customer_name,
    customer_phone: dbSale.customer_phone,
    invoice_number: dbSale.invoice_number,
    created_at: dbSale.created_at,
    updated_at: dbSale.updated_at
  };
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

  return (data as DbSale[]).map(dbSaleToAppSale);
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

  return dbSaleToAppSale(data as DbSale);
}

export async function createSale(sale: Omit<Sale, "id" | "created_at" | "updated_at">) {
  // Convert Date to ISO string if needed
  const dateValue = sale.date instanceof Date ? sale.date.toISOString() : sale.date;
  
  const { data, error } = await supabase
    .from("sales")
    .insert([{
      date: dateValue,
      items: sale.items as unknown as Json,
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

  return dbSaleToAppSale(data[0] as DbSale);
}

export async function updateSale(id: string, sale: Partial<Sale>) {
  const updateData: any = {};
  
  // Only include fields that are present in the sale object
  Object.keys(sale).forEach(key => {
    if (sale[key as keyof Sale] !== undefined) {
      // Convert Date objects to ISO strings if needed
      if (key === 'date' || key === 'created_at' || key === 'updated_at') {
        const value = sale[key as keyof Sale];
        updateData[key] = value instanceof Date ? value.toISOString() : value;
      } else if (key === 'items') {
        // Handle items array by converting to Json
        updateData['items'] = sale.items as unknown as Json;
      } else {
        updateData[key] = sale[key as keyof Sale];
      }
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

  return dbSaleToAppSale(data[0] as DbSale);
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
