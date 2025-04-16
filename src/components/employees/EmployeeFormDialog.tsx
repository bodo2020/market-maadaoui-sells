
import React from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { UserRole } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FormData = {
  name: string;
  role: string;
  phone: string;
  password: string;
  email: string;
  username: string;
  active: boolean;
  salary: number;
  salary_type: string;
};

type EmployeeFormDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  formData: FormData;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  handleSelectChange: (value: string, field: string) => void;
  handleSubmit: () => void;
  isEdit: boolean;
  isMutating: boolean;
};

export function EmployeeFormDialog({
  isOpen,
  setIsOpen,
  formData,
  handleInputChange,
  handleSelectChange,
  handleSubmit,
  isEdit,
  isMutating,
}: EmployeeFormDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل بيانات الموظف" : "إضافة موظف جديد"}</DialogTitle>
          <DialogDescription>
            {isEdit 
              ? "قم بتعديل بيانات الموظف. اضغط حفظ عند الانتهاء."
              : "أدخل بيانات الموظف الجديد. اضغط حفظ عند الانتهاء."
            }
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
              <Label htmlFor="password">{isEdit ? "كلمة المرور (اترك فارغاً للإبقاء على القديمة)" : "كلمة المرور"}</Label>
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
              <Label htmlFor="username">{isEdit ? "اسم المستخدم" : "اسم المستخدم (اختياري)"}</Label>
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
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="salary">الراتب</Label>
              <Input 
                id="salary" 
                type="number" 
                placeholder="الراتب" 
                value={formData.salary}
                onChange={(e) => handleSelectChange(e.target.value, "salary")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salary_type">نوع الراتب</Label>
              <Select 
                defaultValue={formData.salary_type}
                onValueChange={(value) => handleSelectChange(value, "salary_type")}
              >
                <SelectTrigger id="salary_type">
                  <SelectValue placeholder="اختر نوع الراتب" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">شهري</SelectItem>
                  <SelectItem value="daily">يومي</SelectItem>
                  <SelectItem value="hourly">بالساعة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button 
            type="submit" 
            onClick={handleSubmit}
            disabled={isMutating}
          >
            {isMutating ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                {isEdit ? "جارِ التحديث..." : "جارِ الحفظ..."}
              </>
            ) : (isEdit ? "حفظ التغييرات" : "حفظ الموظف")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
