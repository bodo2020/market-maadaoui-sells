import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "@/components/Auth/ProtectedRoute";
import HrAccessRoute from "@/components/hr/HrAccessRoute";
import HrLogin from "@/pages/HrLogin";
import HrDashboardPage from "@/pages/HrDashboardPage";
import HrTeamWorkspacePage from "@/pages/HrTeamWorkspacePage";
import EmployeeManagement from "@/pages/EmployeeManagement";
import Employee360Page from "@/pages/Employee360Page";
import EmployeeDevicesPage from "@/pages/EmployeeDevicesPage";
import AttendancePage from "@/pages/AttendancePage";
import AttendanceApprovedLeaveBanner from "@/components/hr/AttendanceApprovedLeaveBanner";
import MyHRPortalPage from "@/pages/MyHRPortalPage";
import HrLeaveCalendarPage from "@/pages/HrLeaveCalendarPage";
import HrPayrollPage from "@/pages/HrPayrollPage";
import HrShiftSchedulingPage from "@/pages/HrShiftSchedulingPage";
import OrganizationStructurePage from "@/pages/OrganizationStructurePage";
import OperationsTasksPage from "@/pages/OperationsTasksPage";
import HrTaskExecutionDock from "@/components/hr/HrTaskExecutionDock";
import ApprovalsCenterPage from "@/pages/ApprovalsCenterPage";
import NotificationsCenterV2 from "@/pages/NotificationsCenterV2";
import StaffAccountPage from "@/pages/StaffAccountPage";
import StaffDeviceActivationPage from "@/pages/StaffDeviceActivationPage";
import NotFound from "@/pages/NotFound";

const AttendanceWorkspace = () => (
  <>
    <AttendancePage />
    <AttendanceApprovedLeaveBanner />
  </>
);

const HrTasksWorkspace = () => (
  <>
    <OperationsTasksPage />
    <HrTaskExecutionDock />
  </>
);

const protect = (element: React.ReactNode) => <ProtectedRoute>{element}</ProtectedRoute>;
const protectHr = (capability: Parameters<typeof HrAccessRoute>[0]["capability"], element: React.ReactNode) => (
  <ProtectedRoute><HrAccessRoute capability={capability}>{element}</HrAccessRoute></ProtectedRoute>
);

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<HrLogin />} />
      <Route path="/staff-device/activate" element={<StaffDeviceActivationPage />} />

      <Route path="/" element={protect(<HrDashboardPage />)} />
      <Route path="/dashboard" element={protect(<HrDashboardPage />)} />
      <Route path="/my-hr" element={protect(<MyHRPortalPage />)} />
      <Route path="/attendance" element={protect(<AttendanceWorkspace />)} />
      <Route path="/tasks" element={protect(<HrTasksWorkspace />)} />
      <Route path="/notifications" element={protect(<NotificationsCenterV2 />)} />
      <Route path="/account" element={protect(<StaffAccountPage />)} />

      <Route path="/team" element={protectHr("team", <HrTeamWorkspacePage />)} />
      <Route path="/approvals" element={protectHr("approvals", <ApprovalsCenterPage />)} />
      <Route path="/employees" element={protectHr("people", <EmployeeManagement />)} />
      <Route path="/employees/:employeeId" element={protectHr("people", <Employee360Page />)} />
      <Route path="/employees/:employeeId/devices" element={protectHr("people", <EmployeeDevicesPage />)} />
      <Route path="/organization" element={protectHr("organization", <OrganizationStructurePage />)} />
      <Route path="/hr/shifts" element={protectHr("shifts_manage", <HrShiftSchedulingPage />)} />
      <Route path="/hr/leave-calendar" element={protectHr("leave_manage", <HrLeaveCalendarPage />)} />
      <Route path="/hr/payroll" element={protectHr("payroll", <HrPayrollPage />)} />

      <Route path="/pos" element={<Navigate to="/" replace />} />
      <Route path="/products/*" element={<Navigate to="/" replace />} />
      <Route path="/inventory/*" element={<Navigate to="/" replace />} />
      <Route path="/finance/*" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
