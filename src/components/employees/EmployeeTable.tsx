
import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Clock,
  AlarmClockCheck,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Users
} from "lucide-react";
import { User, UserRole } from "@/types";

type EmployeeTableProps = {
  employees: User[];
  isLoading: boolean;
  search: string;
  startShiftMutation: any;
  endShiftMutation: any;
  onEditClick: (employee: User) => void;
  onDeleteClick: (employee: User) => void;
  onShiftClick: (employee: User) => void;
  hasActiveShift: (employee: User) => boolean;
  getActiveShiftId: (employee: User) => string | null;
  getTotalHoursWorked: (employee: User) => number;
  handleStartShift: (employeeId: string) => void;
  handleEndShift: (shiftId: string) => void;
};

export function EmployeeTable({
  employees,
  isLoading,
  search,
  startShiftMutation,
  endShiftMutation,
  onEditClick,
  onDeleteClick,
  onShiftClick,
  hasActiveShift,
  getActiveShiftId,
  getTotalHoursWorked,
  handleStartShift,
  handleEndShift
}: EmployeeTableProps) {
  return (
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
        ) : employees.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
              لم يتم العثور على موظفين مطابقين
            </TableCell>
          </TableRow>
        ) : (
          employees.map(employee => (
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
                    <DropdownMenuItem onClick={() => onEditClick(employee)}>
                      <Pencil className="ml-2 h-4 w-4" />
                      تعديل
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => onShiftClick(employee)}
                    >
                      <Clock className="ml-2 h-4 w-4" />
                      سجل الورديات
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="text-destructive"
                      onClick={() => onDeleteClick(employee)}
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
  );
}
