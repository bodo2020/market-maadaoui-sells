

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Edit, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Branch } from "@/types";

export default function BranchSettings() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [newBranch, setNewBranch] = useState({
    name: "",
    address: "",
    phone: "",
    email: ""
  });

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transform database data to match Branch type
      const transformedData: Branch[] = (data || []).map(branch => ({
        id: branch.id,
        name: branch.name,
        address: branch.address || '',
        phone: branch.phone || '',
        email: branch.email || '',
        manager_id: branch.manager_id,
        active: branch.active,
        created_at: branch.created_at,
        updated_at: branch.updated_at,
        settings: (branch.settings as Record<string, any>) || {}
      }));

      setBranches(transformedData);
    } catch (error) {
      console.error('Error fetching branches:', error);
      toast.error('حدث خطأ في تحميل الفروع');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBranch = async () => {
    if (!newBranch.name || !newBranch.address) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('branches')
        .insert([{
          name: newBranch.name,
          address: newBranch.address,
          phone: newBranch.phone,
          email: newBranch.email,
          active: true
        }])
        .select()
        .single();

      if (error) throw error;

      // Transform the response to match Branch type
      const transformedBranch: Branch = {
        id: data.id,
        name: data.name,
        address: data.address || '',
        phone: data.phone || '',
        email: data.email || '',
        manager_id: data.manager_id,
        active: data.active,
        created_at: data.created_at,
        updated_at: data.updated_at,
        settings: (data.settings as Record<string, any>) || {}
      };

      setBranches([transformedBranch, ...branches]);
      setNewBranch({ name: "", address: "", phone: "", email: "" });
      setIsAddDialogOpen(false);
      toast.success('تم إضافة الفرع بنجاح');
    } catch (error) {
      console.error('Error adding branch:', error);
      toast.error('حدث خطأ في إضافة الفرع');
    }
  };

  const handleUpdateBranch = async () => {
    if (!editingBranch) return;

    try {
      const { data, error } = await supabase
        .from('branches')
        .update({
          name: editingBranch.name,
          address: editingBranch.address,
          phone: editingBranch.phone,
          email: editingBranch.email
        })
        .eq('id', editingBranch.id)
        .select()
        .single();

      if (error) throw error;

      // Transform the response to match Branch type
      const transformedBranch: Branch = {
        id: data.id,
        name: data.name,
        address: data.address || '',
        phone: data.phone || '',
        email: data.email || '',
        manager_id: data.manager_id,
        active: data.active,
        created_at: data.created_at,
        updated_at: data.updated_at,
        settings: (data.settings as Record<string, any>) || {}
      };

      setBranches(branches.map(branch => 
        branch.id === editingBranch.id ? transformedBranch : branch
      ));
      setEditingBranch(null);
      toast.success('تم تحديث الفرع بنجاح');
    } catch (error) {
      console.error('Error updating branch:', error);
      toast.error('حدث خطأ في تحديث الفرع');
    }
  };

  const handleDeleteBranch = async (branchId: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا الفرع؟')) {
      try {
        const { error } = await supabase
          .from('branches')
          .delete()
          .eq('id', branchId);

        if (error) throw error;

        setBranches(branches.filter(branch => branch.id !== branchId));
        toast.success('تم حذف الفرع بنجاح');
      } catch (error) {
        console.error('Error deleting branch:', error);
        toast.error('حدث خطأ في حذف الفرع');
      }
    }
  };

  const toggleBranchStatus = async (branchId: string, currentStatus: boolean) => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .update({ active: !currentStatus })
        .eq('id', branchId)
        .select()
        .single();

      if (error) throw error;

      // Transform the response to match Branch type
      const transformedBranch: Branch = {
        id: data.id,
        name: data.name,
        address: data.address || '',
        phone: data.phone || '',
        email: data.email || '',
        manager_id: data.manager_id,
        active: data.active,
        created_at: data.created_at,
        updated_at: data.updated_at,
        settings: (data.settings as Record<string, any>) || {}
      };

      setBranches(branches.map(branch => 
        branch.id === branchId ? transformedBranch : branch
      ));
      toast.success(`تم ${!currentStatus ? 'تفعيل' : 'إيقاف'} الفرع بنجاح`);
    } catch (error) {
      console.error('Error updating branch status:', error);
      toast.error('حدث خطأ في تحديث حالة الفرع');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-12">
        <div className="animate-pulse">جاري تحميل الفروع...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">إدارة الفروع</h2>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              إضافة فرع جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة فرع جديد</DialogTitle>
              <DialogDescription>
                أدخل بيانات الفرع الجديد
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">اسم الفرع</Label>
                <Input
                  id="name"
                  value={newBranch.name}
                  onChange={(e) => setNewBranch({...newBranch, name: e.target.value})}
                  placeholder="اسم الفرع"
                />
              </div>
              <div>
                <Label htmlFor="address">العنوان</Label>
                <Textarea
                  id="address"
                  value={newBranch.address}
                  onChange={(e) => setNewBranch({...newBranch, address: e.target.value})}
                  placeholder="عنوان الفرع"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="phone">رقم الهاتف</Label>
                <Input
                  id="phone"
                  value={newBranch.phone}
                  onChange={(e) => setNewBranch({...newBranch, phone: e.target.value})}
                  placeholder="رقم الهاتف"
                />
              </div>
              <div>
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  value={newBranch.email}
                  onChange={(e) => setNewBranch({...newBranch, email: e.target.value})}
                  placeholder="البريد الإلكتروني"
                />
              </div>
              <Button onClick={handleAddBranch} className="w-full">
                إضافة الفرع
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Branch Dialog */}
      <Dialog open={!!editingBranch} onOpenChange={() => setEditingBranch(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل الفرع</DialogTitle>
            <DialogDescription>
              تحديث بيانات الفرع
            </DialogDescription>
          </DialogHeader>
          {editingBranch && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">اسم الفرع</Label>
                <Input
                  id="edit-name"
                  value={editingBranch.name}
                  onChange={(e) => setEditingBranch({...editingBranch, name: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="edit-address">العنوان</Label>
                <Textarea
                  id="edit-address"
                  value={editingBranch.address || ''}
                  onChange={(e) => setEditingBranch({...editingBranch, address: e.target.value})}
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="edit-phone">رقم الهاتف</Label>
                <Input
                  id="edit-phone"
                  value={editingBranch.phone || ''}
                  onChange={(e) => setEditingBranch({...editingBranch, phone: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="edit-email">البريد الإلكتروني</Label>
                <Input
                  id="edit-email"
                  value={editingBranch.email || ''}
                  onChange={(e) => setEditingBranch({...editingBranch, email: e.target.value})}
                />
              </div>
              <Button onClick={handleUpdateBranch} className="w-full">
                تحديث الفرع
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>قائمة الفروع</CardTitle>
          <CardDescription>
            إدارة جميع فروع المتجر
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>اسم الفرع</TableHead>
                <TableHead>العنوان</TableHead>
                <TableHead>رقم الهاتف</TableHead>
                <TableHead>البريد الإلكتروني</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>تاريخ الإنشاء</TableHead>
                <TableHead>الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell className="font-medium">{branch.name}</TableCell>
                  <TableCell>{branch.address || '-'}</TableCell>
                  <TableCell>{branch.phone || '-'}</TableCell>
                  <TableCell>{branch.email || '-'}</TableCell>
                  <TableCell>
                    <Badge 
                      variant={branch.active ? "default" : "secondary"}
                      className={`cursor-pointer ${
                        branch.active 
                          ? "bg-green-100 text-green-800 hover:bg-green-200" 
                          : "bg-red-100 text-red-800 hover:bg-red-200"
                      }`}
                      onClick={() => toggleBranchStatus(branch.id, branch.active)}
                    >
                      {branch.active ? 'نشط' : 'معطل'}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(branch.created_at).toLocaleDateString('ar-EG')}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingBranch(branch)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteBranch(branch.id)}
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

