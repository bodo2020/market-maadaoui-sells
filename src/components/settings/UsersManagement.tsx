
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Edit, Trash2, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface User {
  id: string;
  name: string;
  username: string;
  role: string;
  phone: string;
  created_at: string;
  branch_id?: string;
}

interface Branch {
  id: string;
  name: string;
}

export default function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    username: "",
    password: "",
    role: "cashier",
    phone: "",
    branch_id: ""
  });
  const [showPasswords, setShowPasswords] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    fetchUsers();
    fetchBranches();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('حدث خطأ في تحميل المستخدمين');
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('active', true)
        .order('name');

      if (error) throw error;
      setBranches(data || []);
    } catch (error) {
      console.error('Error fetching branches:', error);
      toast.error('حدث خطأ في تحميل الفروع');
    }
  };

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.username || !newUser.password) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    if (newUser.role === 'branch_manager' && !newUser.branch_id) {
      toast.error('يرجى اختيار الفرع لمدير الفرع');
      return;
    }

    try {
      const userData: any = {
        name: newUser.name,
        username: newUser.username,
        password: newUser.password,
        role: newUser.role,
        phone: newUser.phone
      };

      // Add branch_id only if role is branch_manager and branch_id is selected
      if (newUser.role === 'branch_manager' && newUser.branch_id) {
        userData.branch_id = newUser.branch_id;
      }

      const { data, error } = await supabase
        .from('users')
        .insert([userData])
        .select()
        .single();

      if (error) throw error;

      setUsers([data, ...users]);
      setNewUser({ name: "", username: "", password: "", role: "cashier", phone: "", branch_id: "" });
      setIsAddDialogOpen(false);
      toast.success('تم إضافة المستخدم بنجاح');
    } catch (error) {
      console.error('Error adding user:', error);
      toast.error('حدث خطأ في إضافة المستخدم');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا المستخدم؟')) {
      try {
        const { error } = await supabase
          .from('users')
          .delete()
          .eq('id', userId);

        if (error) throw error;

        setUsers(users.filter(user => user.id !== userId));
        toast.success('تم حذف المستخدم بنجاح');
      } catch (error) {
        console.error('Error deleting user:', error);
        toast.error('حدث خطأ في حذف المستخدم');
      }
    }
  };

  const togglePasswordVisibility = (userId: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'bg-red-100 text-red-800';
      case 'admin':
        return 'bg-blue-100 text-blue-800';
      case 'branch_manager':
        return 'bg-purple-100 text-purple-800';
      case 'cashier':
        return 'bg-green-100 text-green-800';
      case 'delivery':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'مدير عام';
      case 'admin':
        return 'مدير';
      case 'branch_manager':
        return 'مدير فرع';
      case 'cashier':
        return 'كاشير';
      case 'delivery':
        return 'توصيل';
      default:
        return role;
    }
  };

  const getBranchName = (branchId?: string) => {
    if (!branchId) return '-';
    const branch = branches.find(b => b.id === branchId);
    return branch ? branch.name : '-';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-12">
        <div className="animate-pulse">جاري تحميل المستخدمين...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">إدارة المستخدمين</h2>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="h-4 w-4" />
              إضافة مستخدم جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة مستخدم جديد</DialogTitle>
              <DialogDescription>
                أدخل بيانات المستخدم الجديد
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">الاسم</Label>
                <Input
                  id="name"
                  value={newUser.name}
                  onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                  placeholder="اسم المستخدم"
                />
              </div>
              <div>
                <Label htmlFor="username">اسم المستخدم</Label>
                <Input
                  id="username"
                  value={newUser.username}
                  onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                  placeholder="اسم تسجيل الدخول"
                />
              </div>
              <div>
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  placeholder="كلمة المرور"
                />
              </div>
              <div>
                <Label htmlFor="phone">رقم الهاتف</Label>
                <Input
                  id="phone"
                  value={newUser.phone}
                  onChange={(e) => setNewUser({...newUser, phone: e.target.value})}
                  placeholder="رقم الهاتف (اختياري)"
                />
              </div>
              <div>
                <Label htmlFor="role">الدور</Label>
                <Select value={newUser.role} onValueChange={(value) => setNewUser({...newUser, role: value, branch_id: value !== 'branch_manager' ? '' : newUser.branch_id})}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الدور" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cashier">كاشير</SelectItem>
                    <SelectItem value="branch_manager">مدير فرع</SelectItem>
                    <SelectItem value="admin">مدير</SelectItem>
                    <SelectItem value="super_admin">مدير عام</SelectItem>
                    <SelectItem value="delivery">توصيل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newUser.role === 'branch_manager' && (
                <div>
                  <Label htmlFor="branch">الفرع</Label>
                  <Select value={newUser.branch_id} onValueChange={(value) => setNewUser({...newUser, branch_id: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الفرع" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button onClick={handleAddUser} className="w-full">
                إضافة المستخدم
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قائمة المستخدمين</CardTitle>
          <CardDescription>
            إدارة جميع مستخدمي النظام
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>اسم المستخدم</TableHead>
                <TableHead>الدور</TableHead>
                <TableHead>الفرع</TableHead>
                <TableHead>رقم الهاتف</TableHead>
                <TableHead>تاريخ الإنشاء</TableHead>
                <TableHead>الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>
                    <Badge className={getRoleBadgeColor(user.role)}>
                      {getRoleDisplayName(user.role)}
                    </Badge>
                  </TableCell>
                  <TableCell>{getBranchName(user.branch_id)}</TableCell>
                  <TableCell>{user.phone || '-'}</TableCell>
                  <TableCell>{new Date(user.created_at).toLocaleDateString('ar-EG')}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteUser(user.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
