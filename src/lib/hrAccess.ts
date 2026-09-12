import { User, UserRole } from "@/types";

export type HrWorkspaceLevel = "employee" | "team" | "department" | "branch" | "hr" | "admin";
export type HrCapability =
  | "self"
  | "team"
  | "people"
  | "organization"
  | "attendance_manage"
  | "shifts_manage"
  | "leave_manage"
  | "payroll"
  | "approvals"
  | "admin";

export type HrAccess = {
  roleCode: string;
  roleLabel: string;
  level: HrWorkspaceLevel;
  permissions: string[];
  canViewTeam: boolean;
  canManagePeople: boolean;
  canManageOrganization: boolean;
  canManageAttendance: boolean;
  canManageShifts: boolean;
  canManageLeave: boolean;
  canManagePayroll: boolean;
  canApprove: boolean;
  canAdministerHr: boolean;
};

const LEVEL_WEIGHT: Record<HrWorkspaceLevel, number> = {
  employee: 0,
  team: 1,
  department: 2,
  branch: 3,
  hr: 4,
  admin: 5,
};

const roleLabels: Record<string, string> = {
  super_admin: "مدير النظام",
  hr_admin: "مسؤول HR",
  hr_manager: "مدير الموارد البشرية",
  branch_admin: "مسؤول الفرع",
  branch_manager: "مدير الفرع",
  department_manager: "مدير قسم",
  team_lead: "قائد فريق",
  supervisor: "مشرف",
  employee: "موظف",
  cashier: "كاشير",
  delivery: "مندوب توصيل",
  delivery_driver: "مندوب توصيل",
  accountant: "محاسب",
};

function readPermissions(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem("currentStaffPermissions") || "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function readRoleCode(user: User | null | undefined) {
  if (user?.role === UserRole.SUPER_ADMIN) return "super_admin";
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("currentStaffRoleCode");
    if (stored) return stored;
  }
  return user?.role || "employee";
}

function resolveLevel(roleCode: string, permissions: string[], user: User | null | undefined): HrWorkspaceLevel {
  if (user?.role === UserRole.SUPER_ADMIN || roleCode === "super_admin" || roleCode === "hr_admin") return "admin";
  if (roleCode === "hr_manager") return "hr";
  if (roleCode === "branch_manager" || roleCode === "branch_admin") return "branch";
  if (roleCode === "department_manager") return "department";
  if (roleCode === "team_lead" || roleCode === "supervisor") return "team";
  if (permissions.includes("hr.manage_employees")) return "branch";
  if (permissions.includes("hr.attendance.approve") || permissions.includes("hr.team.view")) return "team";
  return "employee";
}

export function getHrAccess(user: User | null | undefined): HrAccess {
  const permissions = readPermissions();
  const roleCode = readRoleCode(user);
  const level = resolveLevel(roleCode, permissions, user);
  const isSuper = user?.role === UserRole.SUPER_ADMIN || roleCode === "super_admin";
  const atLeast = (target: HrWorkspaceLevel) => LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[target];
  const has = (...codes: string[]) => isSuper || codes.some(code => permissions.includes(code));

  const canViewTeam = atLeast("team") || has("hr.team.view");
  const canManagePeople = atLeast("branch") || has("hr.manage_employees");
  const canManageOrganization = atLeast("hr") || has("hr.organization.manage") || canManagePeople;
  const canManageAttendance = atLeast("branch") || has("hr.attendance.manage", "hr.attendance.approve");
  const canManageShifts = atLeast("branch") || has("hr.shifts.manage") || canManagePeople;
  const canManageLeave = atLeast("branch") || has("hr.leave.manage", "hr.leave.approve", "hr.attendance.approve");
  const canManagePayroll = isSuper || roleCode === "hr_admin" || roleCode === "hr_manager" || has("hr.payroll.view", "hr.payroll.manage", "hr.payroll.approve");
  const canApprove = canViewTeam || has("hr.approvals.view", "hr.attendance.approve", "hr.leave.approve");
  const canAdministerHr = level === "admin" || has("hr.admin");

  return {
    roleCode,
    roleLabel: roleLabels[roleCode] || roleCode.replaceAll("_", " "),
    level,
    permissions,
    canViewTeam,
    canManagePeople,
    canManageOrganization,
    canManageAttendance,
    canManageShifts,
    canManageLeave,
    canManagePayroll,
    canApprove,
    canAdministerHr,
  };
}

export function hasHrCapability(access: HrAccess, capability: HrCapability) {
  switch (capability) {
    case "self": return true;
    case "team": return access.canViewTeam;
    case "people": return access.canManagePeople;
    case "organization": return access.canManageOrganization;
    case "attendance_manage": return access.canManageAttendance;
    case "shifts_manage": return access.canManageShifts;
    case "leave_manage": return access.canManageLeave;
    case "payroll": return access.canManagePayroll;
    case "approvals": return access.canApprove;
    case "admin": return access.canAdministerHr;
    default: return false;
  }
}
