
import React from 'react';
import { Button } from "@/components/ui/button";
import { Filter, Download, UserPlus } from "lucide-react";

type EmployeeActionsProps = {
  onAddClick: () => void;
  onFilterClick: () => void;
  onExportClick: () => void;
};

export function EmployeeActions({ onAddClick, onFilterClick, onExportClick }: EmployeeActionsProps) {
  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">إدارة الموظفين</h1>
        <Button onClick={onAddClick}>
          <UserPlus className="ml-2 h-4 w-4" />
          إضافة موظف جديد
        </Button>
      </div>
      
      <div className="flex gap-2 mb-6">
        <Button variant="outline" onClick={onFilterClick}>
          <Filter className="ml-2 h-4 w-4" />
          تصفية
        </Button>
        <Button variant="outline" onClick={onExportClick}>
          <Download className="ml-2 h-4 w-4" />
          تصدير
        </Button>
      </div>
    </>
  );
}
