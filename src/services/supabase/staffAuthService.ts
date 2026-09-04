import { supabase } from "@/integrations/supabase/client";
import { User, UserRole } from "@/types";
import { useBranchStore } from "@/stores/branchStore";

const GENERIC_LOGIN_ERROR = "اسم المستخدم أو كلمة المرور أو كود الماركت غير صحيح";

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function staffAuthEmail(username: string): string {
  const bytes = new TextEncoder().encode(username.trim());
  return `u-${bytesToBase64Url(bytes)}@staff.elmadawymarket.local`;
}

async function getFunctionErrorDetails(error: any): Promise<{ message?: string; code?: string }> {
  try {
    if (error?.context && typeof error.context.json === "function") {
      const payload = await error.context.json();
      return {
        message: typeof payload?.error === "string" ? payload.error : undefined,
        code: typeof payload?.code === "string" ? payload.code : undefined,
      };
    }
  } catch {
    // Ignore malformed/non-JSON function responses and use a generic error.
  }

  return {};
}

async function fetchStaffProfile(userId: string): Promise<User> {
  const { data, error } = await supabase
    .from("users")
    .select("id,name,username,role,phone,email,active,created_at")
    .eq("id", userId)
    .single();

  if (error || !data || data.active === false) {
    throw new Error("هذا الحساب غير متاح حالياً");
  }

  const { data: shifts } = await supabase
    .from("shifts")
    .select("*")
    .eq("employee_id", userId);

  return {
    id: data.id,
    name: data.name,
    username: data.username,
    role: data.role as UserRole,
    phone: data.phone || "",
    email: data.email || undefined,
    created_at: data.created_at,
    active: data.active !== false,
    shifts: shifts || [],
  };
}

async function userCanAccessBranch(user: User, branchId: string): Promise<boolean> {
  if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
    // Admin access is still validated by RLS; super admins can select any active branch.
    if (user.role === UserRole.SUPER_ADMIN) return true;
  }

  const { data, error } = await supabase
    .from("user_branch_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (error) return false;
  return !!data;
}

async function setValidatedBranch(user: User, branchCode: string) {
  const { data: branch, error } = await supabase
    .from("branches")
    .select("id,name,active,code")
    .eq("code", branchCode.trim())
    .maybeSingle();

  if (error || !branch || branch.active === false) {
    throw new Error(GENERIC_LOGIN_ERROR);
  }

  if (!(await userCanAccessBranch(user, branch.id))) {
    throw new Error("ليس لديك صلاحية للدخول لهذا الفرع");
  }

  useBranchStore.getState().setBranch(branch.id, branch.name);
  localStorage.setItem("currentBranchId", branch.id);
  localStorage.setItem("currentBranchName", branch.name || "");

  return branch;
}

async function restoreValidatedBranch(user: User): Promise<boolean> {
  const savedBranchId = localStorage.getItem("currentBranchId");

  if (savedBranchId) {
    const { data: savedBranch } = await supabase
      .from("branches")
      .select("id,name,active")
      .eq("id", savedBranchId)
      .maybeSingle();

    if (savedBranch?.active && (await userCanAccessBranch(user, savedBranch.id))) {
      useBranchStore.getState().setBranch(savedBranch.id, savedBranch.name);
      return true;
    }
  }

  if (user.role === UserRole.SUPER_ADMIN) {
    const { data: firstBranch } = await supabase
      .from("branches")
      .select("id,name,active")
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (firstBranch) {
      useBranchStore.getState().setBranch(firstBranch.id, firstBranch.name);
      return true;
    }

    return false;
  }

  const { data: branchRole } = await supabase
    .from("user_branch_roles")
    .select("branch_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!branchRole?.branch_id) return false;

  const { data: branch } = await supabase
    .from("branches")
    .select("id,name,active")
    .eq("id", branchRole.branch_id)
    .eq("active", true)
    .maybeSingle();

  if (!branch) return false;

  useBranchStore.getState().setBranch(branch.id, branch.name);
  return true;
}

export async function authenticateStaffUser(
  username: string,
  password: string,
  branchCode: string
): Promise<User> {
  const normalizedUsername = username.trim();
  const normalizedBranchCode = branchCode.trim();

  if (!normalizedUsername || !password || !normalizedBranchCode) {
    throw new Error(GENERIC_LOGIN_ERROR);
  }

  const authEmail = staffAuthEmail(normalizedUsername);

  // Existing migrated users authenticate directly with Supabase Auth.
  let signInResult = await supabase.auth.signInWithPassword({
    email: authEmail,
    password,
  });

  // Existing legacy users are migrated once, server-side, after their old
  // username/password/branch combination is validated.
  if (signInResult.error) {
    const { error: migrationError } = await supabase.functions.invoke("migrate-staff-login", {
      body: {
        username: normalizedUsername,
        password,
        branchCode: normalizedBranchCode,
      },
    });

    if (migrationError) {
      const details = await getFunctionErrorDetails(migrationError);
      if (details.code !== "already_migrated") {
        throw new Error(details.message || GENERIC_LOGIN_ERROR);
      }
    }

    // Retry after migration (or a race where another session migrated first).
    signInResult = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    });
  }

  if (signInResult.error || !signInResult.data.user) {
    throw new Error(GENERIC_LOGIN_ERROR);
  }

  try {
    const user = await fetchStaffProfile(signInResult.data.user.id);
    await setValidatedBranch(user, normalizedBranchCode);
    return user;
  } catch (error) {
    await supabase.auth.signOut();
    useBranchStore.getState().setBranch(null);
    throw error;
  }
}

export async function restoreStaffSession(): Promise<User | null> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) return null;

  try {
    const user = await fetchStaffProfile(sessionData.session.user.id);
    const hasBranch = await restoreValidatedBranch(user);

    if (!hasBranch) {
      await supabase.auth.signOut();
      useBranchStore.getState().setBranch(null);
      return null;
    }

    return user;
  } catch {
    await supabase.auth.signOut();
    useBranchStore.getState().setBranch(null);
    return null;
  }
}

export async function signOutStaff(): Promise<void> {
  await supabase.auth.signOut();
  useBranchStore.getState().setBranch(null);
  localStorage.removeItem("user");
}
