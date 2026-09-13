import { supabase } from "@/integrations/supabase/client";
import { User, UserRole, Shift } from "@/types";
import * as ExcelJS from "exceljs";
import * as FileSaver from "file-saver";

const USER_SAFE_COLUMNS =
  "id,name,username,role,phone,email,active,created_at,system_role_id" as const;

const USER_BRANCH_SAFE_SELECT = `
  user_id,
  users:user_id (
    id,
    name,
    username,
    role,
    phone,
    email,
    active,
    created_at,
    system_role_id
  )
` as const;

async function attachShifts(user: any): Promise<User> {
  const { data: shifts, error: shiftsError } = await supabase
    .from("shifts")
    .select("*")
    .eq("employee_id", user.id);

  if (shiftsError) {
    console.error("Error fetching shifts for user:", shiftsError);
    return { ...user, shifts: [] } as User;
  }

  return { ...user, shifts: shifts || [] } as User;
}

export async function fetchUsers() {
  try {
    const storedUser = localStorage.getItem("user");
    const currentBranchId = localStorage.getItem("currentBranchId");

    let userRole: string | null = null;
    if (storedUser) {
      try {
        userRole = JSON.parse(storedUser)?.role || null;
      } catch (error) {
        console.error("Error parsing user:", error);
      }
    }

    if (userRole === "super_admin") {
      if (currentBranchId) {
        const { data: branchUsers, error: branchError } = await supabase
          .from("user_branch_roles")
          .select(USER_BRANCH_SAFE_SELECT)
          .eq("branch_id", currentBranchId);

        if (branchError) {
          console.error("Error fetching branch users (super_admin):", branchError);
          throw branchError;
        }

        const usersWithShifts = await Promise.all(
          (branchUsers || []).map(async (branchUser: any) => {
            const user = branchUser.users;
            if (!user || user.role === "super_admin") return null;
            return attachShifts(user);
          }),
        );

        return usersWithShifts.filter((user): user is User => user !== null);
      }

      const { data, error } = await supabase
        .from("users")
        .select(USER_SAFE_COLUMNS)
        .neq("role", "super_admin");

      if (error) {
        console.error("Error fetching users:", error);
        throw error;
      }

      return Promise.all((data || []).map(attachShifts));
    }

    if (!currentBranchId) {
      console.warn("No current branch ID found");
      return [];
    }

    const { data: branchUsers, error: branchError } = await supabase
      .from("user_branch_roles")
      .select(USER_BRANCH_SAFE_SELECT)
      .eq("branch_id", currentBranchId);

    if (branchError) {
      console.error("Error fetching branch users:", branchError);
      throw branchError;
    }

    const usersWithShifts = await Promise.all(
      (branchUsers || []).map(async (branchUser: any) => {
        const user = branchUser.users;
        if (!user || user.role === "super_admin") return null;
        return attachShifts(user);
      }),
    );

    return usersWithShifts.filter((user): user is User => user !== null);
  } catch (error) {
    console.error("Error in fetchUsers:", error);
    throw error;
  }
}

export async function fetchUserById(id: string) {
  try {
    const { data, error } = await supabase
      .from("users")
      .select(USER_SAFE_COLUMNS)
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching user:", error);
      throw error;
    }

    return attachShifts(data);
  } catch (error) {
    console.error("Error in fetchUserById:", error);
    throw error;
  }
}

/**
 * Legacy browser-side authentication was intentionally removed.
 * Staff sign-in must go through staffAuthService/Supabase Auth so password
 * hashes are never fetched into the browser and there is no hardcoded admin bypass.
 */

