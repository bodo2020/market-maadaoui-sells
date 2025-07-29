import { useState, useEffect } from "react";
import { Branch, User } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createBranch, updateBranch } from "@/services/supabase/branchService";
import { fetchUsers } from "@/services/supabase/userService";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

interface BranchFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  branch?: Branch | null;
}

export function BranchFormDialog({ isOpen, onClose, branch }: BranchFormDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    manager_id: "",
    active: true,
  });
  const [isLoading, setIsLoading] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: isOpen
  });

  // Filter users who can be branch managers
  const potentialManagers = users.filter(user => 
    user.role === 'branch_manager' || user.role === 'admin'
  );

  useEffect(() => {
    if (branch) {
      setFormData({
        name: branch.name || "",
        address: branch.address || "",
        phone: branch.phone || "",
        email: branch.email || "",
        manager_id: branch.manager_id || "",
        active: branch.active,
      });
    } else {
      setFormData({
        name: "",
        address: "",
        phone: "",
        email: "",
        manager_id: "",
        active: true,
      });
    }
  }, [branch, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (branch) {
        await updateBranch(branch.id, formData);
      } else {
        await createBranch(formData);
      }
      onClose();
    } catch (error) {
      console.error('Error saving branch:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {branch ? "تعديل الفرع" : "إضافة فرع جديد"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">اسم الفرع *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              placeholder="أدخل اسم الفرع"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">العنوان</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => handleInputChange("address", e.target.value)}
              placeholder="أدخل عنوان الفرع"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">رقم الهاتف</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => handleInputChange("phone", e.target.value)}
              placeholder="أدخل رقم الهاتف"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              placeholder="أدخل البريد الإلكتروني"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manager_id">مدير الفرع</Label>
            <Select
              value={formData.manager_id}
              onValueChange={(value) => handleInputChange("manager_id", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر مدير الفرع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">بدون مدير</SelectItem>
                {potentialManagers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} ({user.role === 'admin' ? 'مدير عام' : 'مدير فرع'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2 space-x-reverse">
            <Switch
              id="active"
              checked={formData.active}
              onCheckedChange={(checked) => handleInputChange("active", checked)}
            />
            <Label htmlFor="active">فرع نشط</Label>
          </div>

          <div className="flex justify-end space-x-2 space-x-reverse pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "جاري الحفظ..." : (branch ? "تحديث" : "إضافة")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}