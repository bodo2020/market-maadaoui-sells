import { supabase } from "@/integrations/supabase/client";
import { User, UserRole, Shift } from "@/types";
import { useBranchStore } from "@/stores/branchStore";
import * as ExcelJS from 'exceljs';
import * as FileSaver from 'file-saver';

export async function fetchUsers() {
  try {
    // Get current user and branch from localStorage
    const storedUser = localStorage.getItem("user");
    const currentBranchId = localStorage.getItem("currentBranchId");
    
    let userRole = null;
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        userRole = user.role;
      } catch (e) {
        console.error("Error parsing user:", e);
      }
    }

    // If super_admin, prefer filtering by selected branch; otherwise fall back to all (excluding super_admin)
    if (userRole === 'super_admin') {
      const selectedBranchId = localStorage.getItem("currentBranchId");

      if (selectedBranchId) {
        // Show only users assigned to the selected branch
        const { data: branchUsers, error: branchError } = await supabase
          .from("user_branch_roles")
          .select(`
            user_id,
            users:user_id (*)
          `)
          .eq("branch_id", selectedBranchId);

        if (branchError) {
          console.error("Error fetching branch users (super_admin):", branchError);
          throw branchError;
        }

        const usersWithShifts = await Promise.all(
          (branchUsers || []).map(async (branchUser: any) => {
            const user = branchUser.users;
            if (!user || user.role === 'super_admin') return null; // hide super_admin

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

        return usersWithShifts.filter(u => u !== null) as User[];
      }

      // No branch selected: return all (excluding super_admin)
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .neq("role", "super_admin");

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
    }

    // For other roles, fetch only users in the current branch (excluding super_admin)
    if (!currentBranchId) {
      console.warn("No current branch ID found");
      return [];
    }

    const { data: branchUsers, error: branchError } = await supabase
      .from("user_branch_roles")
      .select(`
        user_id,
        users:user_id (*)
      `)
      .eq("branch_id", currentBranchId);

    if (branchError) {
      console.error("Error fetching branch users:", branchError);
      throw branchError;
    }

    const usersWithShifts = await Promise.all(
      (branchUsers || []).map(async (branchUser: any) => {
        const user = branchUser.users;
        // Filter out super_admin and null users
        if (!user || user.role === 'super_admin') return null;

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

    return usersWithShifts.filter(u => u !== null) as User[];
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

export async function authenticateUser(username: string, password: string, branchCode: string) {
  try {
    // Check for hardcoded admin (special case without branch)
    if (username === 'admin' && password === 'admin') {
      // For admin, get the first active branch as default
      const { data: firstBranch } = await supabase
        .from("branches")
        .select("id, name")
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();
      
      if (firstBranch) {
        useBranchStore.getState().setBranch(firstBranch.id, firstBranch.name);
        localStorage.setItem('currentBranchId', firstBranch.id);
        localStorage.setItem('currentBranchName', firstBranch.name);
      }
      
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

    // Verify branch code first
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("id, name, active, code")
      .eq("code", branchCode)
      .maybeSingle();

    if (branchError || !branch) {
      console.error("Branch not found:", branchError);
      throw new Error("كود الماركت غير صحيح");
    }

    if (!branch.active) {
      throw new Error("هذا الفرع غير نشط حالياً");
    }

    // Authenticate user
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .maybeSingle();

    if (error) {
      console.error("Authentication error:", error);
      throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
    }

    if (!data) {
      console.error("User not found");
      throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
    }

    if (data.password !== password) {
      console.error("Password mismatch");
      throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
    }

    // Check if user has access to this branch
    const { data: userBranchRole, error: roleError } = await supabase
      .from("user_branch_roles")
      .select("*")
      .eq("user_id", data.id)
      .eq("branch_id", branch.id)
      .maybeSingle();

    // Only allow super_admin to access any branch
    const isSuperAdmin = data.role === 'super_admin';
    
    if (!isSuperAdmin && !userBranchRole) {
      throw new Error("ليس لديك صلاحية للدخول لهذا الفرع");
    }

    // Set the branch in the store
    useBranchStore.getState().setBranch(branch.id, branch.name);
    localStorage.setItem('currentBranchId', branch.id);
    localStorage.setItem('currentBranchName', branch.name);

    // Get user shifts
    const { data: shifts, error: shiftsError } = await supabase
      .from("shifts")
      .select("*")
      .eq("employee_id", data.id);

    if (shiftsError) {
      console.error("Error fetching shifts for user:", shiftsError);
      return { ...data, shifts: [] } as User;
    }

    return { ...data, shifts: shifts || [] } as User;
  } catch (error: any) {
    console.error("Authentication error:", error);
    throw error;
  }
}

export async function createUser(user: Omit<User, "id" | "created_at" | "updated_at" | "shifts">) {
  try {
    console.log("Creating user with data:", user);
    
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

    const newUser = data[0];
    console.log("User created successfully:", newUser);

    // Add user to current branch (except super_admin)
    if (newUser.role !== 'super_admin') {
      const currentBranchId = localStorage.getItem("currentBranchId");
      const currentBranchName = localStorage.getItem("currentBranchName");
      
      console.log("Adding user to branch:", { currentBranchId, currentBranchName });
      
      if (currentBranchId) {
        const { error: roleError } = await supabase
          .from("user_branch_roles")
          .insert({
            user_id: newUser.id,
            branch_id: currentBranchId,
            role: newUser.role
          });

        if (roleError) {
          console.error("Error adding user to branch:", roleError);
          throw roleError; // Throw error instead of silently failing
        }
        
        console.log("User successfully added to branch");
      } else {
        console.warn("No current branch ID found in localStorage");
      }
    }

    return { ...newUser, shifts: [] } as User;
  } catch (error) {
    console.error("Error in createUser:", error);
    throw error;
  }
}

export async function updateUser(id: string, user: Partial<User>) {
  try {
    const updateData: any = {};
    
    // استبعاد الحقول التي لا توجد في جدول users
    const excludedFields = ['shifts', 'salary', 'salary_type'];
    
    Object.keys(user).forEach(key => {
      if (user[key as keyof User] !== undefined && !excludedFields.includes(key)) {
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
    console.log("Attempting to delete user:", id);
    
    // Delete user_branch_roles first (foreign key constraint)
    const { error: branchRolesError } = await supabase
      .from("user_branch_roles")
      .delete()
      .eq("user_id", id);

    if (branchRolesError) {
      console.error("Error deleting user branch roles:", branchRolesError);
      throw branchRolesError;
    }

    // Delete shifts
    const { error: shiftsError } = await supabase
      .from("shifts")
      .delete()
      .eq("employee_id", id);

    if (shiftsError) {
      console.error("Error deleting user shifts:", shiftsError);
      throw shiftsError;
    }

    // Delete salaries
    const { error: salariesError } = await supabase
      .from("salaries")
      .delete()
      .eq("employee_id", id);

    if (salariesError) {
      console.error("Error deleting user salaries:", salariesError);
      throw salariesError;
    }

    // Finally delete user
    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting user:", error);
      throw error;
    }

    console.log("User deleted successfully:", id);
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

export async function getUserById(userId: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, username, email, phone, role, active')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

export async function getUsersByIds(userIds: string[]) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, username, email, phone, role, active')
      .in('id', userIds);

    if (error) {
      console.error('Error fetching users:', error);
      return new Map();
    }

    const userMap = new Map();
    data.forEach((user: any) => {
      userMap.set(user.id, user);
    });

    return userMap;
  } catch (error) {
    console.error('Error fetching users:', error);
    return new Map();
  }
}

export async function getUserName(userId: string): Promise<string> {
  const user = await getUserById(userId);
  return user?.name || user?.username || 'غير معروف';
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
        0, // الراتب متوفر الآن في جدول منفصل
        'شهري', // نوع الراتب
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
