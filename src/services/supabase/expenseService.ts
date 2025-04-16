
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

export async function fetchExpenseById(id: string) {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching expense:", error);
    throw error;
  }

  return data as Expense;
}

export async function createExpense(expense: Omit<Expense, "id" | "created_at" | "updated_at">) {
  const { data, error } = await supabase
    .from("expenses")
    .insert([{
      type: expense.type,
      amount: expense.amount,
      description: expense.description,
      date: expense.date,
      receipt_url: expense.receipt_url || null,
    }])
    .select();

  if (error) {
    console.error("Error creating expense:", error);
    throw error;
  }

  return data[0] as Expense;
}

export async function updateExpense(id: string, expense: Partial<Expense>) {
  const updateData: any = {};
  
  // Only include fields that are present in the expense object
  Object.keys(expense).forEach(key => {
    if (expense[key as keyof Expense] !== undefined) {
      updateData[key] = expense[key as keyof Expense];
    }
  });

  const { data, error } = await supabase
    .from("expenses")
    .update(updateData)
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
