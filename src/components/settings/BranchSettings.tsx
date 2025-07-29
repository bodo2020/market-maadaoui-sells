import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Branch, User, UserRole } from "@/types";
import { fetchBranches, createBranch, updateBranch, deleteBranch } from "@/services/supabase/branchService";
import { fetchUsers } from "@/services/supabase/userService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function BranchSettings() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    manager_id: "none"
  });
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  useEffect(() => {
    loadBranches();
    loadUsers();
  }, []);

  const loadBranches = async () => {
    try {
      setLoading(true);
      
      if (!currentUser || currentUser.role !== UserRole.ADMIN) {
        toast({
          title: "خطأ في الصلاحيات",
          description: "ليس لديك صلاحية للوصول إلى هذه الصفحة",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
      
      const data = await fetchBranches();
      setBranches(data);
    } catch (error) {
      console.error("Error loading branches:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحميل بيانات الفروع",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await fetchUsers();
      // Filter users who can be branch managers
      const eligibleUsers = data.filter(user => 
        user.role === UserRole.BRANCH_MANAGER || user.role === UserRole.ADMIN
      );
      setUsers(eligibleUsers);
    } catch (error) {
      console.error("Error loading users:", error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleManagerChange = (value: string) => {
    setFormData({ ...formData, manager_id: value });
  };

  const resetForm = () => {
    setFormData({
      name: "",
      address: "",
      phone: "",
      email: "",
      manager_id: "none"
    });
  };

  const openEditDialog = (branch: Branch) => {
    setSelectedBranch(branch);
    setFormData({
      name: branch.name,
      address: branch.address || "",
      phone: branch.phone || "",
      email: branch.email || "",
      manager_id: branch.manager_id || "none"
    });
    setIsEditDialogOpen(true);
  };

  const handleAddBranch = async () => {
    try {
      console.log('Current user role:', currentUser?.role);
      console.log('Current user ID:', currentUser?.id);
      
      if (!formData.name) {
        toast({
          title: "خطأ",
          description: "يرجى إدخال اسم الفرع",
          variant: "destructive",
        });
        return;
      }

      await createBranch({
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
        email: formData.email,
        manager_id: formData.manager_id === "none" ? undefined : formData.manager_id || undefined,
        active: true
      });

      toast({
        title: "تم",
        description: "تم إضافة الفرع بنجاح",
      });

      setIsAddDialogOpen(false);
      resetForm();
      loadBranches();
    } catch (error) {
      console.error("Error adding branch:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إضافة الفرع",
        variant: "destructive",
      });
    }
  };

  const handleUpdateBranch = async () => {
    if (!selectedBranch) return;

    try {
      await updateBranch(selectedBranch.id, {
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
        email: formData.email,
        manager_id: formData.manager_id === "none" ? undefined : formData.manager_id || undefined
      });

      toast({
        title: "تم",
        description: "تم تحديث بيانات الفرع بنجاح",
      });

      setIsEditDialogOpen(false);
      resetForm();
      loadBranches();
    } catch (error) {
      console.error("Error updating branch:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحديث بيانات الفرع",
        variant: "destructive",
      });
    }
  };

  const handleDeleteBranch = async (branchId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الفرع؟")) return;

    try {
      await deleteBranch(branchId);
      toast({
        title: "تم",
        description: "تم حذف الفرع بنجاح",
      });
      loadBranches();
    } catch (error) {
      console.error("Error deleting branch:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حذف الفرع",
        variant: "destructive",
      });
    }
  };

  const getManagerName = (managerId?: string) => {
    if (!managerId) return "—";
    const manager = users.find(u => u.id === managerId);
    return manager?.name || "—";
  };

  if (!currentUser || currentUser.role !== UserRole.ADMIN) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-2xl font-bold text-destructive mb-4">خطأ في الصلاحيات</h2>
        <p className="text-muted-foreground">ليس لديك صلاحية للوصول إلى هذه الصفحة</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <h2 className="text-2xl font-bold">إدارة الفروع</h2>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="ml-2 h-4 w-4" />
              إضافة فرع جديد
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إضافة فرع جديد</DialogTitle>
              <DialogDescription>أدخل بيانات الفرع الجديد</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">اسم الفرع</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="اسم الفرع"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">العنوان</Label>
                <Input
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  placeholder="عنوان الفرع"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                <div className="space-y-2">
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="البريد الإلكتروني"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="manager">مدير الفرع</Label>
                <Select
                  value={formData.manager_id}
                  onValueChange={handleManagerChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر مدير الفرع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون مدير</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} - {user.role === UserRole.ADMIN ? "مدير" : "مدير فرع"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAddBranch}>إضافة الفرع</Button>
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
                <TableHead>اسم الفرع</TableHead>
                <TableHead>العنوان</TableHead>
                <TableHead>الهاتف</TableHead>
                <TableHead>المدير</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>خيارات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    لم يتم العثور على فروع
                  </TableCell>
                </TableRow>
              ) : (
                branches.map((branch) => (
                  <TableRow key={branch.id}>
                    <TableCell className="font-medium">{branch.name}</TableCell>
                    <TableCell>{branch.address || "—"}</TableCell>
                    <TableCell>{branch.phone || "—"}</TableCell>
                    <TableCell>{getManagerName(branch.manager_id)}</TableCell>
                    <TableCell>
                      {branch.active ? (
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
                          onClick={() => openEditDialog(branch)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => handleDeleteBranch(branch.id)}
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

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل بيانات الفرع</DialogTitle>
            <DialogDescription>تعديل بيانات الفرع {selectedBranch?.name}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">اسم الفرع</Label>
              <Input
                id="edit-name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-address">العنوان</Label>
              <Input
                id="edit-address"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-phone">رقم الهاتف</Label>
                <Input
                  id="edit-phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">البريد الإلكتروني</Label>
                <Input
                  id="edit-email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-manager">مدير الفرع</Label>
              <Select
                value={formData.manager_id}
                onValueChange={handleManagerChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر مدير الفرع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون مدير</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} - {user.role === UserRole.ADMIN ? "مدير" : "مدير فرع"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleUpdateBranch}>حفظ التغييرات</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}