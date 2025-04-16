
import React from 'react';
import { EmployeeCard } from './EmployeeCard';
import { User } from '@/types';

type EmployeeStatsProps = {
  employees: User[] | undefined;
  isLoading: boolean;
  getEmployeesOnShift: () => number;
  getTotalHours: () => number;
  getAverageHours: () => number;
};

export function EmployeeStats({
  employees,
  isLoading,
  getEmployeesOnShift,
  getTotalHours,
  getAverageHours
}: EmployeeStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <EmployeeCard
        title="إجمالي الموظفين"
        value={employees?.length || 0}
        subtitle="موظف مسجل"
        isLoading={isLoading}
      />
      
      <EmployeeCard
        title="موظفون في وردية"
        value={getEmployeesOnShift()}
        subtitle="موظف حالياً في وردية"
        isLoading={isLoading}
      />
      
      <EmployeeCard
        title="إجمالي ساعات العمل"
        value={getTotalHours().toFixed(1)}
        subtitle="ساعة عمل هذا الشهر"
        isLoading={isLoading}
      />
      
      <EmployeeCard
        title="متوسط ساعات العمل"
        value={getAverageHours().toFixed(1)}
        subtitle="ساعة لكل موظف"
        isLoading={isLoading}
      />
    </div>
  );
}
