import { supabase } from "@/integrations/supabase/client";
import { Expense } from "@/types";

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

function getCurrentBranchId(): string {
  const branchId = localStorage.getItem("currentBranchId");
  if (!branchId || branchId === "null") throw new Error("يجب اختيار فرع أولاً");
  return branchId;
}

function expenseError(message?: string) {
  if (!message) return "تعذر حفظ المصروف";
  if (message.startsWith("INSUFFICIENT_SAFE_CASH|")) {
    const balance = message.split("|")[1] || "0.00";
    return `رصيد خزنة الفرع غير كافٍ. الرصيد الحالي ${balance} ج.م`;
  }
  switch (message) {
    case "AUTH_REQUIRED": return "سجّل الدخول مرة أخرى.";
    case "EXPENSE_MANAGE_DENIED": return "ليس لديك صلاحية إدارة مصروفات هذا الفرع.";
    case "INVALID_AMOUNT": return "قيمة المصروف غير صحيحة.";
    case "EXPENSE_DETAILS_REQUIRED": return "اكتب نوع المصروف ووصفه.";
    case "EXPENSE_NOT_FOUND": return "المصروف غير موجود.";
    case "EXPENSE_FINANCIAL_FIELDS_LOCKED": return "بعد تسجيل المصروف نقديًا لا يمكن تغيير قيمته. ألغِ المصروف وأنشئ مصروفًا جديدًا بالقيمة الصحيحة.";
    case "USE_EXPENSE_VOID": return "المصروف النقدي لا يُحذف. استخدم الإلغاء حتى يظل أثر النقدية محفوظًا.";
    default: return message;
  }
}

function expenseDate(expense: Partial<Expense>) {
  if (!expense.date) return new Date().toISOString();
  return typeof expense.date === "string" ? expense.date : (expense.date as Date).toISOString();
}

export async function fetchExpenses(branchId?: string) {
  const currentBranchId = branchId || localStorage.getItem("currentBranchId");
  let query = supabase.from("expenses").select("*").eq("status" as never, "active" as never);
  if (currentBranchId) query = query.eq("branch_id", currentBranchId);
  const { data, error } = await query.order("date", { ascending: false });
  if (error) throw error;
  return data as Expense[];
}

export async function fetchExpenseById(id: string) {
  const { data, error } = await supabase.from("expenses").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Expense;
}

async function createExpenseWithSource(
  expense: Omit<Expense, "id" | "created_at" | "updated_at">,
  source: "safe" | "noncash",
) {
  const { data, error } = await rpc("create_branch_expense_atomic", {
    p_branch_id: getCurrentBranchId(),
    p_type: expense.type,
    p_amount: Number(expense.amount),
    p_description: expense.description,
    p_date: expenseDate(expense),
    p_receipt_url: expense.receipt_url || null,
    p_source: source,
  });
  if (error || !data || typeof data !== "object") throw new Error(expenseError(error?.message));
  return data as Expense;
}

export async function createExpense(expense: Omit<Expense, "id" | "created_at" | "updated_at">) {
  return createExpenseWithSource(expense, "safe");
}

export async function updateExpense(id: string, expense: Partial<Expense>) {
  const updateData: Record<string, unknown> = {};
  Object.keys(expense).forEach(key => {
    const value = expense[key as keyof Expense];
    if (value === undefined) return;
    updateData[key] = key === "date" && expense.date ? expenseDate(expense) : value;
  });

  // Financial fields are immutable once an expense is posted. Correct amounts by void + recreate.
  for (const key of ["branch_id", "amount", "paid_from_account_id", "payment_method", "shift_id", "status", "voided_at", "voided_by", "void_reason", "created_by"]) {
    delete updateData[key];
  }

  const { data, error } = await supabase.from("expenses").update(updateData as never).eq("id", id).select().single();
  if (error) throw new Error(expenseError(error.message));
  return data as Expense;
}

export async function deleteExpense(id: string) {
  const { data, error } = await rpc("void_branch_expense_atomic", {
    p_expense_id: id,
    p_reason: "إلغاء من شاشة المصروفات",
  });
  if (error || !data) throw new Error(expenseError(error?.message));
  return true;
}

// التوالف مصروف محاسبي، وليس حركة نقدية من الخزنة.
export async function createDamageExpense(expense: Omit<Expense, "id" | "created_at" | "updated_at">) {
  return createExpenseWithSource(expense, "noncash");
}

export async function getExpensesByDateRange(startDate?: string, endDate?: string) {
  let query = supabase.from("expenses").select("*").eq("status" as never, "active" as never).order("date", { ascending: false });
  if (startDate) query = query.gte("date", startDate);
  if (endDate) query = query.lte("date", endDate);
  const { data, error } = await query;
  if (error) throw error;
  return data as Expense[];
}

export async function getExpensesByType() {
  const { data, error } = await supabase
    .from("expenses")
    .select("type, amount")
    .eq("status" as never, "active" as never)
    .order("amount", { ascending: false });
  if (error) throw error;

  const grouped = (data || []).reduce((acc: Record<string, { type: string; amount: number; count: number }>, expense: any) => {
    if (!acc[expense.type]) acc[expense.type] = { type: expense.type, amount: 0, count: 0 };
    acc[expense.type].amount += Number(expense.amount || 0);
    acc[expense.type].count += 1;
    return acc;
  }, {});
  return Object.values(grouped);
}

export async function getMonthlyExpensesTrend(months: number = 6) {
  const { data, error } = await supabase
    .from("expenses")
    .select("amount, date, type")
    .eq("status" as never, "active" as never)
    .gte("date", new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString());
  if (error) throw error;
  return data as Expense[];
}
