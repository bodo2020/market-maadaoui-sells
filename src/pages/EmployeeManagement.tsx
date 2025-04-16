
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Search, 
  Plus, 
  Pencil, 
  Trash2, 
  MoreHorizontal,
  Users,
  UserPlus,
  Clock,
  AlarmClockCheck,
  Loader2
} from "lucide-react";
import { 
  fetchUsers, 
  createUser, 
  updateUser, 
  deleteUser, 
  startShift, 
  endShift, 
  getActiveShift 
} from "@/services/supabase/userService";
import { User, UserRole, Shift } from "@/types";

export default function EmployeeManagement() {
  const [search, setSearch] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isShiftDialogOpen, setIsShiftDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    role: "",
    phone: "",
    password: "",
    email: "",
    username: "",
    active: true
  });
  
  const queryClient = useQueryClient();
  
  // Fetch users/employees
  const { data: employees, isLoading, error } = useQuery({
    queryKey: ['employees'],
    queryFn: fetchUsers
  });
  
  // Create user mutation
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
  
  // Update user mutation
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
  
  // Delete user mutation
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
  
  // Start shift mutation
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
  
  // End shift mutation
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
      active: true
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
      [field]: value
    });
  };
  
  const handleAddEmployee = () => {
    if (!formData.name || !formData.role || !formData.phone || !formData.password) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    
    // Use phone as username if not provided
    const username = formData.username || formData.phone;
    
    createUserMutation.mutate({
      name: formData.name,
      role: formData.role as UserRole,
      phone: formData.phone,
      password: formData.password,
      email: formData.email,
      username: username,
      active: formData.active
    });
  };
  
  const handleEditEmployee = () => {
    if (!selectedEmployee) return;
    
    updateUserMutation.mutate({
      id: selectedEmployee.id,
      user: {
        name: formData.name,
        role: formData.role as UserRole,
        phone: formData.phone,
        email: formData.email,
        username: formData.username,
        active: formData.active,
        // Only update password if a new one is provided
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
      password: "", // Don't show the password
      email: employee.email || "",
      username: employee.username,
      active: employee.active !== false // Default to true if not specified
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
  
  // Filtering employees based on search
  const filteredEmployees = employees ? employees.filter(employee => 
    employee.name.toLowerCase().includes(search.toLowerCase()) || 
    (employee.phone && employee.phone.includes(search))
  ) : [];
  
  // Check if employee has active shift
  const hasActiveShift = (employee: User) => {
    if (!employee.shifts) return false;
    return employee.shifts.some(shift => !shift.end_time);
  };
  
  // Get active shift ID
  const getActiveShiftId = (employee: User) => {
    if (!employee.shifts) return null;
    const activeShift = employee.shifts.find(shift => !shift.end_time);
    return activeShift ? activeShift.id : null;
  };
  
  // Get total hours worked
  const getTotalHoursWorked = (employee: User) => {
    if (!employee.shifts) return 0;
    
    return employee.shifts.reduce((total, shift) => {
      if (shift.total_hours) {
        return total + shift.total_hours;
      }
      return total;
    }, 0);
  };
  
  // Get employees currently on shift
  const getEmployeesOnShift = () => {
    if (!employees) return 0;
    return employees.filter(employee => hasActiveShift(employee)).length;
  };
  
  // Get total hours for all employees
  const getTotalHours = () => {
    if (!employees) return 0;
    return employees.reduce((total, employee) => total + getTotalHoursWorked(employee), 0);
  };
  
  // Get average hours per employee
  const getAverageHours = () => {
    if (!employees || employees.length === 0) return 0;
    return getTotalHours() / employees.length;
  };
  
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">إدارة الموظفين</h1>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <UserPlus className="ml-2 h-4 w-4" />
          إضافة موظف جديد
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الموظفين</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-6 w-12 bg-muted animate-pulse rounded"></div>
            ) : (
              <div className="text-2xl font-bold">{employees?.length || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">موظف مسجل</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">موظفون في وردية</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-6 w-12 bg-muted animate-pulse rounded"></div>
            ) : (
              <div className="text-2xl font-bold">{getEmployeesOnShift()}</div>
            )}
            <p className="text-xs text-muted-foreground">موظف حالياً في وردية</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي ساعات العمل</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-6 w-16 bg-muted animate-pulse rounded"></div>
            ) : (
              <div className="text-2xl font-bold">{getTotalHours().toFixed(1)}</div>
            )}
            <p className="text-xs text-muted-foreground">ساعة عمل هذا الشهر</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">متوسط ساعات العمل</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-6 w-16 bg-muted animate-pulse rounded"></div>
            ) : (
              <div className="text-2xl font-bold">{getAverageHours().toFixed(1)}</div>
            )}
            <p className="text-xs text-muted-foreground">ساعة لكل موظف</p>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>قائمة الموظفين</CardTitle>
              <CardDescription>إدارة الموظفين والورديات</CardDescription>
            </div>
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6">
            <Input 
              placeholder="ابحث بالاسم أو رقم الهاتف" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Button variant="outline">
              <Search className="ml-2 h-4 w-4" />
              بحث
            </Button>
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>الدور</TableHead>
                  <TableHead>رقم الهاتف</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>ساعات العمل</TableHead>
                  <TableHead>الوردية</TableHead>
                  <TableHead className="text-left">خيارات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(5).fill(0).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded"></div></TableCell>
                      <TableCell><div className="h-4 w-16 bg-muted animate-pulse rounded"></div></TableCell>
                      <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded"></div></TableCell>
                      <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded"></div></TableCell>
                      <TableCell><div className="h-4 w-16 bg-muted animate-pulse rounded"></div></TableCell>
                      <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded"></div></TableCell>
                      <TableCell><div className="h-4 w-8 bg-muted animate-pulse rounded"></div></TableCell>
                    </TableRow>
                  ))
                ) : filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      لم يتم العثور على موظفين مطابقين
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEmployees.map(employee => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">{employee.name}</TableCell>
                      <TableCell>
                        {employee.role === UserRole.ADMIN && "مدير"}
                        {employee.role === UserRole.CASHIER && "كاشير"}
                        {employee.role === UserRole.EMPLOYEE && "موظف"}
                        {employee.role === UserRole.DELIVERY && "مندوب توصيل"}
                      </TableCell>
                      <TableCell>{employee.phone || "-"}</TableCell>
                      <TableCell>
                        {hasActiveShift(employee) ? (
                          <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">في وردية</span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800">خارج الوردية</span>
                        )}
                      </TableCell>
                      <TableCell>{getTotalHoursWorked(employee).toFixed(1)} ساعة</TableCell>
                      <TableCell>
                        {startShiftMutation.isPending || endShiftMutation.isPending ? (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            disabled
                          >
                            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                            جارِ المعالجة...
                          </Button>
                        ) : hasActiveShift(employee) ? (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-red-500 border-red-200 hover:bg-red-50"
                            onClick={() => {
                              const shiftId = getActiveShiftId(employee);
                              if (shiftId) handleEndShift(shiftId);
                            }}
                          >
                            <Clock className="ml-2 h-4 w-4" />
                            إنهاء الوردية
                          </Button>
                        ) : (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-green-500 border-green-200 hover:bg-green-50"
                            onClick={() => handleStartShift(employee.id)}
                          >
                            <AlarmClockCheck className="ml-2 h-4 w-4" />
                            بدء وردية
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>خيارات</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleEditClick(employee)}>
                              <Pencil className="ml-2 h-4 w-4" />
                              تعديل
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleShiftClick(employee)}
                            >
                              <Clock className="ml-2 h-4 w-4" />
                              سجل الورديات
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => handleDeleteClick(employee)}
                            >
                              <Trash2 className="ml-2 h-4 w-4" />
                              حذف
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {/* Add Employee Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>إضافة موظف جديد</DialogTitle>
            <DialogDescription>
              أدخل بيانات الموظف الجديد. اضغط حفظ عند الانتهاء.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">اسم الموظف</Label>
                <Input 
                  id="name" 
                  placeholder="الاسم الكامل" 
                  value={formData.name}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">رقم الهاتف</Label>
                <Input 
                  id="phone" 
                  placeholder="01xxxxxxxxx" 
                  value={formData.phone}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role">الدور الوظيفي</Label>
                <Select onValueChange={(value) => handleSelectChange(value, "role")}>
                  <SelectTrigger id="role">
                    <SelectValue placeholder="اختر الدور" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UserRole.ADMIN}>مدير</SelectItem>
                    <SelectItem value={UserRole.CASHIER}>كاشير</SelectItem>
                    <SelectItem value={UserRole.EMPLOYEE}>موظف</SelectItem>
                    <SelectItem value={UserRole.DELIVERY}>مندوب توصيل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="كلمة المرور" 
                  value={formData.password}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">اسم المستخدم (اختياري)</Label>
                <Input 
                  id="username" 
                  placeholder="اسم المستخدم" 
                  value={formData.username}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني (اختياري)</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="البريد الإلكتروني" 
                  value={formData.email}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              type="submit" 
              onClick={handleAddEmployee}
              disabled={createUserMutation.isPending}
            >
              {createUserMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جارِ الحفظ...
                </>
              ) : "حفظ الموظف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Employee Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>تعديل بيانات الموظف</DialogTitle>
            <DialogDescription>
              قم بتعديل بيانات الموظف. اضغط حفظ عند الانتهاء.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">اسم الموظف</Label>
                <Input 
                  id="name" 
                  placeholder="الاسم الكامل" 
                  value={formData.name}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">رقم الهاتف</Label>
                <Input 
                  id="phone" 
                  placeholder="01xxxxxxxxx" 
                  value={formData.phone}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role">الدور الوظيفي</Label>
                <Select 
                  defaultValue={formData.role}
                  onValueChange={(value) => handleSelectChange(value, "role")}
                >
                  <SelectTrigger id="role">
                    <SelectValue placeholder="اختر الدور" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UserRole.ADMIN}>مدير</SelectItem>
                    <SelectItem value={UserRole.CASHIER}>كاشير</SelectItem>
                    <SelectItem value={UserRole.EMPLOYEE}>موظف</SelectItem>
                    <SelectItem value={UserRole.DELIVERY}>مندوب توصيل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور (اترك فارغاً للإبقاء على القديمة)</Label>
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="كلمة المرور" 
                  value={formData.password}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">اسم المستخدم</Label>
                <Input 
                  id="username" 
                  placeholder="اسم المستخدم" 
                  value={formData.username}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني (اختياري)</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="البريد الإلكتروني" 
                  value={formData.email}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              type="submit" 
              onClick={handleEditEmployee}
              disabled={updateUserMutation.isPending}
            >
              {updateUserMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جارِ التحديث...
                </>
              ) : "حفظ التغييرات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Employee Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>حذف الموظف</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من رغبتك في حذف هذا الموظف؟ سيتم حذف جميع بيانات الورديات المرتبطة به. هذا الإجراء لا يمكن التراجع عنه.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteEmployee}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جارِ الحذف...
                </>
              ) : "حذف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Employee Shifts Dialog */}
      <Dialog open={isShiftDialogOpen} onOpenChange={setIsShiftDialogOpen}>
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle>سجل الورديات - {selectedEmployee?.name}</DialogTitle>
            <DialogDescription>
              عرض سجل الورديات للموظف
            </DialogDescription>
          </DialogHeader>
          {selectedEmployee && (
            <div className="py-4">
              {!selectedEmployee.shifts || selectedEmployee.shifts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  لا يوجد ورديات مسجلة لهذا الموظف
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>رقم الوردية</TableHead>
                        <TableHead>وقت البدء</TableHead>
                        <TableHead>وقت الانتهاء</TableHead>
                        <TableHead>عدد الساعات</TableHead>
                        <TableHead>الحالة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedEmployee.shifts
                        .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
                        .map((shift, index) => (
                        <TableRow key={shift.id}>
                          <TableCell>#{index + 1}</TableCell>
                          <TableCell>
                            {new Date(shift.start_time).toLocaleTimeString('ar-EG', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: '2-digit',
                              month: '2-digit'
                            })}
                          </TableCell>
                          <TableCell>
                            {shift.end_time ? new Date(shift.end_time).toLocaleTimeString('ar-EG', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: '2-digit',
                              month: '2-digit'
                            }) : '-'}
                          </TableCell>
                          <TableCell>
                            {shift.total_hours ? shift.total_hours.toFixed(1) : '-'}
                          </TableCell>
                          <TableCell>
                            {shift.end_time ? (
                              <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                                مكتملة
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                                جارية
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
