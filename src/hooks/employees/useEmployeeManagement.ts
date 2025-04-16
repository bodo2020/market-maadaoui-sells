
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { User } from "@/types";
import {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  startShift,
  endShift,
  exportEmployeesToExcel
} from "@/services/supabase/userService";

export function useEmployeeManagement() {
  const [search, setSearch] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isShiftDialogOpen, setIsShiftDialogOpen] = useState(false);
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  const [filterRole, setFilterRole] = useState<string | null>(null);
  const [filterActive, setFilterActive] = useState<boolean | null>(null);
  const [filterShift, setFilterShift] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    role: "",
    phone: "",
    password: "",
    email: "",
    username: "",
    active: true,
    salary: 0,
    salary_type: "monthly"
  });

  const queryClient = useQueryClient();

  const { data: employees, isLoading, error } = useQuery({
    queryKey: ['employees'],
    queryFn: fetchUsers
  });

  const createUserMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success("تم إضافة الموظف بنجاح");
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("حدث خطأ أثناء إضافة الموظف");
      console.error("Error creating employee:", error);
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, user }: { id: string; user: Partial<User> }) =>
      updateUser(id, user),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success("تم تحديث بيانات الموظف بنجاح");
      setIsEditDialogOpen(false);
      setSelectedEmployee(null);
    },
    onError: (error) => {
      toast.error("حدث خطأ أثناء تحديث بيانات الموظف");
      console.error("Error updating employee:", error);
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success("تم حذف الموظف بنجاح");
      setIsDeleteDialogOpen(false);
      setSelectedEmployee(null);
    },
    onError: (error) => {
      toast.error("حدث خطأ أثناء حذف الموظف");
      console.error("Error deleting employee:", error);
    }
  });

  const startShiftMutation = useMutation({
    mutationFn: startShift,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success("تم بدء الوردية بنجاح");
    },
    onError: (error) => {
      toast.error("حدث خطأ أثناء بدء الوردية");
      console.error("Error starting shift:", error);
    }
  });

  const endShiftMutation = useMutation({
    mutationFn: endShift,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success("تم إنهاء الوردية بنجاح");
    },
    onError: (error) => {
      toast.error("حدث خطأ أثناء إنهاء الوردية");
      console.error("Error ending shift:", error);
    }
  });

  const resetForm = () => {
    setFormData({
      name: "",
      role: "",
      phone: "",
      password: "",
      email: "",
      username: "",
      active: true,
      salary: 0,
      salary_type: "monthly"
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData({
      ...formData,
      [id]: value
    });
  };

  const handleSelectChange = (value: string, field: string) => {
    setFormData({
      ...formData,
      [field]: field === "salary" ? Number(value) : value
    });
  };

  const handleAddEmployee = () => {
    if (!formData.name || !formData.role || !formData.phone || !formData.password) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    const username = formData.username || formData.phone;

    createUserMutation.mutate({
      name: formData.name,
      role: formData.role as any,
      phone: formData.phone,
      password: formData.password,
      email: formData.email,
      username: username,
      active: formData.active,
      salary: formData.salary,
      salary_type: formData.salary_type
    });
  };

  const handleEditEmployee = () => {
    if (!selectedEmployee) return;

    updateUserMutation.mutate({
      id: selectedEmployee.id,
      user: {
        name: formData.name,
        role: formData.role as any,
        phone: formData.phone,
        email: formData.email,
        username: formData.username,
        active: formData.active,
        salary: formData.salary,
        salary_type: formData.salary_type,
        ...(formData.password ? { password: formData.password } : {})
      }
    });
  };

  const handleDeleteEmployee = () => {
    if (!selectedEmployee) return;
    deleteUserMutation.mutate(selectedEmployee.id);
  };

  const handleEditClick = (employee: User) => {
    setSelectedEmployee(employee);
    setFormData({
      name: employee.name,
      role: employee.role,
      phone: employee.phone || "",
      password: "",
      email: employee.email || "",
      username: employee.username,
      active: employee.active !== false,
      salary: employee.salary || 0,
      salary_type: employee.salary_type || "monthly"
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteClick = (employee: User) => {
    setSelectedEmployee(employee);
    setIsDeleteDialogOpen(true);
  };

  const handleShiftClick = (employee: User) => {
    setSelectedEmployee(employee);
    setIsShiftDialogOpen(true);
  };

  const handleStartShift = (employeeId: string) => {
    startShiftMutation.mutate(employeeId);
  };

  const handleEndShift = (shiftId: string) => {
    endShiftMutation.mutate(shiftId);
  };

  const hasActiveShift = (employee: User) => {
    if (!employee.shifts) return false;
    return employee.shifts.some(shift => !shift.end_time);
  };

  const getActiveShiftId = (employee: User) => {
    if (!employee.shifts) return null;
    const activeShift = employee.shifts.find(shift => !shift.end_time);
    return activeShift ? activeShift.id : null;
  };

  const getTotalHoursWorked = (employee: User) => {
    if (!employee.shifts) return 0;

    return employee.shifts.reduce((total, shift) => {
      if (shift.total_hours) {
        return total + shift.total_hours;
      }
      return total;
    }, 0);
  };

  const getEmployeesOnShift = () => {
    if (!employees) return 0;
    return employees.filter(employee => hasActiveShift(employee)).length;
  };

  const getTotalHours = () => {
    if (!employees) return 0;
    return employees.reduce((total, employee) => total + getTotalHoursWorked(employee), 0);
  };

  const getAverageHours = () => {
    if (!employees || employees.length === 0) return 0;
    return getTotalHours() / employees.length;
  };

  const handleExportEmployees = async () => {
    try {
      await exportEmployeesToExcel();
      toast.success("تم تصدير بيانات الموظفين بنجاح");
    } catch (error) {
      console.error("Error exporting employees:", error);
      toast.error("حدث خطأ أثناء تصدير بيانات الموظفين");
    }
  };

  const applyFilters = () => {
    setIsFilterDialogOpen(false);
  };

  const resetFilters = () => {
    setFilterRole(null);
    setFilterActive(null);
    setFilterShift(null);
  };

  const filteredEmployees = employees ? employees.filter(employee => {
    const textMatch = employee.name.toLowerCase().includes(search.toLowerCase()) ||
      (employee.phone && employee.phone.includes(search));

    const roleMatch = !filterRole || employee.role === filterRole;

    const activeMatch = filterActive === null || employee.active === filterActive;

    const shiftMatch = filterShift === null ||
      (filterShift === 'active' && hasActiveShift(employee)) ||
      (filterShift === 'inactive' && !hasActiveShift(employee));

    return textMatch && roleMatch && activeMatch && shiftMatch;
  }) : [];

  return {
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
  };
}
