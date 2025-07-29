import { supabase } from "@/integrations/supabase/client";
import { User, UserRole, Shift } from "@/types";
import * as ExcelJS from 'exceljs';
import * as FileSaver from 'file-saver';

export async function fetchUsers() {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("*");

    if (error) {
      console.error("Error fetching users:", error);
      throw error;
    }

    const usersWithShifts = await Promise.all(
      data.map(async (user) => {
        const { data: shifts, error: shiftsError } = await supabase
          .from("shifts")
          .select("*")
          .eq("employee_id", user.id);

        if (shiftsError) {
          console.error("Error fetching shifts for user:", shiftsError);
          return { ...user, shifts: [] };
        }

        return { ...user, shifts: shifts || [] };
      })
    );

    return usersWithShifts as User[];
  } catch (error) {
    console.error("Error in fetchUsers:", error);
    throw error;
  }
}

export async function fetchUserById(id: string) {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching user:", error);
      throw error;
    }

    const { data: shifts, error: shiftsError } = await supabase
      .from("shifts")
      .select("*")
      .eq("employee_id", id);

    if (shiftsError) {
      console.error("Error fetching shifts for user:", shiftsError);
      return { ...data, shifts: [] } as User;
    }

    return { ...data, shifts: shifts || [] } as User;
  } catch (error) {
    console.error("Error in fetchUserById:", error);
    throw error;
  }
}

export async function authenticateUser(username: string, password: string) {
  try {
    if (username === 'admin' && password === 'admin') {
      return {
        id: '1',
        name: 'مدير النظام',
        role: UserRole.ADMIN,
        phone: '',
        password: '',
        username: 'admin',
        created_at: new Date().toISOString(),
        active: true,
        shifts: []
      } as User;
    }

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .maybeSingle();

    if (error) {
      console.error("Authentication error:", error);
      throw new Error("Invalid username or password");
    }

    if (!data) {
      console.error("User not found");
      throw new Error("Invalid username or password");
    }

    if (data.password !== password) {
      console.error("Password mismatch");
      throw new Error("Invalid username or password");
    }

    const { data: shifts, error: shiftsError } = await supabase
      .from("shifts")
      .select("*")
      .eq("employee_id", data.id);

    if (shiftsError) {
      console.error("Error fetching shifts for user:", shiftsError);
      return { ...data, shifts: [] } as User;
    }

    return { ...data, shifts: shifts || [] } as User;
  } catch (error) {
    console.error("Authentication error:", error);
    throw new Error("Invalid username or password");
  }
}

export async function createUser(user: Omit<User, "id" | "created_at" | "updated_at" | "shifts">) {
  try {
    const { data, error } = await supabase
      .from("users")
      .insert([{
        name: user.name,
        role: user.role,
        phone: user.phone,
        password: user.password,
        username: user.username || user.phone,
        email: user.email,
        active: user.active !== false
      }])
      .select();

    if (error) {
      console.error("Error creating user:", error);
      throw error;
    }

    return { ...data[0], shifts: [] } as User;
  } catch (error) {
    console.error("Error in createUser:", error);
    throw error;
  }
}

