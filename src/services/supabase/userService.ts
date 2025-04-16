import { supabase } from "@/integrations/supabase/client";
import { User, UserRole, Shift } from "@/types";

export async function fetchUsers() {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("*");

    if (error) {
      console.error("Error fetching users:", error);
      throw error;
    }

    // Fetch shifts for each user
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
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching user:", error);
    throw error;
  }

  // Fetch shifts for the user
  const { data: shifts, error: shiftsError } = await supabase
    .from("shifts")
    .select("*")
    .eq("employee_id", id);

  if (shiftsError) {
    console.error("Error fetching shifts for user:", shiftsError);
    return { ...data, shifts: [] } as User;
  }

  return { ...data, shifts: shifts || [] } as User;
}

export async function authenticateUser(username: string, password: string) {
  try {
    // Hardcoded admin user for testing
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

    // If not admin, try the database
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .single();

    if (error) {
      console.error("Authentication error:", error);
      throw new Error("Invalid username or password");
    }

    // For demo purposes only - in a real app, you'd use proper password verification
    if (data.password !== password) {
      throw new Error("Invalid username or password");
    }

    // Fetch shifts for the user
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
  const { data, error } = await supabase
    .from("users")
    .insert([{
      name: user.name,
      role: user.role,
      phone: user.phone,
      password: user.password,
      username: user.username || user.phone, // Using phone as username if none provided
      email: user.email
    }])
    .select();

  if (error) {
    console.error("Error creating user:", error);
    throw error;
  }

  return { ...data[0], shifts: [] } as User;
}

export async function updateUser(id: string, user: Partial<User>) {
  const updateData: any = {};
  
  // Only include fields that are present in the user object
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

  // Fetch shifts for the updated user
  const { data: shifts, error: shiftsError } = await supabase
    .from("shifts")
    .select("*")
    .eq("employee_id", id);

  if (shiftsError) {
    console.error("Error fetching shifts for user:", shiftsError);
    return { ...data[0], shifts: [] } as User;
  }

  return { ...data[0], shifts: shifts || [] } as User;
}

export async function deleteUser(id: string) {
  // First delete related shifts
  const { error: shiftsError } = await supabase
    .from("shifts")
    .delete()
    .eq("employee_id", id);

  if (shiftsError) {
    console.error("Error deleting user shifts:", shiftsError);
    throw shiftsError;
  }

  // Then delete the user
  const { error } = await supabase
    .from("users")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting user:", error);
    throw error;
  }

  return true;
}

// Shift-related functions
export async function startShift(employeeId: string) {
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
}

export async function endShift(shiftId: string) {
  const now = new Date();
  
  // First get the shift to calculate total hours
  const { data: shiftData, error: fetchError } = await supabase
    .from("shifts")
    .select("*")
    .eq("id", shiftId)
    .single();
  
  if (fetchError) {
    console.error("Error fetching shift:", fetchError);
    throw fetchError;
  }
  
  // Calculate total hours
  const startTime = new Date(shiftData.start_time);
  const hoursWorked = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  
  // Update the shift
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
}

export async function getActiveShift(employeeId: string) {
  const { data, error } = await supabase
    .from("shifts")
    .select("*")
    .eq("employee_id", employeeId)
    .is("end_time", null)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 means no rows returned
    console.error("Error fetching active shift:", error);
    throw error;
  }

  return data as Shift | null;
}

export async function getShifts(employeeId: string) {
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
}
