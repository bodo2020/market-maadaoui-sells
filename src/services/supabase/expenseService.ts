
import { supabase } from "@/integrations/supabase/client";
import { Expense } from "@/types";

export async function fetchExpenses() {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    console.error("Error fetching expenses:", error);
    throw error;
  }

  return data as Expense[];
}

export async function createExpense(expense: Omit<Expense, "id" | "createdAt" | "updatedAt">) {
  const { data, error } = await supabase
    .from("expenses")
    .insert([{
      type: expense.type,
      amount: expense.amount,
      description: expense.description,
      date: expense.date,
      receipt_url: expense.receiptUrl
    }])
    .select();

  if (error) {
    console.error("Error creating expense:", error);
    throw error;
  }

  return data[0] as Expense;
}

export async function updateExpense(id: string, expense: Partial<Expense>) {
  const { data, error } = await supabase
    .from("expenses")
    .update({
      type: expense.type,
      amount: expense.amount,
      description: expense.description,
      date: expense.date,
      receipt_url: expense.receiptUrl
    })
    .eq("id", id)
    .select();

  if (error) {
    console.error("Error updating expense:", error);
    throw error;
  }

  return data[0] as Expense;
}

export async function deleteExpense(id: string) {
  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting expense:", error);
    throw error;
  }

  return true;
}
