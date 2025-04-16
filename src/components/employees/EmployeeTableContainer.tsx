
import React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { EmployeeSearch } from './EmployeeSearch';
import { EmployeeTable } from './EmployeeTable';
import { Users } from 'lucide-react';
import { User } from '@/types';

type EmployeeTableContainerProps = {
  employees: User[];
  isLoading: boolean;
  search: string;
  setSearch: (value: string) => void;
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

export function EmployeeTableContainer({
  employees,
  isLoading,
  search,
  setSearch,
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
}: EmployeeTableContainerProps) {
  return (
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
        <EmployeeSearch search={search} setSearch={setSearch} />
        <div className="rounded-md border">
          <EmployeeTable
            employees={employees}
            isLoading={isLoading}
            search={search}
            startShiftMutation={startShiftMutation}
            endShiftMutation={endShiftMutation}
            onEditClick={onEditClick}
            onDeleteClick={onDeleteClick}
            onShiftClick={onShiftClick}
            hasActiveShift={hasActiveShift}
            getActiveShiftId={getActiveShiftId}
            getTotalHoursWorked={getTotalHoursWorked}
            handleStartShift={handleStartShift}
            handleEndShift={handleEndShift}
          />
        </div>
      </CardContent>
    </Card>
  );
}
