
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

export async function createSale(sale: Omit<Sale, "id" | "createdAt" | "updatedAt">) {
  const { data, error } = await supabase
    .from("sales")
    .insert([{
      date: sale.date,
      items: sale.items,
      cashier_id: sale.cashierId,
      subtotal: sale.subtotal,
      discount: sale.discount,
      total: sale.total,
      profit: sale.profit,
      payment_method: sale.paymentMethod,
      card_amount: sale.cardAmount,
      cash_amount: sale.cashAmount,
      customer_name: sale.customerName,
      customer_phone: sale.customerPhone,
      invoice_number: sale.invoiceNumber
    }])
    .select();

  if (error) {
    console.error("Error creating sale:", error);
    throw error;
  }

  return data[0] as Sale;
}
