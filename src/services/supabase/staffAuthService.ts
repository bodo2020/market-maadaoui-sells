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

export type StaffLoginState = {
  user: User | null;
  branches: StaffBranchContext[];
  requiresBranchSelection: boolean;
  isSuperAdmin: boolean;
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
    active: (data.active as boolean) !== false,
    shifts: shifts || [],
  };
}

function lastBranchKey(userId: string) {
  return `lastStaffBranchId:${userId}`;
}

function saveStaffAccessContext(context: StaffBranchContext, userId: string) {
  useBranchStore.getState().setBranch(context.branch_id, context.branch_name);
  localStorage.setItem("currentStaffRoleCode", context.role_code);
  localStorage.setItem("currentStaffPermissions", JSON.stringify(context.permissions || []));
  localStorage.setItem("currentStaffPosEnabled", String(!!context.pos_enabled));
  localStorage.setItem(lastBranchKey(userId), context.branch_id);
}

function clearStaffAccessContext() {
  useBranchStore.getState().setBranch(null);
  localStorage.removeItem("currentStaffRoleCode");
  localStorage.removeItem("currentStaffPermissions");
  localStorage.removeItem("currentStaffPosEnabled");
}

function findBranch(contexts: StaffBranchContext[], branchId: string | null | undefined) {
  if (!branchId) return undefined;
  return contexts.find(item => item.branch_id === branchId);
}

async function activateBranchForIdentity(
  identity: StaffIdentity,
  contexts: StaffBranchContext[],
  branchId: string,
): Promise<User> {
  const selected = findBranch(contexts, branchId);
  if (!selected) throw new Error("ليس لديك صلاحية للدخول لهذا الفرع");
  saveStaffAccessContext(selected, identity.user_id);
  return fetchStaffProfile(
    identity,
    mapEffectiveRole(identity.is_super_admin ? "super_admin" : selected.role_code),
  );
}

async function buildLoginState(
  identity: StaffIdentity,
  contexts: StaffBranchContext[],
  mode: "fresh-login" | "restore",
): Promise<StaffLoginState> {
  if (!contexts.length) throw new Error(NO_BRANCH_ERROR);

  // A single allowed branch never needs another screen.
  if (contexts.length === 1) {
    const user = await activateBranchForIdentity(identity, contexts, contexts[0].branch_id);
    return { user, branches: contexts, requiresBranchSelection: false, isSuperAdmin: identity.is_super_admin };
  }

  // Restoring an already active session must keep its validated current branch.
  if (mode === "restore") {
    const current = findBranch(contexts, localStorage.getItem("currentBranchId"));
    if (current) {
      const user = await activateBranchForIdentity(identity, contexts, current.branch_id);
      return { user, branches: contexts, requiresBranchSelection: false, isSuperAdmin: identity.is_super_admin };
    }
  }

  // Super admins can resume their last branch across logins. Other multi-branch staff
  // explicitly choose where they are working each time they sign in.
  if (identity.is_super_admin) {
    const remembered = findBranch(contexts, localStorage.getItem(lastBranchKey(identity.user_id)));
    if (remembered) {
      const user = await activateBranchForIdentity(identity, contexts, remembered.branch_id);
      return { user, branches: contexts, requiresBranchSelection: false, isSuperAdmin: true };
    }
  }

  clearStaffAccessContext();
  return {
    user: null,
    branches: contexts,
    requiresBranchSelection: true,
    isSuperAdmin: identity.is_super_admin,
  };
}

export async function authenticateStaffUser(
  username: string,
  password: string,
): Promise<StaffLoginState> {
  const normalizedUsername = username.trim();

  if (!normalizedUsername || !password) {
    throw new Error(GENERIC_LOGIN_ERROR);
  }

  const authEmail = staffAuthEmail(normalizedUsername);
  let signInResult = await supabase.auth.signInWithPassword({ email: authEmail, password });

  if (signInResult.error) {
    const { error: migrationError } = await supabase.functions.invoke("migrate-staff-login", {
      body: { username: normalizedUsername, password },
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
    const contexts = await fetchMyStaffBranches();
    return await buildLoginState(identity, contexts, "fresh-login");
  } catch (error) {
    await supabase.auth.signOut();
    clearStaffAccessContext();
    throw error;
  }
}

export async function selectStaffBranch(branchId: string): Promise<StaffLoginState> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) throw new Error("انتهت جلسة تسجيل الدخول. سجل دخولك مرة تانية.");

  const identity = await fetchMyIdentity();
  if (identity.user_id !== sessionData.session.user.id) throw new Error("INVALID_STAFF_SESSION");
  const contexts = await fetchMyStaffBranches();
  const user = await activateBranchForIdentity(identity, contexts, branchId);
  return {
    user,
    branches: contexts,
    requiresBranchSelection: false,
    isSuperAdmin: identity.is_super_admin,
  };
}

export async function restoreStaffSession(): Promise<StaffLoginState | null> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) return null;

  try {
    const identity = await fetchMyIdentity();
    if (identity.user_id !== sessionData.session.user.id) throw new Error("INVALID_STAFF_SESSION");
    const contexts = await fetchMyStaffBranches();
    return await buildLoginState(identity, contexts, "restore");
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
