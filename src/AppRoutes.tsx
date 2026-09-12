import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "@/components/Auth/ProtectedRoute";
import HrLogin from "@/pages/HrLogin";
import HrDashboardPage from "@/pages/HrDashboardPage";
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

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<HrLogin />} />
      <Route path="/staff-device/activate" element={<StaffDeviceActivationPage />} />

      <Route path="/" element={<ProtectedRoute><HrDashboardPage /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><HrDashboardPage /></ProtectedRoute>} />
      <Route path="/my-hr" element={<ProtectedRoute><MyHRPortalPage /></ProtectedRoute>} />
      <Route path="/employees" element={<ProtectedRoute><EmployeeManagement /></ProtectedRoute>} />
      <Route path="/employees/:employeeId" element={<ProtectedRoute><Employee360Page /></ProtectedRoute>} />
      <Route path="/employees/:employeeId/devices" element={<ProtectedRoute><EmployeeDevicesPage /></ProtectedRoute>} />
      <Route path="/organization" element={<ProtectedRoute><OrganizationStructurePage /></ProtectedRoute>} />
      <Route path="/attendance" element={<ProtectedRoute><AttendanceWorkspace /></ProtectedRoute>} />
      <Route path="/hr/shifts" element={<ProtectedRoute><HrShiftSchedulingPage /></ProtectedRoute>} />
      <Route path="/hr/leave-calendar" element={<ProtectedRoute><HrLeaveCalendarPage /></ProtectedRoute>} />
      <Route path="/hr/payroll" element={<ProtectedRoute><HrPayrollPage /></ProtectedRoute>} />
      <Route path="/tasks" element={<ProtectedRoute><HrTasksWorkspace /></ProtectedRoute>} />
      <Route path="/approvals" element={<ProtectedRoute><ApprovalsCenterPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsCenterV2 /></ProtectedRoute>} />
      <Route path="/account" element={<ProtectedRoute><StaffAccountPage /></ProtectedRoute>} />

      <Route path="/pos" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