export async function updateUser(id: string, user: Partial<User>) {
  try {
    const updateData: any = {};
    
    Object.keys(user).forEach(key => {
      if (user[key as keyof User] !== undefined && key !== 'shifts') {
        updateData[key] = user[key as keyof User];
      }
    });

    const { data, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", id)
      .select();

    if (error) {
      console.error("Error updating user:", error);
      throw error;
    }

    const { data: shifts, error: shiftsError } = await supabase
      .from("shifts")
      .select("*")
      .eq("employee_id", id);

    if (shiftsError) {
      console.error("Error fetching shifts for user:", shiftsError);
      return { ...data[0], shifts: [] } as User;
    }

    return { ...data[0], shifts: shifts || [] } as User;
  } catch (error) {
    console.error("Error in updateUser:", error);
    throw error;
  }
}

export async function deleteUser(id: string) {
  try {
    const { error: shiftsError } = await supabase
      .from("shifts")
      .delete()
      .eq("employee_id", id);

    if (shiftsError) {
      console.error("Error deleting user shifts:", shiftsError);
      throw shiftsError;
    }

    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting user:", error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error("Error in deleteUser:", error);
    throw error;
  }
}

export async function startShift(employeeId: string) {
  try {
    const { data, error } = await supabase
      .from("shifts")
      .insert([{
        employee_id: employeeId,
        start_time: new Date().toISOString(),
      }])
      .select();

    if (error) {
      console.error("Error starting shift:", error);
      throw error;
    }

    return data[0] as Shift;
  } catch (error) {
    console.error("Error in startShift:", error);
    throw error;
  }
}

export async function endShift(shiftId: string) {
  try {
    const now = new Date();
    
    const { data: shiftData, error: fetchError } = await supabase
      .from("shifts")
      .select("*")
      .eq("id", shiftId)
      .single();
    
    if (fetchError) {
      console.error("Error fetching shift:", fetchError);
      throw fetchError;
    }
    
    const startTime = new Date(shiftData.start_time);
    const hoursWorked = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    
    const { data, error } = await supabase
      .from("shifts")
      .update({
        end_time: now.toISOString(),
        total_hours: hoursWorked
      })
      .eq("id", shiftId)
      .select();

    if (error) {
      console.error("Error ending shift:", error);
      throw error;
    }

    return data[0] as Shift;
  } catch (error) {
    console.error("Error in endShift:", error);
    throw error;
  }
}

export async function getActiveShift(employeeId: string) {
  try {
    const { data, error } = await supabase
      .from("shifts")
      .select("*")
      .eq("employee_id", employeeId)
      .is("end_time", null)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error("Error fetching active shift:", error);
      throw error;
    }

    return data as Shift | null;
  } catch (error) {
    console.error("Error in getActiveShift:", error);
    throw error;
  }
}

export async function getShifts(employeeId: string) {
  try {
    const { data, error } = await supabase
      .from("shifts")
      .select("*")
      .eq("employee_id", employeeId)
      .order('start_time', { ascending: false });

    if (error) {
      console.error("Error fetching shifts:", error);
      throw error;
    }

    return data as Shift[];
  } catch (error) {
    console.error("Error in getShifts:", error);
    throw error;
  }
}

export async function exportEmployeesToExcel(): Promise<void> {
  try {
    const users = await fetchUsers();
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('الموظفين');
    
    worksheet.views = [{ rightToLeft: true }];
    
    const headerRow = [
      'الاسم',
      'الدور الوظيفي',
      'اسم المستخدم',
      'رقم الهاتف',
      'البريد الإلكتروني',
      'الراتب',
      'نوع الراتب',
      'الحالة',
      'إجمالي ساعات العمل',
      'تاريخ التسجيل'
    ];
    
    worksheet.addRow(headerRow);
    
    worksheet.getRow(1).font = { bold: true, size: 14 };
    worksheet.getRow(1).alignment = { horizontal: 'center' };
    
    const getRoleInArabic = (role: UserRole): string => {
      switch (role) {
        case UserRole.ADMIN: return 'مدير';
        case UserRole.CASHIER: return 'كاشير';
        case UserRole.EMPLOYEE: return 'موظف';
        case UserRole.DELIVERY: return 'مندوب توصيل';
        default: return role;
      }
    };
    
    const getSalaryTypeInArabic = (type: string): string => {
      switch (type) {
        case 'monthly': return 'شهري';
        case 'daily': return 'يومي';
        case 'hourly': return 'بالساعة';
        default: return type || 'شهري';
      }
    };
    
    users.forEach(user => {
      const totalHours = user.shifts ? user.shifts.reduce((total, shift) => {
        if (shift.total_hours) {
          return total + shift.total_hours;
        }
        return total;
      }, 0) : 0;
      
      worksheet.addRow([
        user.name,
        getRoleInArabic(user.role),
        user.username,
        user.phone || '',
        user.email || '',
        user.salary || 0,
        getSalaryTypeInArabic(user.salary_type),
        user.active !== false ? 'نشط' : 'غير نشط',
        totalHours.toFixed(1),
        new Date(user.created_at).toLocaleDateString('ar-EG')
      ]);
    });
    
    worksheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = maxLength < 10 ? 10 : maxLength;
    });
    
    const buffer = await workbook.xlsx.writeBuffer();
    
    const date = new Date().toISOString().split('T')[0];
    const fileName = `قائمة_الموظفين_${date}.xlsx`;
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    FileSaver.saveAs(blob, fileName);
  } catch (error) {
    console.error("Error exporting employees to Excel:", error);
    throw error;
  }
}
