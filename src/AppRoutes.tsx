import { Navigate, Route, Routes } from "react-router-dom";
import Login from "@/pages/Login";
import ReportsV2 from "@/pages/ReportsV2";
import ReportsSalesV2 from "@/pages/ReportsSalesV2";
import ReportsProfitabilityV2 from "@/pages/ReportsProfitabilityV2";
import ReportsPaymentsV2 from "@/pages/ReportsPaymentsV2";
import ReportsReturnsV2 from "@/pages/ReportsReturnsV2";
import ReportsProductsV2 from "@/pages/ReportsProductsV2";
import ReportsInventoryV2 from "@/pages/ReportsInventoryV2";
import ReportsInventoryTransfersV2 from "@/pages/ReportsInventoryTransfersV2";
import ReportsShiftsV2 from "@/pages/ReportsShiftsV2";
import ReportsOnlineV2 from "@/pages/ReportsOnlineV2";
import ReportsCustomersV2 from "@/pages/ReportsCustomersV2";
import ReportsCostsV2 from "@/pages/ReportsCostsV2";
import ReportsInsightsV2 from "@/pages/ReportsInsightsV2";
import ReportsExportV2 from "@/pages/ReportsExportV2";
import NotFound from "@/pages/NotFound";
import POSPro from "@/pages/POSPro";
import PosShiftGatePro from "@/components/POS/PosShiftGatePro";
import PosRuntimeGuard from "@/components/POS/PosRuntimeGuard";
import PosWorkspaceRecoveryGate from "@/components/POS/PosWorkspaceRecoveryGate";
import PosRecentSales from "@/components/POS/PosRecentSales";
import POSCustomerLoyaltyBridge from "@/components/POS/POSCustomerLoyaltyBridge";
import CustomerManagementDock from "@/components/customers/CustomerManagementDock";
import CustomerInsightsDock from "@/components/customers/CustomerInsightsDock";
import CustomerOpportunityDock from "@/components/customers/CustomerOpportunityDock";
import CustomerOperationsCenterDock from "@/components/customers/CustomerOperationsCenterDock";
import CustomerFollowupPerformanceDock from "@/components/customers/CustomerFollowupPerformanceDock";
import CustomerTeamWorkloadDock from "@/components/customers/CustomerTeamWorkloadDock";
import CustomerMyTasksDock from "@/components/customers/CustomerMyTasksDock";
import HrTaskExecutionDock from "@/components/hr/HrTaskExecutionDock";
import AttendanceApprovedLeaveBanner from "@/components/hr/AttendanceApprovedLeaveBanner";
import ProtectedRoute from "@/components/Auth/ProtectedRoute";
import Categories from "@/pages/Categories";
import CategoriesPage from "@/pages/CategoriesPage";
import AddProduct from "@/pages/AddProduct";
import ProductManagement from "@/pages/ProductManagement";
import InventoryManagement from "@/pages/InventoryManagement";
import InventoryTransfersV2 from "@/pages/InventoryTransfersV2";
import SupplierPurchases from "@/pages/SupplierPurchases";
import Companies from "@/pages/Companies";
import CompanyDetails from "@/pages/CompanyDetails";
import Purchases from "@/pages/Purchases";
import Invoices from "@/pages/Invoices";
import Finance from "@/pages/Finance";
import PaymentMethods from "@/pages/PaymentMethods";
import ExpenseManagement from "@/pages/ExpenseManagement";
import Settings from "@/pages/Settings";
import OnlineOrders from "@/pages/OnlineOrders";
import OrderDetails from "@/pages/OrderDetails";
import CustomersAdvanced from "@/pages/CustomersAdvanced";
import CustomerMyTasksPage from "@/pages/CustomerMyTasksPage";
import OperationsTasksPage from "@/pages/OperationsTasksPage";
import ApprovalsCenterPage from "@/pages/ApprovalsCenterPage";
import NotificationsCenterV2 from "@/pages/NotificationsCenterV2";
import Suppliers from "@/pages/Suppliers";
import EmployeeManagement from "@/pages/EmployeeManagement";
import Employee360Page from "@/pages/Employee360Page";
import EmployeeDevicesPage from "@/pages/EmployeeDevicesPage";
import StaffDeviceActivationPage from "@/pages/StaffDeviceActivationPage";
import AttendancePage from "@/pages/AttendancePage";
import MyHRPortalPage from "@/pages/MyHRPortalPage";
import HrLeaveCalendarPage from "@/pages/HrLeaveCalendarPage";
import HrPayrollPage from "@/pages/HrPayrollPage";
import HrShiftSchedulingPage from "@/pages/HrShiftSchedulingPage";
import OrganizationStructurePage from "@/pages/OrganizationStructurePage";
import CashTracking from "@/pages/CashTracking";
import Banners from "@/pages/Banners";
import AddBanner from "@/pages/AddBanner";
import Barcode from "@/pages/Barcode";
import DeliveryLocationsPage from "@/pages/DeliveryLocationsPage";
import DeliveryLocations from "@/pages/DeliveryLocations";
import BranchDeliveryZones from "@/pages/BranchDeliveryZones";
import OffersPage from "@/pages/OffersPage";
import ProductCollections from "@/pages/ProductCollections";
import CreateProductCollection from "@/pages/CreateProductCollection";
import EditProductCollection from "@/pages/EditProductCollection";
import Returns from "@/pages/Returns";
import Customer360Profile from "@/pages/Customer360Profile";
import DailyInventoryPage from "@/pages/DailyInventoryPage";
import ExpiryManagement from "@/pages/ExpiryManagement";
import ExpensesAndSalaries from "@/pages/ExpensesAndSalaries";
import CustomerCartsPage from "@/pages/CustomerCartsPage";
import SubcategoryDetails from "@/pages/SubcategoryDetails";
import ProductDetails from "@/pages/ProductDetails";
import InventoryImport from "@/pages/InventoryImport";

