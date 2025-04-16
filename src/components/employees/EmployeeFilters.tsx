
import React from 'react';
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserRole } from "@/types";

type EmployeeFiltersProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  filterRole: string | null;
  setFilterRole: (role: string | null) => void;
  filterActive: boolean | null;
  setFilterActive: (active: boolean | null) => void;
  filterShift: string | null;
  setFilterShift: (shift: string | null) => void;
  applyFilters: () => void;
  resetFilters: () => void;
};

export function EmployeeFilters({
  isOpen,
  setIsOpen,
  filterRole,
  setFilterRole,
  filterActive,
  setFilterActive,
  filterShift,
  setFilterShift,
  applyFilters,
  resetFilters
}: EmployeeFiltersProps) {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>تصفية الموظفين</DialogTitle>
          <DialogDescription>
            تصفية قائمة الموظفين حسب المعايير المختارة
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="filter-role">الدور الوظيفي</Label>
            <Select 
              value={filterRole || "all"}
              onValueChange={(value) => setFilterRole(value === "all" ? null : value)}
            >
              <SelectTrigger id="filter-role">
                <SelectValue placeholder="جميع الأدوار" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأدوار</SelectItem>
                <SelectItem value={UserRole.ADMIN}>مدير</SelectItem>
                <SelectItem value={UserRole.CASHIER}>كاشير</SelectItem>
                <SelectItem value={UserRole.EMPLOYEE}>موظف</SelectItem>
                <SelectItem value={UserRole.DELIVERY}>مندوب توصيل</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="filter-active">الحالة</Label>
            <Select 
              value={filterActive === null ? "all" : filterActive ? "active" : "inactive"}
              onValueChange={(value) => {
                if (value === "all") setFilterActive(null);
                else setFilterActive(value === "active");
              }}
            >
              <SelectTrigger id="filter-active">
                <SelectValue placeholder="جميع الحالات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="inactive">غير نشط</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="filter-shift">الوردية</Label>
            <Select 
              value={filterShift || "all"}
              onValueChange={(value) => setFilterShift(value === "all" ? null : value)}
            >
              <SelectTrigger id="filter-shift">
                <SelectValue placeholder="جميع الورديات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الورديات</SelectItem>
                <SelectItem value="active">في وردية</SelectItem>
                <SelectItem value="inactive">خارج الوردية</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={resetFilters}>إعادة ضبط</Button>
          <Button onClick={applyFilters}>تطبيق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
