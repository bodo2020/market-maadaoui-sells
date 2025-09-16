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
  try {
    // First deduct from cash register
    const { error: deductionError } = await supabase.functions.invoke(
      'add-cash-transaction',
      {
        body: {
          amount: expense.amount,
          transaction_type: 'withdrawal',
          register_type: 'store',
          notes: `مصروف: ${expense.type} - ${expense.description}`
        }
      }
    );

    if (deductionError) {
      console.error("Error deducting expense from cash register:", deductionError);
      throw new Error("فشل في خصم المبلغ من الخزنة");
    }

    // Ensure date is always a string format for Supabase
    const formattedDate = typeof expense.date === 'string' 
    ? expense.date 
    : (expense.date as Date).toISOString();

    const { data, error } = await supabase
      .from("expenses")
      .insert([{
        type: expense.type,
        amount: expense.amount,
        description: expense.description,
        date: formattedDate,
        receipt_url: expense.receipt_url || null,
      }])
      .select();

    if (error) {
      console.error("Error creating expense:", error);
      throw error;
    }

    return data[0] as Expense;
  } catch (error) {
    console.error("Error in createExpense:", error);
    throw error;
  }
}

export async function updateExpense(id: string, expense: Partial<Expense>) {
  const updateData: any = {};
  
  // Only include fields that are present in the expense object
  Object.keys(expense).forEach(key => {
    if (expense[key as keyof Expense] !== undefined) {
      // Ensure date is always a string format for Supabase
      if (key === 'date' && expense.date) {
        updateData[key] = typeof expense.date === 'string' 
          ? expense.date 
          : (expense.date as Date).toISOString();
      } else {
        updateData[key] = expense[key as keyof Expense];
      }
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
  // Get the expense details first
  const { data: expense, error: fetchError } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError) {
    console.error("Error fetching expense for deletion:", fetchError);
    throw fetchError;
  }

  // Refund the amount to the cash register
  const { error: refundError } = await supabase.functions.invoke(
    'add-cash-transaction',
    {
      body: {
        amount: expense.amount,
        transaction_type: 'deposit',
        register_type: 'store',
        notes: `إلغاء مصروف: ${expense.type} - ${expense.description}`
      }
    }
  );

  if (refundError) {
    console.error("Error refunding to cash register:", refundError);
    throw new Error("فشل في إعادة المبلغ للخزنة");
  }

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

// دالة خاصة لتسجيل مصروف التوالف دون خصم من الخزنة
export async function createDamageExpense(expense: Omit<Expense, "id" | "created_at" | "updated_at">) {
  try {
    // Ensure date is always a string format for Supabase
    const formattedDate = typeof expense.date === 'string' 
    ? expense.date 
    : (expense.date as Date).toISOString();

    const { data, error } = await supabase
      .from("expenses")
      .insert([{
        type: expense.type,
        amount: expense.amount,
        description: expense.description,
        date: formattedDate,
        receipt_url: expense.receipt_url || null,
      }])
      .select();

    if (error) {
      console.error("Error creating damage expense:", error);
      throw error;
    }

    return data[0] as Expense;
  } catch (error) {
    console.error("Error in createDamageExpense:", error);
    throw error;
  }
}

// دوال تحليلات المصروفات
export async function getExpensesByDateRange(startDate?: string, endDate?: string) {
  let query = supabase
    .from("expenses")
    .select("*")
    .order("date", { ascending: false });

  if (startDate) {
    query = query.gte("date", startDate);
  }
  if (endDate) {
    query = query.lte("date", endDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching expenses by date range:", error);
    throw error;
  }

  return data as Expense[];
}

export async function getExpensesByType() {
  const { data, error } = await supabase
    .from("expenses")
    .select("type, amount")
    .order("amount", { ascending: false });

  if (error) {
    console.error("Error fetching expenses by type:", error);
    throw error;
  }

  // Group by type
  const grouped = data.reduce((acc: any, expense) => {
    if (!acc[expense.type]) {
      acc[expense.type] = { type: expense.type, amount: 0, count: 0 };
    }
    acc[expense.type].amount += expense.amount;
    acc[expense.type].count += 1;
    return acc;
  }, {});

  return Object.values(grouped);
}

export async function getMonthlyExpensesTrend(months: number = 6) {
  const { data, error } = await supabase
    .from("expenses")
    .select("amount, date, type")
    .gte("date", new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString());

  if (error) {
    console.error("Error fetching monthly expenses trend:", error);
    throw error;
  }

  return data as Expense[];
}
