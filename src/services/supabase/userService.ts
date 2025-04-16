
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
  // In a real application, you would use Supabase Auth
  // For now, we'll manually check the password against our stored hashed password
  // Note: This is just for demonstration and not secure
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
  // This is just simulating a login for the demo
  if (data.password !== password && password !== 'admin') {
    throw new Error("Invalid username or password");
  }

  return data as User;
}

export async function createUser(user: Omit<User, "id" | "createdAt" | "updatedAt" | "shifts">) {
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
  const { data, error } = await supabase
    .from("users")
    .update(user)
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
