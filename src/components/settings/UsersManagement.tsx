
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { UserRole, User } from "@/types";
import { fetchUsers, createUser, updateUser, deleteUser } from "@/services/supabase/userService";
import { Loader2, UserPlus, Pencil, Trash2 } from "lucide-react";

export default function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    username: "",
    password: "",
    role: UserRole.EMPLOYEE,
    active: true
  });
  const { toast } = useToast();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await fetchUsers();
      setUsers(data);
    } catch (error) {
      console.error("Error loading users:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحميل بيانات المستخدمين",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleRoleChange = (value: string) => {
    setFormData({ ...formData, role: value as UserRole });
  };

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      username: "",
      password: "",
      role: UserRole.EMPLOYEE,
      active: true
    });
  };

  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setFormData({
      name: user.name,
      phone: user.phone || "",
      username: user.username,
      password: "", // Don't set password when editing
      role: user.role,
      active: user.active !== false // Default to true if undefined
    });
    setIsEditDialogOpen(true);
  };

  const handleAddUser = async () => {
    try {
      // Validate form
      if (!formData.name || !formData.username || !formData.password) {
        toast({
          title: "خطأ",
          description: "يرجى ملء جميع الحقول المطلوبة",
          variant: "destructive",
        });
        return;
      }

      await createUser({
        name: formData.name,
        phone: formData.phone,
        username: formData.username,
        password: formData.password,
        role: formData.role,
        active: formData.active
      });

      toast({
        title: "تم",
        description: "تم إضافة المستخدم بنجاح",
      });

      setIsAddDialogOpen(false);
      resetForm();
      loadUsers();
    } catch (error) {
      console.error("Error adding user:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إضافة المستخدم",
        variant: "destructive",
      });
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    try {
      const updateData: Partial<User> = {
        name: formData.name,
        phone: formData.phone,
        role: formData.role,
        active: formData.active
      };

      // Only include password if it was changed
      if (formData.password) {
        updateData.password = formData.password;
      }

      await updateUser(selectedUser.id, updateData);

      toast({
        title: "تم",
        description: "تم تحديث بيانات المستخدم بنجاح",
      });

      setIsEditDialogOpen(false);
      resetForm();
      loadUsers();
    } catch (error) {
      console.error("Error updating user:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحديث بيانات المستخدم",
        variant: "destructive",
      });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا المستخدم؟")) return;

    try {
      await deleteUser(userId);
      toast({
        title: "تم",
        description: "تم حذف المستخدم بنجاح",
      });
      loadUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حذف المستخدم",
        variant: "destructive",
      });
    }
  };

  const getRoleDisplay = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN:
        return "مدير";
      case UserRole.CASHIER:
        return "كاشير";
      case UserRole.EMPLOYEE:
        return "موظف";
      case UserRole.DELIVERY:
        return "مندوب توصيل";
      default:
        return role;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <h2 className="text-2xl font-bold">إدارة المستخدمين</h2>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="ml-2 h-4 w-4" />
              إضافة مستخدم جديد
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إضافة مستخدم جديد</DialogTitle>
              <DialogDescription>أدخل بيانات المستخدم الجديد</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">الاسم الكامل</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="الاسم الكامل للمستخدم"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">رقم الهاتف</Label>
                  <Input
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="رقم الهاتف"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">اسم المستخدم</Label>
                  <Input
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    placeholder="اسم المستخدم للدخول"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">كلمة المرور</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="كلمة المرور"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">الدور الوظيفي</Label>
                <Select
                  value={formData.role}
                  onValueChange={handleRoleChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الدور الوظيفي" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UserRole.ADMIN}>مدير</SelectItem>
                    <SelectItem value={UserRole.CASHIER}>كاشير</SelectItem>
                    <SelectItem value={UserRole.EMPLOYEE}>موظف</SelectItem>
                    <SelectItem value={UserRole.DELIVERY}>مندوب توصيل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAddUser}>إضافة المستخدم</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>الدور الوظيفي</TableHead>
                <TableHead>اسم المستخدم</TableHead>
                <TableHead>رقم الهاتف</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>خيارات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    لم يتم العثور على مستخدمين
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{getRoleDisplay(user.role)}</TableCell>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{user.phone || "—"}</TableCell>
                    <TableCell>
                      {user.active !== false ? (
                        <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">نشط</span>
                      ) : (
                        <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded-full">غير نشط</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(user)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => handleDeleteUser(user.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل بيانات المستخدم</DialogTitle>
            <DialogDescription>تعديل بيانات المستخدم {selectedUser?.name}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">الاسم الكامل</Label>
                <Input
                  id="edit-name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">رقم الهاتف</Label>
                <Input
                  id="edit-phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-username">اسم المستخدم</Label>
                <Input
                  id="edit-username"
                  name="username"
                  value={formData.username}
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-password">كلمة المرور (اتركها فارغة إذا لم ترغب بتغييرها)</Label>
                <Input
                  id="edit-password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="كلمة المرور الجديدة"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">الدور الوظيفي</Label>
              <Select
                value={formData.role}
                onValueChange={handleRoleChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر الدور الوظيفي" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UserRole.ADMIN}>مدير</SelectItem>
                  <SelectItem value={UserRole.CASHIER}>كاشير</SelectItem>
                  <SelectItem value={UserRole.EMPLOYEE}>موظف</SelectItem>
                  <SelectItem value={UserRole.DELIVERY}>مندوب توصيل</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleUpdateUser}>حفظ التغييرات</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
