import { supabase } from "@/integrations/supabase/client";
import { User, UserRole } from "@/types";
import { useBranchStore } from "@/stores/branchStore";

const GENERIC_LOGIN_ERROR = "اسم المستخدم أو كلمة المرور غير صحيح";
const NO_BRANCH_ERROR = "لا يوجد فرع نشط متاح لهذا الحساب";

export type StaffBranchContext = {
  branch_id: string;
  branch_name: string;
  branch_code: string;
  role_code: string;
  role_name_ar: string;
  is_primary: boolean;
  pos_enabled: boolean;
  permissions: string[];
};

type StaffIdentity = {
  user_id: string;
  name: string;
  username: string;
  phone: string | null;
  active: boolean;
  is_super_admin: boolean;
  system_role: string | null;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

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

function mapEffectiveRole(roleCode: string | null | undefined): UserRole {
  switch (roleCode) {
    case "super_admin":
      return UserRole.SUPER_ADMIN;
    case "branch_admin":
    case "branch_manager":
      return UserRole.ADMIN;
    case "cashier":
      return UserRole.CASHIER;
    case "delivery":
    case "delivery_driver":
      return UserRole.DELIVERY;
    default:
      return UserRole.EMPLOYEE;
  }
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

async function fetchMyIdentity(): Promise<StaffIdentity> {
  const { data, error } = await rpc("get_my_staff_identity");
  if (error || !data || typeof data !== "object") {
    throw new Error("هذا الحساب غير متاح حالياً");
  }

  const identity = data as StaffIdentity;
  if (!identity.user_id || identity.active === false) {
    throw new Error("هذا الحساب غير متاح حالياً");
  }
  return identity;
}

export async function fetchMyStaffBranches(): Promise<StaffBranchContext[]> {
  const { data, error } = await rpc("get_my_staff_branches");
  if (error) throw new Error(error.message || NO_BRANCH_ERROR);
  return (Array.isArray(data) ? data : []) as StaffBranchContext[];
}

async function fetchStaffProfile(identity: StaffIdentity, effectiveRole: UserRole): Promise<User> {
  const { data, error } = await supabase
    .from("users")
    .select("id,name,username,phone,email,active,created_at")
    .eq("id", identity.user_id)
    .single();

  if (error || !data || data.active === false) {
    throw new Error("هذا الحساب غير متاح حالياً");
  }

  const { data: shifts } = await supabase
    .from("shifts")
    .select("*")
    .eq("employee_id", identity.user_id);

  return {
    id: data.id,
    name: data.name,
    username: data.username,
    role: effectiveRole,
    phone: data.phone || "",
    email: data.email || undefined,
    created_at: data.created_at,
    active: data.active !== false,
    shifts: shifts || [],
  };
}

function saveStaffAccessContext(context: StaffBranchContext) {
  useBranchStore.getState().setBranch(context.branch_id, context.branch_name);
  localStorage.setItem("currentBranchId", context.branch_id);
  localStorage.setItem("currentBranchName", context.branch_name || "");
  localStorage.setItem("currentStaffRoleCode", context.role_code);
  localStorage.setItem("currentStaffPermissions", JSON.stringify(context.permissions || []));
  localStorage.setItem("currentStaffPosEnabled", String(!!context.pos_enabled));
}

function clearStaffAccessContext() {
  useBranchStore.getState().setBranch(null);
  localStorage.removeItem("currentBranchId");
  localStorage.removeItem("currentBranchName");
  localStorage.removeItem("currentStaffRoleCode");
  localStorage.removeItem("currentStaffPermissions");
  localStorage.removeItem("currentStaffPosEnabled");
}

function chooseBranchContext(contexts: StaffBranchContext[], branchCode?: string): StaffBranchContext {
  const normalizedCode = branchCode?.trim();
  if (normalizedCode) {
    const requested = contexts.find(item => item.branch_code.toLowerCase() === normalizedCode.toLowerCase());
    if (!requested) throw new Error("ليس لديك صلاحية للدخول لهذا الفرع");
    return requested;
  }

  const savedBranchId = localStorage.getItem("currentBranchId");
  const saved = savedBranchId ? contexts.find(item => item.branch_id === savedBranchId) : undefined;
  if (saved) return saved;

  const primary = contexts.find(item => item.is_primary);
  if (primary) return primary;
  if (contexts.length === 1) return contexts[0];
  if (contexts[0]) return contexts[0];
  throw new Error(NO_BRANCH_ERROR);
}

async function resolveAndSaveBranch(branchCode?: string): Promise<StaffBranchContext> {
  const contexts = await fetchMyStaffBranches();
  if (!contexts.length) throw new Error(NO_BRANCH_ERROR);
  const selected = chooseBranchContext(contexts, branchCode);
  saveStaffAccessContext(selected);
  return selected;
}

export async function authenticateStaffUser(
  username: string,
  password: string,
  branchCode?: string,
): Promise<User> {
  const normalizedUsername = username.trim();
  const normalizedBranchCode = branchCode?.trim() || "";

  if (!normalizedUsername || !password) {
    throw new Error(GENERIC_LOGIN_ERROR);
  }

  const authEmail = staffAuthEmail(normalizedUsername);

  // Migrated staff authenticate directly through Supabase Auth.
  let signInResult = await supabase.auth.signInWithPassword({ email: authEmail, password });

  // Legacy accounts are migrated once. branchCode remains optional at the client layer
  // so phase 2 can remove it from the login UI without changing this API again.
  if (signInResult.error) {
    const { error: migrationError } = await supabase.functions.invoke("migrate-staff-login", {
      body: {
        username: normalizedUsername,
        password,
        ...(normalizedBranchCode ? { branchCode: normalizedBranchCode } : {}),
      },
    });

    if (migrationError) {
      const details = await getFunctionErrorDetails(migrationError);
      if (details.code !== "already_migrated") {
        throw new Error(details.message || GENERIC_LOGIN_ERROR);
      }
    }

    signInResult = await supabase.auth.signInWithPassword({ email: authEmail, password });
  }

  if (signInResult.error || !signInResult.data.user) {
    throw new Error(GENERIC_LOGIN_ERROR);
  }

  try {
    const identity = await fetchMyIdentity();
    if (identity.user_id !== signInResult.data.user.id) throw new Error(GENERIC_LOGIN_ERROR);
    const branch = await resolveAndSaveBranch(normalizedBranchCode || undefined);
    return await fetchStaffProfile(identity, mapEffectiveRole(identity.is_super_admin ? "super_admin" : branch.role_code));
  } catch (error) {
    await supabase.auth.signOut();
    clearStaffAccessContext();
    throw error;
  }
}

export async function restoreStaffSession(): Promise<User | null> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) return null;

  try {
    const identity = await fetchMyIdentity();
    if (identity.user_id !== sessionData.session.user.id) throw new Error("INVALID_STAFF_SESSION");
    const branch = await resolveAndSaveBranch();
    return await fetchStaffProfile(identity, mapEffectiveRole(identity.is_super_admin ? "super_admin" : branch.role_code));
  } catch {
    await supabase.auth.signOut();
    clearStaffAccessContext();
    return null;
  }
}

export function getCurrentStaffPermissions(): string[] {
  try {
    return JSON.parse(localStorage.getItem("currentStaffPermissions") || "[]") as string[];
  } catch {
    return [];
  }
}

export function currentStaffHasPermission(permission: string): boolean {
  return getCurrentStaffPermissions().includes(permission);
}

export async function signOutStaff(): Promise<void> {
  await supabase.auth.signOut();
  clearStaffAccessContext();
  localStorage.removeItem("user");
}
