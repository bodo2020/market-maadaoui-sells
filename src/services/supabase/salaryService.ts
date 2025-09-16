import { supabase } from "@/integrations/supabase/client";

export interface Salary {
  id: string;
  employee_id: string;
  amount: number;
  month: number;
  year: number;
  status: 'paid' | 'pending';
  payment_date?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  employee?: {
    name: string;
    username: string;
    role: string;
  };
}

export interface CreateSalaryData {
  employee_id: string;
  amount: number;
  month: number;
  year: number;
  status?: 'paid' | 'pending';
  payment_date?: string;
  notes?: string;
}

// جلب جميع الرواتب مع بيانات الموظفين
export async function fetchSalaries(): Promise<Salary[]> {
  const { data, error } = await supabase
    .from("salaries")
    .select(`
      *,
      employee:users!salaries_employee_id_fkey (
        name,
        username,
        role
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching salaries:", error);
    throw error;
  }

  return data as Salary[];
}

// جلب رواتب موظف معين
export async function fetchEmployeeSalaries(employeeId: string): Promise<Salary[]> {
  const { data, error } = await supabase
    .from("salaries")
    .select(`
      *,
      employee:users!salaries_employee_id_fkey (
        name,
        username,
        role
      )
    `)
    .eq("employee_id", employeeId)
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  if (error) {
    console.error("Error fetching employee salaries:", error);
    throw error;
  }

  return data as Salary[];
}

// جلب رواتب شهر وسنة معينة
export async function fetchSalariesByPeriod(month: number, year: number): Promise<Salary[]> {
  const { data, error } = await supabase
    .from("salaries")
    .select(`
      *,
      employee:users!salaries_employee_id_fkey (
        name,
        username,
        role
      )
    `)
    .eq("month", month)
    .eq("year", year)
    .order("employee.name");

  if (error) {
    console.error("Error fetching salaries by period:", error);
    throw error;
  }

  return data as Salary[];
}

// إضافة راتب جديد
export async function createSalary(salaryData: CreateSalaryData): Promise<Salary> {
  const { data, error } = await supabase
    .from("salaries")
    .insert([{
      ...salaryData,
      created_by: (await supabase.auth.getUser()).data.user?.id
    }])
    .select(`
      *,
      employee:users!salaries_employee_id_fkey (
        name,
        username,
        role
      )
    `)
    .single();

  if (error) {
    console.error("Error creating salary:", error);
    throw error;
  }

  return data as Salary;
}

// تحديث راتب
export async function updateSalary(id: string, updates: Partial<CreateSalaryData>): Promise<Salary> {
  const { data, error } = await supabase
    .from("salaries")
    .update(updates)
    .eq("id", id)
    .select(`
      *,
      employee:users!salaries_employee_id_fkey (
        name,
        username,
        role
      )
    `)
    .single();

  if (error) {
    console.error("Error updating salary:", error);
    throw error;
  }

  return data as Salary;
}

// حذف راتب
export async function deleteSalary(id: string): Promise<void> {
  const { error } = await supabase
    .from("salaries")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting salary:", error);
    throw error;
  }
}

// تعليم راتب كمدفوع
export async function markSalaryAsPaid(id: string): Promise<Salary> {
  return updateSalary(id, {
    status: 'paid',
    payment_date: new Date().toISOString().split('T')[0]
  });
}

// إنشاء رواتب شهر كامل لجميع الموظفين
export async function createMonthlyPayroll(month: number, year: number, defaultAmount: number = 0): Promise<Salary[]> {
  try {
    // جلب جميع الموظفين النشطين
    const { data: employees, error: employeesError } = await supabase
      .from("users")
      .select("id, name, role")
      .eq("active", true)
      .in("role", ["employee", "cashier", "delivery", "admin"]);

    if (employeesError) {
      throw employeesError;
    }

    // إنشاء رواتب لجميع الموظفين
    const salaryPromises = employees.map(employee => 
      createSalary({
        employee_id: employee.id,
        amount: defaultAmount,
        month,
        year,
        status: 'pending',
        notes: `راتب شهر ${month}/${year}`
      })
    );

    const results = await Promise.allSettled(salaryPromises);
    
    // فصل النجح عن الفشل
    const successful = results
      .filter((result): result is PromiseFulfilledResult<Salary> => result.status === 'fulfilled')
      .map(result => result.value);

    const failed = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map(result => result.reason);

    if (failed.length > 0) {
      console.warn("Some salaries failed to create:", failed);
    }

    return successful;
  } catch (error) {
    console.error("Error creating monthly payroll:", error);
    throw error;
  }
}

// حصائيات الرواتب
export async function getSalaryStatistics(month?: number, year?: number) {
  let query = supabase
    .from("salaries")
    .select("amount, status");

  if (month) query = query.eq("month", month);
  if (year) query = query.eq("year", year);

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching salary statistics:", error);
    throw error;
  }

  const totalAmount = data.reduce((sum, salary) => sum + salary.amount, 0);
  const paidAmount = data
    .filter(salary => salary.status === 'paid')
    .reduce((sum, salary) => sum + salary.amount, 0);
  const pendingAmount = data
    .filter(salary => salary.status === 'pending')
    .reduce((sum, salary) => sum + salary.amount, 0);

  return {
    total: totalAmount,
    paid: paidAmount,
    pending: pendingAmount,
    count: data.length,
    paidCount: data.filter(s => s.status === 'paid').length,
    pendingCount: data.filter(s => s.status === 'pending').length
  };
}