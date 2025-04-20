
import React from 'react';
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { useEmployeeManagement } from '@/hooks/employees/useEmployeeManagement';

// Import the refactored components
import { EmployeeActions } from '@/components/employees/EmployeeActions';
import { EmployeeStats } from '@/components/employees/EmployeeStats';
import { EmployeeTableContainer } from '@/components/employees/EmployeeTableContainer';
import { EmployeeFilters } from '@/components/employees/EmployeeFilters';
import { EmployeeFormDialog } from '@/components/employees/EmployeeFormDialog';
import { DeleteEmployeeDialog } from '@/components/employees/DeleteEmployeeDialog';
import { ShiftHistoryDialog } from '@/components/employees/ShiftHistoryDialog';

export default function EmployeeManagement() {
  const {
    search,
    setSearch,
    isAddDialogOpen,
    setIsAddDialogOpen,
    isEditDialogOpen,
    setIsEditDialogOpen,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    isShiftDialogOpen,
    setIsShiftDialogOpen,
    isFilterDialogOpen,
    setIsFilterDialogOpen,
    selectedEmployee,
    filterRole,
    setFilterRole,
    filterActive,
    setFilterActive,
    filterShift,
    setFilterShift,
    formData,
    employees,
    isLoading,
    error,
    createUserMutation,
    updateUserMutation,
    deleteUserMutation,
    startShiftMutation,
    endShiftMutation,
    handleInputChange,
    handleSelectChange,
    handleAddEmployee,
    handleEditEmployee,
    handleDeleteEmployee,
    handleEditClick,
    handleDeleteClick,
    handleShiftClick,
    handleStartShift,
    handleEndShift,
    hasActiveShift,
    getActiveShiftId,
    getTotalHoursWorked,
    getEmployeesOnShift,
    getTotalHours,
    getAverageHours,
    handleExportEmployees,
    applyFilters,
    resetFilters,
    filteredEmployees,
    queryClient
  } = useEmployeeManagement();

  if (error) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-64">
          <p className="text-destructive text-lg">حدث خطأ أثناء تحميل البيانات</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['employees'] })}
          >
            إعادة المحاولة
          </Button>
        </div>
      </MainLayout>
    );
  }
  
  return (
    <MainLayout>
      <EmployeeActions 
        onAddClick={() => setIsAddDialogOpen(true)}
        onFilterClick={() => setIsFilterDialogOpen(true)}
        onExportClick={handleExportEmployees}
      />
      
      <EmployeeStats 
        employees={employees}
        isLoading={isLoading}
        getEmployeesOnShift={getEmployeesOnShift}
        getTotalHours={getTotalHours}
        getAverageHours={getAverageHours}
      />
      
      <EmployeeTableContainer
        employees={filteredEmployees}
        isLoading={isLoading}
        search={search}
        setSearch={setSearch}
        startShiftMutation={startShiftMutation}
        endShiftMutation={endShiftMutation}
        onEditClick={handleEditClick}
        onDeleteClick={handleDeleteClick}
        onShiftClick={handleShiftClick}
        hasActiveShift={hasActiveShift}
        getActiveShiftId={getActiveShiftId}
        getTotalHoursWorked={getTotalHoursWorked}
        handleStartShift={handleStartShift}
        handleEndShift={handleEndShift}
      />
      
      <EmployeeFormDialog 
        isOpen={isAddDialogOpen}
        setIsOpen={setIsAddDialogOpen}
        formData={formData}
        handleInputChange={handleInputChange}
        handleSelectChange={handleSelectChange}
        handleSubmit={handleAddEmployee}
        isEdit={false}
        isMutating={createUserMutation.isPending}
      />
      
      <EmployeeFormDialog 
        isOpen={isEditDialogOpen}
        setIsOpen={setIsEditDialogOpen}
        formData={formData}
        handleInputChange={handleInputChange}
        handleSelectChange={handleSelectChange}
        handleSubmit={handleEditEmployee}
        isEdit={true}
        isMutating={updateUserMutation.isPending}
      />
      
      <DeleteEmployeeDialog 
        isOpen={isDeleteDialogOpen}
        setIsOpen={setIsDeleteDialogOpen}
        handleDelete={handleDeleteEmployee}
        isDeleting={deleteUserMutation.isPending}
      />
      
      <ShiftHistoryDialog 
        isOpen={isShiftDialogOpen}
        setIsOpen={setIsShiftDialogOpen}
        employee={selectedEmployee}
      />
      
      <EmployeeFilters 
        isOpen={isFilterDialogOpen}
        setIsOpen={setIsFilterDialogOpen}
        filterRole={filterRole}
        setFilterRole={setFilterRole}
        filterActive={filterActive}
        setFilterActive={setFilterActive}
        filterShift={filterShift}
        setFilterShift={setFilterShift}
        applyFilters={applyFilters}
        resetFilters={resetFilters}
      />
    </MainLayout>
  );
}
