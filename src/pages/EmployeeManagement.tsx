
import { useState } from "react";
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
  AlarmClockCheck
} from "lucide-react";
import { users } from "@/data/mockData";
import { User, UserRole, Shift } from "@/types";

export default function EmployeeManagement() {
  const [employees, setEmployees] = useState<User[]>(users);
  const [search, setSearch] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isShiftDialogOpen, setIsShiftDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  
  // Filtering employees based on search
  const filteredEmployees = employees.filter(employee => 
    employee.name.includes(search) || 
    employee.phone.includes(search)
  );
  
  // Start shift for an employee
  const startShift = (employeeId: string) => {
    setEmployees(employees.map(employee => {
      if (employee.id === employeeId) {
        const newShift: Shift = {
          id: Date.now().toString(),
          employeeId,
          startTime: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        };
        return {
          ...employee,
          shifts: [...employee.shifts, newShift]
        };
      }
      return employee;
    }));
  };
  
  // End shift for an employee
  const endShift = (employeeId: string) => {
    setEmployees(employees.map(employee => {
      if (employee.id === employeeId) {
        const shifts = [...employee.shifts];
        const activeShiftIndex = shifts.findIndex(shift => !shift.endTime);
        
        if (activeShiftIndex !== -1) {
          const now = new Date();
          const startTime = shifts[activeShiftIndex].startTime;
          const hoursWorked = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);
          
          shifts[activeShiftIndex] = {
            ...shifts[activeShiftIndex],
            endTime: now,
            totalHours: hoursWorked,
            updatedAt: now
          };
        }
        
        return {
          ...employee,
          shifts
        };
      }
      return employee;
    }));
  };
  
  // Check if employee has active shift
  const hasActiveShift = (employeeId: string) => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return false;
    return employee.shifts.some(shift => !shift.endTime);
  };
  
  // Get total hours worked
  const getTotalHoursWorked = (employeeId: string) => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return 0;
    
    return employee.shifts.reduce((total, shift) => {
      if (shift.totalHours) {
        return total + shift.totalHours;
      }
      return total;
    }, 0);
  };
  
  // Functions to handle adding a new employee
  const handleAddEmployee = () => {
    // In a real app, this would validate and add the employee to the database
    setIsAddDialogOpen(false);
  };
  
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
            <div className="text-2xl font-bold">{employees.length}</div>
            <p className="text-xs text-muted-foreground">موظف مسجل</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">موظفون في وردية</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {employees.filter(employee => hasActiveShift(employee.id)).length}
            </div>
            <p className="text-xs text-muted-foreground">موظف حالياً في وردية</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي ساعات العمل</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {employees.reduce((total, employee) => total + getTotalHoursWorked(employee.id), 0).toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">ساعة عمل هذا الشهر</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">متوسط ساعات العمل</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(employees.reduce((total, employee) => total + getTotalHoursWorked(employee.id), 0) / Math.max(1, employees.length)).toFixed(1)}
            </div>
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
                {filteredEmployees.map(employee => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">{employee.name}</TableCell>
                    <TableCell>
                      {employee.role === UserRole.ADMIN && "مدير"}
                      {employee.role === UserRole.CASHIER && "كاشير"}
                      {employee.role === UserRole.EMPLOYEE && "موظف"}
                      {employee.role === UserRole.DELIVERY && "مندوب توصيل"}
                    </TableCell>
                    <TableCell>{employee.phone}</TableCell>
                    <TableCell>
                      {hasActiveShift(employee.id) ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">في وردية</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800">خارج الوردية</span>
                      )}
                    </TableCell>
                    <TableCell>{getTotalHoursWorked(employee.id).toFixed(1)} ساعة</TableCell>
                    <TableCell>
                      {hasActiveShift(employee.id) ? (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-red-500 border-red-200 hover:bg-red-50"
                          onClick={() => endShift(employee.id)}
                        >
                          <Clock className="ml-2 h-4 w-4" />
                          إنهاء الوردية
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-green-500 border-green-200 hover:bg-green-50"
                          onClick={() => startShift(employee.id)}
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
                          <DropdownMenuItem>
                            <Pencil className="ml-2 h-4 w-4" />
                            تعديل
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => {
                              setSelectedEmployee(employee);
                              setIsShiftDialogOpen(true);
                            }}
                          >
                            <Clock className="ml-2 h-4 w-4" />
                            سجل الورديات
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="ml-2 h-4 w-4" />
                            حذف
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
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
                <Input id="name" placeholder="الاسم الكامل" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">رقم الهاتف</Label>
                <Input id="phone" placeholder="01xxxxxxxxx" />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role">الدور الوظيفي</Label>
                <Select>
                  <SelectTrigger>
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
                <Input id="password" type="password" placeholder="كلمة المرور" />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="address">العنوان</Label>
              <Input id="address" placeholder="العنوان" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" onClick={handleAddEmployee}>حفظ الموظف</Button>
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
              {selectedEmployee.shifts.length === 0 ? (
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
                      {selectedEmployee.shifts.map((shift, index) => (
                        <TableRow key={shift.id}>
                          <TableCell>#{index + 1}</TableCell>
                          <TableCell>
                            {shift.startTime.toLocaleTimeString('ar-EG', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: '2-digit',
                              month: '2-digit'
                            })}
                          </TableCell>
                          <TableCell>
                            {shift.endTime ? shift.endTime.toLocaleTimeString('ar-EG', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: '2-digit',
                              month: '2-digit'
                            }) : '-'}
                          </TableCell>
                          <TableCell>
                            {shift.totalHours ? shift.totalHours.toFixed(1) : '-'}
                          </TableCell>
                          <TableCell>
                            {shift.endTime ? (
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