const CashierPOS = () => (
  <PosShiftGatePro><PosRuntimeGuard><PosWorkspaceRecoveryGate><><POSPro /><POSCustomerLoyaltyBridge /><PosRecentSales /></></PosWorkspaceRecoveryGate></PosRuntimeGuard></PosShiftGatePro>
);
const CustomersWorkspace = () => (<><CustomersAdvanced /><CustomerMyTasksDock /><CustomerTeamWorkloadDock /><CustomerOperationsCenterDock /><CustomerOpportunityDock /></>);
const Customer360Workspace = () => (<><Customer360Profile /><CustomerMyTasksDock /><CustomerFollowupPerformanceDock /><CustomerInsightsDock /><CustomerManagementDock /></>);
const OperationsTasksWorkspace = () => (<><OperationsTasksPage /><HrTaskExecutionDock /></>);
const AttendanceWorkspace = () => (<><AttendancePage /><AttendanceApprovedLeaveBanner /></>);
const ReportsRedirect = () => <Navigate to="/reports" replace />;
const InventoryAuditRedirect = () => <Navigate to="/daily-inventory" replace />;

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/staff-device/activate" element={<StaffDeviceActivationPage />} />
      <Route path="/" element={<ProtectedRoute><CashierPOS /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><ReportsRedirect /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><ReportsV2 /></ProtectedRoute>} />
      <Route path="/reports/sales" element={<ProtectedRoute><ReportsSalesV2 /></ProtectedRoute>} />
      <Route path="/reports/profitability" element={<ProtectedRoute><ReportsProfitabilityV2 /></ProtectedRoute>} />
      <Route path="/reports/payments" element={<ProtectedRoute><ReportsPaymentsV2 /></ProtectedRoute>} />
      <Route path="/reports/returns" element={<ProtectedRoute><ReportsReturnsV2 /></ProtectedRoute>} />
      <Route path="/reports/products" element={<ProtectedRoute><ReportsProductsV2 /></ProtectedRoute>} />
      <Route path="/reports/inventory" element={<ProtectedRoute><ReportsInventoryV2 /></ProtectedRoute>} />
      <Route path="/reports/inventory-transfers" element={<ProtectedRoute><ReportsInventoryTransfersV2 /></ProtectedRoute>} />
      <Route path="/reports/shifts" element={<ProtectedRoute><ReportsShiftsV2 /></ProtectedRoute>} />
      <Route path="/reports/online" element={<ProtectedRoute><ReportsOnlineV2 /></ProtectedRoute>} />
      <Route path="/reports/customers" element={<ProtectedRoute><ReportsCustomersV2 /></ProtectedRoute>} />
      <Route path="/reports/costs" element={<ProtectedRoute><ReportsCostsV2 /></ProtectedRoute>} />
      <Route path="/reports/insights" element={<ProtectedRoute><ReportsInsightsV2 /></ProtectedRoute>} />
      <Route path="/reports/export" element={<ProtectedRoute><ReportsExportV2 /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><ReportsRedirect /></ProtectedRoute>} />
      <Route path="/ai-insights" element={<ProtectedRoute><ReportsInsightsV2 /></ProtectedRoute>} />
      <Route path="/sales-dashboard" element={<ProtectedRoute><ReportsRedirect /></ProtectedRoute>} />
      <Route path="/pos" element={<ProtectedRoute><CashierPOS /></ProtectedRoute>} />
      <Route path="/my-hr" element={<ProtectedRoute><MyHRPortalPage /></ProtectedRoute>} />
      <Route path="/attendance" element={<ProtectedRoute><AttendanceWorkspace /></ProtectedRoute>} />
      <Route path="/hr/leave-calendar" element={<ProtectedRoute><HrLeaveCalendarPage /></ProtectedRoute>} />
      <Route path="/hr/payroll" element={<ProtectedRoute><HrPayrollPage /></ProtectedRoute>} />
      <Route path="/hr/shifts" element={<ProtectedRoute><HrShiftSchedulingPage /></ProtectedRoute>} />
      <Route path="/tasks" element={<ProtectedRoute><OperationsTasksWorkspace /></ProtectedRoute>} />
      <Route path="/approvals" element={<ProtectedRoute><ApprovalsCenterPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsCenterV2 /></ProtectedRoute>} />
      <Route path="/categories" element={<ProtectedRoute><Categories /></ProtectedRoute>} />
      <Route path="/categories/:id" element={<ProtectedRoute><CategoriesPage /></ProtectedRoute>} />
      <Route path="/categories/:id/:subId" element={<ProtectedRoute><CategoriesPage /></ProtectedRoute>} />
      <Route path="/subcategory/:id" element={<ProtectedRoute><SubcategoryDetails /></ProtectedRoute>} />
      <Route path="/subsubcategories/:id" element={<ProtectedRoute><CategoriesPage /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute><ProductManagement /></ProtectedRoute>} />
      <Route path="/product-details/:id" element={<ProtectedRoute><ProductDetails /></ProtectedRoute>} />
      <Route path="/products/add" element={<ProtectedRoute><AddProduct /></ProtectedRoute>} />
      <Route path="/products/edit/:id" element={<ProtectedRoute><AddProduct /></ProtectedRoute>} />
      <Route path="/add-product" element={<ProtectedRoute><AddProduct /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute><InventoryManagement /></ProtectedRoute>} />
      <Route path="/inventory-transfers" element={<ProtectedRoute><InventoryTransfersV2 /></ProtectedRoute>} />
      <Route path="/daily-inventory" element={<ProtectedRoute><DailyInventoryPage /></ProtectedRoute>} />
      <Route path="/inventory-full" element={<ProtectedRoute><InventoryAuditRedirect /></ProtectedRoute>} />
      <Route path="/inventory-history" element={<ProtectedRoute><InventoryAuditRedirect /></ProtectedRoute>} />
      <Route path="/inventory-import" element={<ProtectedRoute><InventoryImport /></ProtectedRoute>} />
      <Route path="/expiry-management" element={<ProtectedRoute><ExpiryManagement /></ProtectedRoute>} />
      <Route path="/supplier-purchases" element={<ProtectedRoute><SupplierPurchases /></ProtectedRoute>} />
      <Route path="/companies" element={<ProtectedRoute><Companies /></ProtectedRoute>} />
      <Route path="/companies/:id" element={<ProtectedRoute><CompanyDetails /></ProtectedRoute>} />
      <Route path="/company/:id" element={<ProtectedRoute><CompanyDetails /></ProtectedRoute>} />
      <Route path="/purchases/:id" element={<ProtectedRoute><Purchases /></ProtectedRoute>} />
      <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
      <Route path="/finance" element={<ProtectedRoute><Finance /></ProtectedRoute>} />
      <Route path="/payment-methods" element={<ProtectedRoute><PaymentMethods /></ProtectedRoute>} />
      <Route path="/expenses" element={<ProtectedRoute><ExpenseManagement /></ProtectedRoute>} />
      <Route path="/expenses-salaries" element={<ProtectedRoute><ExpensesAndSalaries /></ProtectedRoute>} />
      <Route path="/returns" element={<ProtectedRoute><Returns /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/online-orders" element={<ProtectedRoute><OnlineOrders /></ProtectedRoute>} />
      <Route path="/online-orders/:id" element={<ProtectedRoute><OrderDetails /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><CustomersWorkspace /></ProtectedRoute>} />
      <Route path="/customer-tasks" element={<ProtectedRoute><CustomerMyTasksPage /></ProtectedRoute>} />
      <Route path="/customers/:customerId" element={<ProtectedRoute><Customer360Workspace /></ProtectedRoute>} />
      <Route path="/suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
      <Route path="/customer-carts" element={<ProtectedRoute><CustomerCartsPage /></ProtectedRoute>} />
      <Route path="/employees" element={<ProtectedRoute><EmployeeManagement /></ProtectedRoute>} />
      <Route path="/employees/:employeeId" element={<ProtectedRoute><Employee360Page /></ProtectedRoute>} />
      <Route path="/employees/:employeeId/devices" element={<ProtectedRoute><EmployeeDevicesPage /></ProtectedRoute>} />
      <Route path="/organization" element={<ProtectedRoute><OrganizationStructurePage /></ProtectedRoute>} />
      <Route path="/cash-tracking" element={<ProtectedRoute><CashTracking /></ProtectedRoute>} />
      <Route path="/banners" element={<ProtectedRoute><Banners /></ProtectedRoute>} />
      <Route path="/banners/add" element={<ProtectedRoute><AddBanner /></ProtectedRoute>} />
      <Route path="/banners/edit" element={<ProtectedRoute><AddBanner /></ProtectedRoute>} />
      <Route path="/delivery-locations" element={<ProtectedRoute><DeliveryLocationsPage /></ProtectedRoute>} />
      <Route path="/delivery-locations/:id" element={<ProtectedRoute><DeliveryLocations /></ProtectedRoute>} />
      <Route path="/branch-delivery-zones" element={<ProtectedRoute><BranchDeliveryZones /></ProtectedRoute>} />
      <Route path="/offers" element={<ProtectedRoute><OffersPage /></ProtectedRoute>} />
      <Route path="/product-collections" element={<ProtectedRoute><ProductCollections /></ProtectedRoute>} />
      <Route path="/product-collections/create" element={<ProtectedRoute><CreateProductCollection /></ProtectedRoute>} />
      <Route path="/product-collections/edit/:id" element={<ProtectedRoute><EditProductCollection /></ProtectedRoute>} />
      <Route path="/barcode" element={<ProtectedRoute><Barcode /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
