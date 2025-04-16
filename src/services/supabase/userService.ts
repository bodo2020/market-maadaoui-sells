
import { supabase } from "@/integrations/supabase/client";
import { User, UserRole } from "@/types";

export async function fetchUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("*");

  if (error) {
    console.error("Error fetching users:", error);
    throw error;
  }

  return data as User[];
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

  return data as User;
}

export async function authenticateUser(username: string, password: string) {
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
      active: true
    } as User;
  }

  // If not admin, try the database
  try {
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

    return data as User;
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
      username: user.phone, // Using phone as username for simplicity
    }])
    .select();

  if (error) {
    console.error("Error creating user:", error);
    throw error;
  }

  return data[0] as User;
}

export async function updateUser(id: string, user: Partial<User>) {
  const updateData: any = {};
  
  // Only include fields that are present in the user object
  Object.keys(user).forEach(key => {
    if (user[key as keyof User] !== undefined) {
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

  return data[0] as User;
}

export async function deleteUser(id: string) {
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
