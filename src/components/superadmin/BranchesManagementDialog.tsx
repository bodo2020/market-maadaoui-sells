import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBranchStore } from "@/stores/branchStore";
import { fetchBranches, createBranch } from "@/services/supabase/branchService";
import { fetchUsers } from "@/services/supabase/userService";
import { assignUserToBranch, listBranchAssignments, removeUserFromBranch } from "@/services/supabase/branchRolesService";
import { toast } from "@/components/ui/sonner";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

export default function BranchesManagementDialog({ open, onOpenChange }: Props) {
  const { branches, setBranches, setCurrentBranch } = useBranchStore();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', phone: '', email: '' });
  const [selectedBranchId, setSelectedBranchId] = useState<string | undefined>(undefined);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(undefined);
  const [assignments, setAssignments] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    const list = await fetchBranches();
    setBranches(list);
    if (!selectedBranchId && list[0]) setSelectedBranchId(list[0].id);
    try {
      const us = await fetchUsers();
      setUsers(us.map((u: any) => ({ id: u.id, name: u.name })));
    } catch {}
    setLoading(false);
  };

  const loadAssignments = async () => {
    if (!selectedBranchId) return;
    const data = await listBranchAssignments(selectedBranchId);
    setAssignments(data);
  };

  useEffect(() => { if (open) load(); }, [open]);
  useEffect(() => { if (open) loadAssignments(); }, [open, selectedBranchId]);

  const handleAddBranch = async () => {
    if (!form.name.trim()) { toast.error('الاسم مطلوب'); return; }
    const created = await createBranch({ name: form.name.trim(), code: form.code || null, phone: form.phone || null, email: form.email || null });
    if (created) {
      toast.success('تم إضافة الفرع');
      setForm({ name: '', code: '', phone: '', email: '' });
      load();
    }
  };

  const handleAssign = async () => {
    if (!selectedBranchId || !selectedUserId) { toast.error('اختر فرعًا ومستخدمًا'); return; }
    await assignUserToBranch({ user_id: selectedUserId, branch_id: selectedBranchId, role: 'branch_admin' });
    toast.success('تم تعيين الأدمن للفرع');
    setSelectedUserId(undefined);
    await loadAssignments();
  };

  const handleRemoveAssignment = async (id: string) => {
    await removeUserFromBranch(id);
    toast.success('تم الإزالة');
    await loadAssignments();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>إدارة الفروع</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">إضافة فرع جديد</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="اسم الفرع" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="كود" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                  <Input placeholder="هاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <Input placeholder="البريد الإلكتروني" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <Button onClick={handleAddBranch} disabled={loading}>حفظ</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">تعيين أدمن للفرع</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {branches.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="اختر المستخدم" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {users.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAssign} disabled={!selectedUserId || !selectedBranchId}>تعيين</Button>

                <div className="pt-2">
                  <p className="text-sm font-medium mb-2">المعينون على الفرع</p>
                  <ScrollArea className="h-[160px] pr-2">
                    <div className="space-y-2">
                      {assignments.map((a) => (
                        <div key={a.id} className="flex items-center justify-between border rounded-md p-2">
                          <div className="text-sm">
                            <div className="font-medium">{a.user_name || a.user_id}</div>
                            <div className="text-muted-foreground text-xs">{a.role}</div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setCurrentBranch(selectedBranchId!)}>الدخول للفرع</Button>
                            <Button variant="destructive" size="sm" onClick={() => handleRemoveAssignment(a.id)}>حذف</Button>
                          </div>
                        </div>
                      ))}
                      {assignments.length === 0 && (
                        <div className="text-center text-muted-foreground text-sm py-6">لا يوجد مستخدمون معينون</div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader className="pb-2"><CardTitle className="text-sm">قائمة الفروع</CardTitle></CardHeader>
            <CardContent>
              <ScrollArea className="h-[220px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-right">
                      <th className="py-2 font-medium">الفرع</th>
                      <th className="py-2 font-medium">الكود</th>
                      <th className="py-2 font-medium">الحالة</th>
                      <th className="py-2 font-medium">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branches.map((b) => (
                      <tr key={b.id} className="border-t">
                        <td className="py-2">{b.name}</td>
                        <td className="py-2">{b.code || '-'}</td>
                        <td className="py-2">{b.active ? 'نشط' : 'موقوف'}</td>
                        <td className="py-2">
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setCurrentBranch(b.id)}>الدخول</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {branches.length === 0 && (
                      <tr>
                        <td className="py-4 text-center text-muted-foreground" colSpan={4}>لا توجد فروع</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
