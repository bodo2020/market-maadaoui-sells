
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { fetchExpenses, createExpense, updateExpense, deleteExpense } from "@/services/supabase/expenseService";
import { Expense } from "@/types";
import { format } from "date-fns";

export default function ExpenseSettings() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [formData, setFormData] = useState({
    type: "",
    amount: 0,
    description: "",
    date: new Date().toISOString().split('T')[0],
    receipt_url: ""
  });
  const { toast } = useToast();

  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const data = await fetchExpenses();
      setExpenses(data);
    } catch (error) {
      console.error("Error loading expenses:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحميل بيانات المصاريف",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: name === 'amount' ? parseFloat(value) || 0 : value });
  };

  const resetForm = () => {
    setFormData({
      type: "",
      amount: 0,
      description: "",
      date: new Date().toISOString().split('T')[0],
      receipt_url: ""
    });
  };

  const openEditDialog = (expense: Expense) => {
    setSelectedExpense(expense);
    const formattedDate = typeof expense.date === 'string'
      ? expense.date.split('T')[0]
      : new Date(expense.date).toISOString().split('T')[0];
      
    setFormData({
      type: expense.type,
      amount: expense.amount,
      description: expense.description,
      date: formattedDate,
      receipt_url: expense.receipt_url || ""
    });
    setIsEditDialogOpen(true);
  };

  const handleAddExpense = async () => {
    try {
      if (!formData.type || !formData.description) {
        toast({
          title: "خطأ",
          description: "يرجى ملء جميع الحقول المطلوبة",
          variant: "destructive",
        });
        return;
      }

      await createExpense({
        type: formData.type,
        amount: formData.amount,
        description: formData.description,
        date: formData.date,
        receipt_url: formData.receipt_url
      });

      toast({
        title: "تم",
        description: "تم إضافة المصروف بنجاح",
      });

      setIsAddDialogOpen(false);
      resetForm();
      loadExpenses();
    } catch (error) {
      console.error("Error adding expense:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إضافة المصروف",
        variant: "destructive",
      });
    }
  };

  const handleUpdateExpense = async () => {
    if (!selectedExpense) return;

    try {
      await updateExpense(selectedExpense.id, {
        type: formData.type,
        amount: formData.amount,
        description: formData.description,
        date: formData.date,
        receipt_url: formData.receipt_url
      });

      toast({
        title: "تم",
        description: "تم تحديث بيانات المصروف بنجاح",
      });

      setIsEditDialogOpen(false);
      resetForm();
      loadExpenses();
    } catch (error) {
      console.error("Error updating expense:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحديث بيانات المصروف",
        variant: "destructive",
      });
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا المصروف؟")) return;

    try {
      await deleteExpense(expenseId);
      toast({
        title: "تم",
        description: "تم حذف المصروف بنجاح",
      });
      loadExpenses();
    } catch (error) {
      console.error("Error deleting expense:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حذف المصروف",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string | Date) => {
    try {
      return format(new Date(dateString), 'yyyy-MM-dd');
    } catch (error) {
      return 'Invalid date';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <h2 className="text-2xl font-bold">إدارة المصاريف</h2>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="ml-2 h-4 w-4" />
              إضافة مصروف جديد
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إضافة مصروف جديد</DialogTitle>
              <DialogDescription>أدخل بيانات المصروف الجديد</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">نوع المصروف</Label>
                  <Input
                    id="type"
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                    placeholder="نوع المصروف"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">المبلغ</Label>
                  <Input
                    id="amount"
                    name="amount"
                    type="number"
                    value={formData.amount}
                    onChange={handleInputChange}
                    placeholder="المبلغ"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">الوصف</Label>
                <Input
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="وصف المصروف"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">التاريخ</Label>
                  <Input
                    id="date"
                    name="date"
                    type="date"
                    value={formData.date}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="receipt_url">رابط الإيصال</Label>
                  <Input
                    id="receipt_url"
                    name="receipt_url"
                    value={formData.receipt_url}
                    onChange={handleInputChange}
                    placeholder="رابط الإيصال (اختياري)"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAddExpense}>إضافة المصروف</Button>
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
                <TableHead>النوع</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>الوصف</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>خيارات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    لم يتم العثور على مصاريف
                  </TableCell>
                </TableRow>
              ) : (
                expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="font-medium">{expense.type}</TableCell>
                    <TableCell>{expense.amount}</TableCell>
                    <TableCell>{expense.description}</TableCell>
                    <TableCell>{formatDate(expense.date)}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(expense)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => handleDeleteExpense(expense.id)}
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

      {/* Edit Expense Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل بيانات المصروف</DialogTitle>
            <DialogDescription>تعديل بيانات المصروف</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-type">نوع المصروف</Label>
                <Input
                  id="edit-type"
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-amount">المبلغ</Label>
                <Input
                  id="edit-amount"
                  name="amount"
                  type="number"
                  value={formData.amount}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">الوصف</Label>
              <Input
                id="edit-description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-date">التاريخ</Label>
                <Input
                  id="edit-date"
                  name="date"
                  type="date"
                  value={formData.date}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-receipt_url">رابط الإيصال</Label>
                <Input
                  id="edit-receipt_url"
                  name="receipt_url"
                  value={formData.receipt_url}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleUpdateExpense}>حفظ التغييرات</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
