import { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ExpenseAnalytics } from "@/components/analytics/ExpenseAnalytics";
import { 
  Plus, 
  Edit, 
  Trash2, 
  DollarSign, 
  Receipt, 
  Users, 
  TrendingUp,
  Calendar,
  FileText,
  Download,
  Filter,
  Check
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { 
  fetchExpenses, 
  createExpense, 
  updateExpense, 
  deleteExpense,
  createDamageExpense 
} from "@/services/supabase/expenseService";
import { 
  fetchSalaries, 
  createSalary, 
  updateSalary, 
  deleteSalary, 
  markSalaryAsPaid,
  createMonthlyPayroll,
  getSalaryStatistics,
  Salary
} from "@/services/supabase/salaryService";
import { fetchUsers } from "@/services/supabase/userService";
import { DateRange } from "react-day-picker";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ar } from "date-fns/locale";

interface Expense {
  id: string;
  type: string;
  amount: number;
  description: string;
  date: string;
  receipt_url?: string;
  created_at: string;
}

export default function ExpensesAndSalaries() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddSalary, setShowAddSalary] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingSalary, setEditingSalary] = useState<Salary | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [filterType, setFilterType] = useState<string>('all');
  
  const { toast } = useToast();

  // Form states
  const [expenseForm, setExpenseForm] = useState({
    type: '',
    amount: 0,
    description: '',
    date: new Date().toISOString().split('T')[0],
    receipt_url: ''
  });

  const [salaryForm, setSalaryForm] = useState({
    employee_id: '',
    amount: 0,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    status: 'pending' as 'paid' | 'pending',
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, [dateRange, filterType]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [expensesData, salariesData, employeesData] = await Promise.all([
        fetchExpenses(),
        fetchSalaries(),
        fetchUsers()
      ]);
      
      // Filter expenses by date range and type
      let filteredExpenses = expensesData;
      if (dateRange?.from && dateRange?.to) {
        filteredExpenses = expensesData.filter(expense => {
          const expenseDate = new Date(expense.date);
          return expenseDate >= dateRange.from! && expenseDate <= dateRange.to!;
        });
      }
      
      if (filterType !== 'all') {
        filteredExpenses = filteredExpenses.filter(expense => expense.type === filterType);
      }

      setExpenses(filteredExpenses);
      setSalaries(salariesData);
      setEmployees(employeesData.filter(emp => emp.active));
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل البيانات",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async () => {
    try {
      if (!expenseForm.type || !expenseForm.amount || !expenseForm.description) {
        toast({
          title: "خطأ",
          description: "يرجى ملء جميع الحقول المطلوبة",
          variant: "destructive"
        });
        return;
      }

      if (expenseForm.type === "منتج تالف") {
        await createDamageExpense(expenseForm);
      } else {
        await createExpense(expenseForm);
      }

      toast({
        title: "تم بنجاح",
        description: "تم إضافة المصروف بنجاح"
      });

      setShowAddExpense(false);
      setExpenseForm({
        type: '',
        amount: 0,
        description: '',
        date: new Date().toISOString().split('T')[0],
        receipt_url: ''
      });
      loadData();
    } catch (error) {
      console.error("Error adding expense:", error);
      toast({
        title: "خطأ",
        description: "فشل في إضافة المصروف",
        variant: "destructive"
      });
    }
  };

  const handleEditExpense = async () => {
    if (!editingExpense) return;

    try {
      await updateExpense(editingExpense.id, expenseForm);
      toast({
        title: "تم بنجاح",
        description: "تم تحديث المصروف بنجاح"
      });
      setEditingExpense(null);
      loadData();
    } catch (error) {
      console.error("Error updating expense:", error);
      toast({
        title: "خطأ",
        description: "فشل في تحديث المصروف",
        variant: "destructive"
      });
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      await deleteExpense(id);
      toast({
        title: "تم بنجاح",
        description: "تم حذف المصروف بنجاح"
      });
      loadData();
    } catch (error) {
      console.error("Error deleting expense:", error);
      toast({
        title: "خطأ",
        description: "فشل في حذف المصروف",
        variant: "destructive"
      });
    }
  };

  const handleAddSalary = async () => {
    try {
      if (!salaryForm.employee_id || !salaryForm.amount || salaryForm.amount <= 0) {
        toast({
          title: "خطأ",
          description: "يرجى ملء جميع الحقول المطلوبة",
          variant: "destructive"
        });
        return;
      }

      await createSalary(salaryForm);

      toast({
        title: "تم بنجاح",
        description: "تم إضافة الراتب بنجاح"
      });

      setShowAddSalary(false);
      setSalaryForm({
        employee_id: '',
        amount: 0,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        status: 'pending',
        notes: ''
      });
      loadData();
    } catch (error) {
      console.error("Error adding salary:", error);
      toast({
        title: "خطأ",
        description: "فشل في إضافة الراتب",
        variant: "destructive"
      });
    }
  };

  const handlePaySalary = async (id: string) => {
    try {
      await markSalaryAsPaid(id);
      toast({
        title: "تم بنجاح",
        description: "تم تسجيل الراتب كمدفوع"
      });
      loadData();
    } catch (error) {
      console.error("Error marking salary as paid:", error);
      toast({
        title: "خطأ",
        description: "فشل في تسجيل دفع الراتب",
        variant: "destructive"
      });
    }
  };

  const handleDeleteSalary = async (id: string) => {
    try {
      await deleteSalary(id);
      toast({
        title: "تم بنجاح",
        description: "تم حذف الراتب بنجاح"
      });
      loadData();
    } catch (error) {
      console.error("Error deleting salary:", error);
      toast({
        title: "خطأ",
        description: "فشل في حذف الراتب",
        variant: "destructive"
      });
    }
  };

  const getMonthName = (month: number) => {
    const months = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    return months[month - 1];
  };

  const expenseTypes = [
    "راتب",
    "صيانة", 
    "مرافق",
    "فاتورة كهرباء",
    "فاتورة مياه",
    "فاتورة انترنت",
    "منتج تالف",
    "إيجار",
    "تسويق",
    "مواصلات",
    "أخرى"
  ];

  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalSalaries = salaries.reduce((sum, salary) => sum + salary.amount, 0);
  const pendingSalaries = salaries.filter(s => s.status === 'pending').length;

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">جاري التحميل...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">إدارة المصروفات والرواتب</h1>
            <p className="text-muted-foreground mt-2">
              إدارة شاملة للمصروفات ورواتب الموظفين
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي المصروفات</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalExpenses.toFixed(2)} ج.م</div>
              <p className="text-xs text-muted-foreground">{expenses.length} مصروف</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الرواتب</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSalaries.toFixed(2)} ج.م</div>
              <p className="text-xs text-muted-foreground">{salaries.length} موظف</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">رواتب معلقة</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{pendingSalaries}</div>
              <p className="text-xs text-muted-foreground">في انتظار الدفع</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي التكاليف</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {(totalExpenses + totalSalaries).toFixed(2)} ج.م
              </div>
              <p className="text-xs text-muted-foreground">مصروفات + رواتب</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              تصفية البيانات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex items-center gap-2">
                <Label>الفترة الزمنية:</Label>
                <DateRangePicker
                  from={dateRange?.from || new Date()}
                  to={dateRange?.to || new Date()}
                  onSelect={setDateRange}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label>نوع المصروف:</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الأنواع</SelectItem>
                    {expenseTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={loadData} variant="outline" size="sm">
                تحديث
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="expenses" className="space-y-4">
          <TabsList>
            <TabsTrigger value="expenses">المصروفات</TabsTrigger>
            <TabsTrigger value="salaries">الرواتب</TabsTrigger>
            <TabsTrigger value="analytics">التحليلات</TabsTrigger>
          </TabsList>

          {/* Expenses Tab */}
          <TabsContent value="expenses" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>قائمة المصروفات</CardTitle>
                    <CardDescription>إدارة وتتبع جميع مصروفات الشركة</CardDescription>
                  </div>
                  <Dialog open={showAddExpense} onOpenChange={setShowAddExpense}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 ml-2" />
                        إضافة مصروف
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>إضافة مصروف جديد</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>نوع المصروف</Label>
                          <Select value={expenseForm.type} onValueChange={(value) => setExpenseForm({...expenseForm, type: value})}>
                            <SelectTrigger>
                              <SelectValue placeholder="اختر نوع المصروف" />
                            </SelectTrigger>
                            <SelectContent>
                              {expenseTypes.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>المبلغ</Label>
                          <Input
                            type="number"
                            value={expenseForm.amount}
                            onChange={(e) => setExpenseForm({...expenseForm, amount: Number(e.target.value)})}
                            placeholder="أدخل المبلغ"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>الوصف</Label>
                          <Textarea
                            value={expenseForm.description}
                            onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                            placeholder="وصف تفصيلي للمصروف"
                            rows={3}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>التاريخ</Label>
                          <Input
                            type="date"
                            value={expenseForm.date}
                            onChange={(e) => setExpenseForm({...expenseForm, date: e.target.value})}
                          />
                        </div>
                        <div className="flex gap-2 pt-4">
                          <Button onClick={handleAddExpense} className="flex-1">
                            إضافة المصروف
                          </Button>
                          <Button variant="outline" onClick={() => setShowAddExpense(false)}>
                            إلغاء
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>النوع</TableHead>
                      <TableHead>المبلغ</TableHead>
                      <TableHead>الوصف</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>
                          <Badge variant={expense.type === "منتج تالف" ? "destructive" : "secondary"}>
                            {expense.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {expense.amount.toFixed(2)} ج.م
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {expense.description}
                        </TableCell>
                        <TableCell>
                          {format(new Date(expense.date), 'dd/MM/yyyy', { locale: ar })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleDeleteExpense(expense.id)}
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
          </TabsContent>

          {/* Salaries Tab */}
          <TabsContent value="salaries" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>إدارة الرواتب</CardTitle>
                    <CardDescription>تتبع ودفع رواتب الموظفين</CardDescription>
                  </div>
                  <Dialog open={showAddSalary} onOpenChange={setShowAddSalary}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 ml-2" />
                        إضافة راتب
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>إضافة راتب جديد</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>الموظف</Label>
                          <Select value={salaryForm.employee_id} onValueChange={(value) => setSalaryForm({...salaryForm, employee_id: value})}>
                            <SelectTrigger>
                              <SelectValue placeholder="اختر الموظف" />
                            </SelectTrigger>
                            <SelectContent>
                              {employees.map(employee => (
                                <SelectItem key={employee.id} value={employee.id}>
                                  {employee.name} ({employee.role})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>المبلغ</Label>
                          <Input
                            type="number"
                            value={salaryForm.amount}
                            onChange={(e) => setSalaryForm({...salaryForm, amount: Number(e.target.value)})}
                            placeholder="أدخل مبلغ الراتب"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <Label>الشهر</Label>
                            <Select value={String(salaryForm.month)} onValueChange={(value) => setSalaryForm({...salaryForm, month: Number(value)})}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({length: 12}, (_, i) => i + 1).map(month => (
                                  <SelectItem key={month} value={String(month)}>
                                    {getMonthName(month)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>السنة</Label>
                            <Input
                              type="number"
                              value={salaryForm.year}
                              onChange={(e) => setSalaryForm({...salaryForm, year: Number(e.target.value)})}
                              min="2020"
                              max="2030"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>الحالة</Label>
                          <Select value={salaryForm.status} onValueChange={(value: 'paid' | 'pending') => setSalaryForm({...salaryForm, status: value})}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">معلق</SelectItem>
                              <SelectItem value="paid">مدفوع</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>ملاحظات</Label>
                          <Textarea
                            value={salaryForm.notes}
                            onChange={(e) => setSalaryForm({...salaryForm, notes: e.target.value})}
                            placeholder="ملاحظات إضافية..."
                            rows={3}
                          />
                        </div>
                        <div className="flex gap-2 pt-4">
                          <Button onClick={handleAddSalary} className="flex-1">
                            إضافة الراتب
                          </Button>
                          <Button variant="outline" onClick={() => setShowAddSalary(false)}>
                            إلغاء
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الموظف</TableHead>
                      <TableHead>المبلغ</TableHead>
                      <TableHead>الشهر/السنة</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>تاريخ الدفع</TableHead>
                      <TableHead>الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salaries.map((salary) => (
                      <TableRow key={salary.id}>
                        <TableCell className="font-medium">
                          {salary.employee?.name || 'غير محدد'}
                        </TableCell>
                        <TableCell>{salary.amount.toFixed(2)} ج.م</TableCell>
                        <TableCell>{getMonthName(salary.month)}/{salary.year}</TableCell>
                        <TableCell>
                          <Badge variant={salary.status === 'paid' ? 'default' : 'secondary'}>
                            {salary.status === 'paid' ? 'مدفوع' : 'معلق'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {salary.payment_date 
                            ? format(new Date(salary.payment_date), 'dd/MM/yyyy', { locale: ar })
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {salary.status === 'pending' && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handlePaySalary(salary.id)}
                              >
                                <Check className="h-4 w-4" />
                                دفع
                              </Button>
                            )}
                            <Button variant="outline" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleDeleteSalary(salary.id)}
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
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <ExpenseAnalytics selectedPeriod="month" />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}