export async function createUser(
  user: Omit<User, "id" | "created_at" | "updated_at" | "shifts">,
) {
  try {
    const { data: newUser, error } = await supabase
      .from("users")
      .insert([
        {
          name: user.name,
          role: user.role,
          phone: user.phone,
          password: user.password,
          username: user.username || user.phone,
          email: user.email,
          active: user.active !== false,
        },
      ])
      .select(USER_SAFE_COLUMNS)
      .single();

    if (error) {
      console.error("Error creating user:", error);
      throw error;
    }

    if (!newUser) throw new Error("تعذر إنشاء الموظف");

    if (newUser.role !== "super_admin") {
      const currentBranchId = localStorage.getItem("currentBranchId");

      if (!currentBranchId) {
        throw new Error("لا يوجد فرع محدد لإضافة الموظف إليه");
      }

      const { error: roleError } = await supabase
        .from("user_branch_roles")
        .insert({
          user_id: newUser.id,
          branch_id: currentBranchId,
          role: newUser.role,
        });

      if (roleError) {
        console.error("Error adding user to branch:", roleError);
        throw roleError;
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
    const allowedFields = new Set([
      "name",
      "role",
      "phone",
      "password",
      "username",
      "email",
      "active",
    ]);
    const updateData: Record<string, unknown> = {};

    Object.entries(user).forEach(([key, value]) => {
      if (value !== undefined && allowedFields.has(key)) updateData[key] = value;
    });

    if (Object.keys(updateData).length === 0) return fetchUserById(id);

    const { data, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", id)
      .select(USER_SAFE_COLUMNS)
      .single();

    if (error) {
      console.error("Error updating user:", error);
      throw error;
    }

    return attachShifts(data);
  } catch (error) {
    console.error("Error in updateUser:", error);
    throw error;
  }
}

export async function deleteUser(id: string) {
  try {
    const { error: branchRolesError } = await supabase
      .from("user_branch_roles")
      .delete()
      .eq("user_id", id);

    if (branchRolesError) {
      console.error("Error deleting user branch roles:", branchRolesError);
      throw branchRolesError;
    }

    const { error: shiftsError } = await supabase
      .from("shifts")
      .delete()
      .eq("employee_id", id);

    if (shiftsError) {
      console.error("Error deleting user shifts:", shiftsError);
      throw shiftsError;
    }

    const { error: salariesError } = await supabase
      .from("salaries")
      .delete()
      .eq("employee_id", id);

    if (salariesError) {
      console.error("Error deleting user salaries:", salariesError);
      throw salariesError;
    }

    const { error } = await supabase.from("users").delete().eq("id", id);

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
      .insert([
        {
          employee_id: employeeId,
          start_time: new Date().toISOString(),
        },
      ])
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
        total_hours: hoursWorked,
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

    if (error && error.code !== "PGRST116") {
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
      .order("start_time", { ascending: false });

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
      .from("users")
      .select("id,name,username,email,phone,role,active")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error fetching user:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}

export async function getUsersByIds(userIds: string[]) {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id,name,username,email,phone,role,active")
      .in("id", userIds);

    if (error) {
      console.error("Error fetching users:", error);
      return new Map();
    }

    const userMap = new Map();
    (data || []).forEach((user: any) => userMap.set(user.id, user));
    return userMap;
  } catch (error) {
    console.error("Error fetching users:", error);
    return new Map();
  }
}

export async function getUserName(userId: string): Promise<string> {
  const user = await getUserById(userId);
  return user?.name || user?.username || "غير معروف";
}

export async function exportEmployeesToExcel(): Promise<void> {
  try {
    const users = await fetchUsers();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("الموظفين");

    worksheet.views = [{ rightToLeft: true }];

    worksheet.addRow([
      "الاسم",
      "الدور الوظيفي",
      "اسم المستخدم",
      "رقم الهاتف",
      "البريد الإلكتروني",
      "الراتب",
      "نوع الراتب",
      "الحالة",
      "إجمالي ساعات العمل",
      "تاريخ التسجيل",
    ]);

    worksheet.getRow(1).font = { bold: true, size: 14 };
    worksheet.getRow(1).alignment = { horizontal: "center" };

    const getRoleInArabic = (role: UserRole): string => {
      switch (role) {
        case UserRole.ADMIN:
          return "مدير";
        case UserRole.CASHIER:
          return "كاشير";
        case UserRole.EMPLOYEE:
          return "موظف";
        case UserRole.DELIVERY:
          return "مندوب توصيل";
        default:
          return role;
      }
    };

    users.forEach((user) => {
      const totalHours = user.shifts
        ? user.shifts.reduce(
            (total, shift) => total + (shift.total_hours || 0),
            0,
          )
        : 0;

      worksheet.addRow([
        user.name,
        getRoleInArabic(user.role),
        user.username,
        user.phone || "",
        user.email || "",
        0,
        "شهري",
        user.active !== false ? "نشط" : "غير نشط",
        totalHours.toFixed(1),
        new Date(user.created_at).toLocaleDateString("ar-EG"),
      ]);
    });

    worksheet.columns.forEach((column) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) maxLength = columnLength;
      });
      column.width = maxLength < 10 ? 10 : maxLength;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const date = new Date().toISOString().split("T")[0];
    const fileName = `قائمة_الموظفين_${date}.xlsx`;
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    FileSaver.saveAs(blob, fileName);
  } catch (error) {
    console.error("Error exporting employees to Excel:", error);
    throw error;
  }
}
