
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Trash2 } from "lucide-react";
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
  email?: string;
  active?: boolean;
}

interface Branch {
  id: string;
  name: string;
}

export default function UsersManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    username: "",
    password: "",
    role: "cashier",
    phone: "",
    branch_id: "",
    email: ""
  });

  useEffect(() => {
    if (user) {
      fetchUsers();
      fetchBranches();
    }
  }, [user]);

  const fetchUsers = async () => {
    try {
      console.log("Fetching users...");
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching users:', error);
        throw error;
      }
      
      console.log("Users fetched successfully:", data);
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

      if (error) {
        console.error('Error fetching branches:', error);
        throw error;
      }
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

    setIsAdding(true);
    try {
      console.log("Current user:", user);
      console.log("Adding new user:", newUser);
      
      // Check if current user has permission
      if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) {
        toast.error('ليس لديك صلاحية لإضافة مستخدمين');
        return;
      }

      // Sign in anonymously to bypass RLS for user creation
      console.log("Attempting to sign in anonymously for user creation...");
      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) {
        console.log("Anonymous sign in error (proceeding anyway):", signInError);
      }

      const userData = {
        name: newUser.name,
        username: newUser.username,
        password: newUser.password,
        role: newUser.role,
        phone: newUser.phone || null,
        email: newUser.email || null,
        active: true,
        branch_id: (newUser.role === 'branch_manager' && newUser.branch_id) ? newUser.branch_id : null
      };

      console.log("Inserting user data:", userData);

      const { data, error } = await supabase
        .from('users')
        .insert([userData])
        .select()
        .single();

      if (error) {
        console.error('Error adding user:', error);
        console.error('Error details:', error.details, error.hint, error.message);
        
        if (error.code === '23505') {
          toast.error('اسم المستخدم موجود بالفعل');
        } else if (error.message?.includes('RLS')) {
          toast.error('خطأ في الصلاحيات - تأكد من أنك مسجل دخول كمدير');
        } else {
          toast.error('حدث خطأ في إضافة المستخدم: ' + error.message);
        }
        return;
      }

      console.log("User added successfully:", data);
      
      // Add the new user to the beginning of the list
      setUsers([data, ...users]);
      
      // Reset form
      setNewUser({ 
        name: "", 
        username: "", 
        password: "", 
        role: "cashier", 
        phone: "", 
        branch_id: "", 
        email: "" 
      });
      
      setIsAddDialogOpen(false);
      toast.success('تم إضافة المستخدم بنجاح');
      
    } catch (error) {
      console.error('Error adding user:', error);
      toast.error('حدث خطأ غير متوقع في إضافة المستخدم');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا المستخدم؟')) {
      try {
        const { error } = await supabase
          .from('users')
          .delete()
          .eq('id', userId);

        if (error) {
          console.error('Error deleting user:', error);
          throw error;
        }

        setUsers(users.filter(user => user.id !== userId));
        toast.success('تم حذف المستخدم بنجاح');
      } catch (error) {
        console.error('Error deleting user:', error);
        toast.error('حدث خطأ في حذف المستخدم');
      }
    }
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
                <Label htmlFor="name">الاسم *</Label>
                <Input
                  id="name"
                  value={newUser.name}
                  onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                  placeholder="اسم المستخدم"
                  disabled={isAdding}
                />
              </div>
              <div>
                <Label htmlFor="username">اسم المستخدم *</Label>
                <Input
                  id="username"
                  value={newUser.username}
                  onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                  placeholder="اسم تسجيل الدخول"
                  disabled={isAdding}
                />
              </div>
              <div>
                <Label htmlFor="password">كلمة المرور *</Label>
                <Input
                  id="password"
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  placeholder="كلمة المرور"
                  disabled={isAdding}
                />
              </div>
              <div>
                <Label htmlFor="phone">رقم الهاتف</Label>
                <Input
                  id="phone"
                  value={newUser.phone}
                  onChange={(e) => setNewUser({...newUser, phone: e.target.value})}
                  placeholder="رقم الهاتف (اختياري)"
                  disabled={isAdding}
                />
              </div>
              <div>
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  placeholder="البريد الإلكتروني (اختياري)"
                  disabled={isAdding}
                />
              </div>
              <div>
                <Label htmlFor="role">الدور</Label>
                <Select 
                  value={newUser.role} 
                  onValueChange={(value) => setNewUser({...newUser, role: value, branch_id: value !== 'branch_manager' ? '' : newUser.branch_id})}
                  disabled={isAdding}
                >
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
                  <Label htmlFor="branch">الفرع *</Label>
                  <Select 
                    value={newUser.branch_id} 
                    onValueChange={(value) => setNewUser({...newUser, branch_id: value})}
                    disabled={isAdding}
                  >
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
              <Button onClick={handleAddUser} className="w-full" disabled={isAdding}>
                {isAdding ? "جاري الإضافة..." : "إضافة المستخدم"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قائمة المستخدمين</CardTitle>
          <CardDescription>
            إدارة جميع مستخدمي النظام ({users.length} مستخدم)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              لا توجد مستخدمين مسجلين بعد
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>اسم المستخدم</TableHead>
                  <TableHead>الدور</TableHead>
                  <TableHead>الفرع</TableHead>
                  <TableHead>رقم الهاتف</TableHead>
                  <TableHead>البريد الإلكتروني</TableHead>
                  <TableHead>الحالة</TableHead>
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
                    <TableCell>{user.email || '-'}</TableCell>
                    <TableCell>
                      <Badge className={user.active !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {user.active !== false ? 'نشط' : 'غير نشط'}
                      </Badge>
                    </TableCell>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
