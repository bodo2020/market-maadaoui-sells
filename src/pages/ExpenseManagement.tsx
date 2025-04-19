import { useState, useEffect } from "react";
import { Expense } from "@/types";
import { fetchExpenses, createExpense, updateExpense, deleteExpense } from "@/services/supabase/expenseService";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { DatePicker } from "@/components/ui/date-picker";

export default function ExpenseManagement() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [formData, setFormData] = useState({
    type: "",
    amount: "",
    description: "",
    date: new Date(),
    receipt_url: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchExpenseData();
  }, []);

  const fetchExpenseData = async () => {
    try {
      const data = await fetchExpenses();
      setExpenses(data);
    } catch (error) {
      console.error("Error fetching expenses:", error);
      toast({
        title: "خطأ في تحميل المصروفات",
        description: "حدث خطأ أثناء تحميل المصروفات، يرجى المحاولة مرة أخرى.",
        variant: "destructive",
      });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setFormData({
        ...formData,
        date: date,
      });
    }
  };

  const resetForm = () => {
    setFormData({
      type: "",
      amount: "",
      description: "",
      date: new Date(),
      receipt_url: "",
    });
  };

  // Just updating the createExpense call to include the category field
  const handleCreateExpense = async () => {
    try {
      setIsSubmitting(true);
    
      // Format the date correctly
      const formattedDate = new Date(formData.date).toISOString();
    
      // Create the expense
      await createExpense({
        type: formData.type,
        amount: Number(formData.amount),
        description: formData.description,
        date: formattedDate,
        receipt_url: formData.receipt_url || "",
        category: formData.type // Using type as category for now
      });
    
      // Show success message
      toast({
        title: "تم إضافة المصروف بنجاح",
        description: `تم إضافة ${formData.description} بمبلغ ${formData.amount} ج.م`,
      });
    
      // Reset form and reload expenses
      resetForm();
      fetchExpenseData();
    
    } catch (error) {
      console.error("Error creating expense:", error);
      toast({
        title: "خطأ في إضافة المصروف",
        description: "حدث خطأ أثناء إضافة المصروف، يرجى المحاولة مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditExpense = async () => {
    if (!selectedExpense) return;

    try {
      setIsSubmitting(true);
      
      // Format the date correctly
      const formattedDate = new Date(formData.date).toISOString();

      await updateExpense(selectedExpense.id, {
        type: formData.type,
        amount: Number(formData.amount),
        description: formData.description,
        date: formattedDate,
        receipt_url: formData.receipt_url || "",
        category: formData.type,
      });

      toast({
        title: "تم تعديل المصروف بنجاح",
        description: `تم تعديل ${formData.description} بمبلغ ${formData.amount} ج.م`,
      });

      resetForm();
      fetchExpenseData();
      setIsEditDialogOpen(false);
    } catch (error) {
      console.error("Error updating expense:", error);
      toast({
        title: "خطأ في تعديل المصروف",
        description: "حدث خطأ أثناء تعديل المصروف، يرجى المحاولة مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!selectedExpense) return;

    try {
      setIsSubmitting(true);
      await deleteExpense(selectedExpense.id);

      toast({
        title: "تم حذف المصروف بنجاح",
        description: `تم حذف ${selectedExpense.description}`,
      });

      resetForm();
      fetchExpenseData();
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error("Error deleting expense:", error);
      toast({
        title: "خطأ في حذف المصروف",
        description: "حدث خطأ أثناء حذف المصروف، يرجى المحاولة مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (expense: Expense) => {
    setSelectedExpense(expense);
    setFormData({
      type: expense.type,
      amount: String(expense.amount),
      description: expense.description,
      date: new Date(expense.date),
      receipt_url: expense.receipt_url || "",
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (expense: Expense) => {
    setSelectedExpense(expense);
    setIsDeleteDialogOpen(true);
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6 dir-rtl">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">إدارة المصروفات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="type">النوع</Label>
                  <Input
                    type="text"
                    id="type"
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <Label htmlFor="amount">المبلغ</Label>
                  <Input
                    type="number"
                    id="amount"
                    name="amount"
                    value={formData.amount}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <Label htmlFor="date">التاريخ</Label>
                  <DatePicker
                    value={formData.date}
                    onValueChange={handleDateChange}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="description">الوصف</Label>
                <Input
                  type="textarea"
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                />
              </div>
              <div>
                <Label htmlFor="receipt_url">رابط الإيصال</Label>
                <Input
                  type="text"
                  id="receipt_url"
                  name="receipt_url"
                  value={formData.receipt_url}
                  onChange={handleChange}
                />
              </div>
              <Button onClick={handleCreateExpense} disabled={isSubmitting}>
                {isSubmitting ? "جاري الإضافة..." : "إضافة مصروف"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>قائمة المصروفات</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>النوع</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الوصف</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>{expense.type}</TableCell>
                      <TableCell>{expense.amount}</TableCell>
                      <TableCell>{new Date(expense.date).toLocaleDateString()}</TableCell>
                      <TableCell>{expense.description}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(expense)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeleteDialog(expense)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Edit Expense Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>تعديل المصروف</DialogTitle>
              <DialogDescription>
                تعديل تفاصيل المصروف المحدد.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="type">النوع</Label>
                  <Input
                    type="text"
                    id="type"
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <Label htmlFor="amount">المبلغ</Label>
                  <Input
                    type="number"
                    id="amount"
                    name="amount"
                    value={formData.amount}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <Label htmlFor="date">التاريخ</Label>
                  <DatePicker
                    value={formData.date}
                    onValueChange={handleDateChange}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="description">الوصف</Label>
                <Input
                  type="textarea"
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                />
              </div>
              <div>
                <Label htmlFor="receipt_url">رابط الإيصال</Label>
                <Input
                  type="text"
                  id="receipt_url"
                  name="receipt_url"
                  value={formData.receipt_url}
                  onChange={handleChange}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setIsEditDialogOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" onClick={handleEditExpense} disabled={isSubmitting}>
                {isSubmitting ? "جاري التعديل..." : "تعديل المصروف"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Expense Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>حذف المصروف</DialogTitle>
              <DialogDescription>
                هل أنت متأكد أنك تريد حذف هذا المصروف؟
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setIsDeleteDialogOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" variant="destructive" onClick={handleDeleteExpense} disabled={isSubmitting}>
                {isSubmitting ? "جاري الحذف..." : "حذف المصروف"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
