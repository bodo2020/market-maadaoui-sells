
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
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
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  ReceiptText, 
  Plus, 
  Search, 
  Calendar, 
  FileImage,
  Pencil,
  Trash2,
  MoreHorizontal,
  ChevronDown,
  DollarSign,
  Building2,
  Zap,
  Truck,
  Users,
  Loader2
} from "lucide-react";
import { 
  fetchExpenses, 
  createExpense, 
  updateExpense, 
  deleteExpense 
} from "@/services/supabase/expenseService";
import { Expense } from "@/types";

function formatCurrency(amount: number): string {
  return `${siteConfig.currency} ${amount.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}`;
}

const expenseCategories = [
  { id: "rent", name: "إيجار", icon: <Building2 className="h-4 w-4" /> },
  { id: "utilities", name: "مرافق", icon: <Zap className="h-4 w-4" /> },
  { id: "salaries", name: "رواتب", icon: <Users className="h-4 w-4" /> },
  { id: "supplies", name: "مستلزمات", icon: <ReceiptText className="h-4 w-4" /> },
  { id: "transport", name: "نقل", icon: <Truck className="h-4 w-4" /> },
  { id: "other", name: "أخرى", icon: <DollarSign className="h-4 w-4" /> }
];

export default function ExpenseManagement() {
  const [search, setSearch] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [formData, setFormData] = useState({
    type: "",
    amount: 0,
    description: "",
    date: new Date().toISOString().split('T')[0],
    receipt_url: ""
  });
  
  const queryClient = useQueryClient();
  
  // Fetch expenses (will be filtered by branch in fetchExpenses)
  const { data: expenses, isLoading, error } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => fetchExpenses()
  });
  
  // Create expense mutation
  const createExpenseMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success("تم إضافة المصروف بنجاح");
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("حدث خطأ أثناء إضافة المصروف");
      console.error("Error creating expense:", error);
    }
  });
  
  // Update expense mutation
  const updateExpenseMutation = useMutation({
    mutationFn: ({ id, expense }: { id: string; expense: Partial<Expense> }) => 
      updateExpense(id, expense),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success("تم تحديث المصروف بنجاح");
      setIsEditDialogOpen(false);
      setSelectedExpense(null);
    },
    onError: (error) => {
      toast.error("حدث خطأ أثناء تحديث المصروف");
      console.error("Error updating expense:", error);
    }
  });
  
  // Delete expense mutation
  const deleteExpenseMutation = useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success("تم حذف المصروف بنجاح");
      setIsDeleteDialogOpen(false);
      setSelectedExpense(null);
    },
    onError: (error) => {
      toast.error("حدث خطأ أثناء حذف المصروف");
      console.error("Error deleting expense:", error);
    }
  });
  
  const resetForm = () => {
    setFormData({
      type: "",
      amount: 0,
      description: "",
      date: new Date().toISOString().split('T')[0],
      receipt_url: ""
    });
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData({
      ...formData,
      [id]: id === "amount" ? parseFloat(value) || 0 : value
    });
  };
  
  const handleAddExpense = () => {
    if (!formData.type || formData.amount <= 0 || !formData.description) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    
    createExpenseMutation.mutate({
      type: formData.type,
      amount: formData.amount,
      description: formData.description,
      date: formData.date,
      receipt_url: formData.receipt_url || null
    });
  };
  
  const handleEditExpense = () => {
    if (!selectedExpense) return;
    
    updateExpenseMutation.mutate({
      id: selectedExpense.id,
      expense: {
        type: formData.type,
        amount: formData.amount,
        description: formData.description,
        date: formData.date,
        receipt_url: formData.receipt_url || null
      }
    });
  };
  
  const handleDeleteExpense = () => {
    if (!selectedExpense) return;
    deleteExpenseMutation.mutate(selectedExpense.id);
  };
  
  const handleEditClick = (expense: Expense) => {
    setSelectedExpense(expense);
    setFormData({
      type: expense.type,
      amount: expense.amount,
      description: expense.description,
      date: new Date(expense.date).toISOString().split('T')[0],
      receipt_url: expense.receipt_url || ""
    });
    setIsEditDialogOpen(true);
  };
  
  const handleDeleteClick = (expense: Expense) => {
    setSelectedExpense(expense);
    setIsDeleteDialogOpen(true);
  };
  
  const filteredExpenses = expenses ? expenses.filter(expense => {
    const matchesSearch = expense.description.toLowerCase().includes(search.toLowerCase()) || 
                          expense.type.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory ? expense.type === selectedCategory : true;
    return matchesSearch && matchesCategory;
  }) : [];
  
  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  
  const expensesByCategory = filteredExpenses.reduce((groups, expense) => {
    const category = expense.type;
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(expense);
    return groups;
  }, {} as Record<string, Expense[]>);
  
  const getTotalByCategory = (category: string) => {
    return (expensesByCategory[category] || []).reduce((sum, expense) => sum + expense.amount, 0);
  };
  
  const getCurrentMonthExpenses = () => {
    const now = new Date();
    return filteredExpenses.filter(expense => {
      const expenseDate = new Date(expense.date);
      return expenseDate.getMonth() === now.getMonth() && 
             expenseDate.getFullYear() === now.getFullYear();
    }).reduce((sum, expense) => sum + expense.amount, 0);
  };
  
  const getLargestExpenseCategory = () => {
    if (Object.keys(expensesByCategory).length === 0) return null;
    
    const categories = Object.keys(expensesByCategory);
    if (categories.length === 0) return null;
    
    return categories.sort((a, b) => 
      getTotalByCategory(b) - getTotalByCategory(a)
    )[0];
  };
  
  const largestCategory = getLargestExpenseCategory();
  
  if (error) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-64">
          <p className="text-destructive text-lg">حدث خطأ أثناء تحميل البيانات</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['expenses'] })}
          >
            إعادة المحاولة
          </Button>
        </div>
      </MainLayout>
    );
  }
  
  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">إدارة المصروفات</h1>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="ml-2 h-4 w-4" />
          إضافة مصروف جديد
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المصروفات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-6 w-24 bg-muted animate-pulse rounded"></div>
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(totalExpenses)}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {isLoading ? (
                <div className="h-4 w-16 bg-muted animate-pulse rounded mt-1"></div>
              ) : (
                `${filteredExpenses.length} مصروف مسجل`
              )}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">مصروفات هذا الشهر</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-6 w-24 bg-muted animate-pulse rounded"></div>
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(getCurrentMonthExpenses())}</div>
            )}
            <p className="text-xs text-muted-foreground">
              في شهر {new Date().toLocaleDateString('ar-EG', { month: 'long' })}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">أكبر فئة مصروفات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <>
                <div className="h-6 w-20 bg-muted animate-pulse rounded"></div>
                <div className="h-4 w-16 bg-muted animate-pulse rounded mt-1"></div>
              </>
            ) : largestCategory ? (
              <>
                <div className="text-2xl font-bold">{largestCategory}</div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(getTotalByCategory(largestCategory))}
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">-</div>
                <p className="text-xs text-muted-foreground">لا يوجد مصاريف</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>قائمة المصروفات</CardTitle>
                  <CardDescription>إدارة وتتبع مصروفات المتجر</CardDescription>
                </div>
                <ReceiptText className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-6">
                <div className="flex-1">
                  <Input 
                    placeholder="ابحث عن مصروف" 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant={selectedCategory ? "default" : "outline"} 
                    className="flex gap-2"
                    onClick={() => setSelectedCategory(null)}
                  >
                    <DollarSign className="h-4 w-4" />
                    <span className="hidden sm:inline">جميع الفئات</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2 mb-4">
                {expenseCategories.map(category => (
                  <Button 
                    key={category.id}
                    variant={selectedCategory === category.name ? "default" : "outline"}
                    className="text-xs"
                    onClick={() => setSelectedCategory(
                      selectedCategory === category.name ? null : category.name
                    )}
                  >
                    {category.icon}
                    <span className="mr-1">{category.name}</span>
                  </Button>
                ))}
              </div>
              
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>النوع</TableHead>
                      <TableHead>الوصف</TableHead>
                      <TableHead>المبلغ</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead className="text-left">خيارات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array(5).fill(0).map((_, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div className="h-4 w-20 bg-muted animate-pulse rounded"></div>
                          </TableCell>
                          <TableCell>
                            <div className="h-4 w-32 bg-muted animate-pulse rounded"></div>
                          </TableCell>
                          <TableCell>
                            <div className="h-4 w-16 bg-muted animate-pulse rounded"></div>
                          </TableCell>
                          <TableCell>
                            <div className="h-4 w-24 bg-muted animate-pulse rounded"></div>
                          </TableCell>
                          <TableCell>
                            <div className="h-4 w-8 bg-muted animate-pulse rounded"></div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : filteredExpenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          لم يتم العثور على مصروفات مطابقة
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredExpenses.map(expense => (
                        <TableRow key={expense.id}>
                          <TableCell>
                            <div className="flex items-center">
                              {expenseCategories.find(cat => cat.name === expense.type)?.icon || 
                                <DollarSign className="h-4 w-4" />
                              }
                              <span className="mr-2">{expense.type}</span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {expense.description}
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(expense.amount)}
                          </TableCell>
                          <TableCell>
                            {new Date(expense.date).toLocaleDateString('ar-EG')}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>خيارات</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleEditClick(expense)}>
                                  <Pencil className="ml-2 h-4 w-4" />
                                  تعديل
                                </DropdownMenuItem>
                                {expense.receipt_url && (
                                  <DropdownMenuItem>
                                    <FileImage className="ml-2 h-4 w-4" />
                                    عرض الإيصال
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem 
                                  className="text-destructive"
                                  onClick={() => handleDeleteClick(expense)}
                                >
                                  <Trash2 className="ml-2 h-4 w-4" />
                                  حذف
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>ملخص المصروفات</CardTitle>
              <CardDescription>
                تحليل المصروفات حسب الفئة
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="space-y-4">
                  {Array(4).fill(0).map((_, index) => (
                    <div key={index}>
                      <div className="flex justify-between items-center mb-1">
                        <div className="h-4 w-24 bg-muted animate-pulse rounded"></div>
                        <div className="h-4 w-16 bg-muted animate-pulse rounded"></div>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full">
                        <div 
                          className="h-2 bg-primary rounded-full animate-pulse" 
                          style={{ width: `${Math.random() * 100}%` }} 
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : Object.keys(expensesByCategory).length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <ReceiptText className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p>لا توجد مصاريف لعرضها</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {Object.entries(expensesByCategory)
                      .sort((a, b) => getTotalByCategory(b[0]) - getTotalByCategory(a[0]))
                      .map(([category, expenses]) => {
                        const categoryTotal = getTotalByCategory(category);
                        const percentage = (categoryTotal / totalExpenses) * 100;
                        
                        return (
                          <div key={category}>
                            <div className="flex justify-between items-center mb-1">
                              <div className="flex items-center">
                                {expenseCategories.find(cat => cat.name === category)?.icon || 
                                  <DollarSign className="h-4 w-4" />
                                }
                                <span className="mr-2 font-medium">{category}</span>
                              </div>
                              <span className="font-medium">{formatCurrency(categoryTotal)}</span>
                            </div>
                            <div className="w-full h-2 bg-gray-100 rounded-full">
                              <div 
                                className="h-2 bg-primary rounded-full" 
                                style={{ width: `${percentage}%` }} 
                              />
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground mt-1">
                              <span>{expenses.length} مصروف</span>
                              <span>{percentage.toFixed(1)}%</span>
                            </div>
                          </div>
                        );
                      })
                    }
                  </div>
                  
                  <div className="pt-4 border-t">
                    <div className="flex justify-between font-medium mb-1">
                      <span>الإجمالي</span>
                      <span>{formatCurrency(totalExpenses)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      إجمالي {filteredExpenses.length} مصروف
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Add Expense Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>إضافة مصروف جديد</DialogTitle>
            <DialogDescription>
              أدخل تفاصيل المصروف الجديد. اضغط حفظ عند الانتهاء.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">نوع المصروف</Label>
                <select 
                  id="type"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2"
                  value={formData.type}
                  onChange={handleInputChange}
                >
                  <option value="">-- اختر النوع --</option>
                  {expenseCategories.map(category => (
                    <option key={category.id} value={category.name}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">المبلغ</Label>
                <div className="relative">
                  <Input 
                    id="amount" 
                    type="number" 
                    min="0"
                    step="0.01"
                    placeholder="0.00" 
                    className="pl-8"
                    value={formData.amount}
                    onChange={handleInputChange}
                  />
                  <span className="absolute left-3 top-2.5 text-muted-foreground">
                    {siteConfig.currency}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="date">التاريخ</Label>
              <Input 
                id="date" 
                type="date" 
                value={formData.date}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">الوصف</Label>
              <Textarea 
                id="description" 
                placeholder="أدخل وصفاً للمصروف" 
                rows={3}
                value={formData.description}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="receipt_url">رابط الإيصال (اختياري)</Label>
              <Input 
                id="receipt_url" 
                placeholder="أدخل رابط الإيصال"
                value={formData.receipt_url}
                onChange={handleInputChange}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              type="submit" 
              onClick={handleAddExpense}
              disabled={createExpenseMutation.isPending}
            >
              {createExpenseMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جارِ الحفظ...
                </>
              ) : "حفظ المصروف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Expense Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>تعديل المصروف</DialogTitle>
            <DialogDescription>
              قم بتعديل تفاصيل المصروف. اضغط حفظ عند الانتهاء.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">نوع المصروف</Label>
                <select 
                  id="type"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2"
                  value={formData.type}
                  onChange={handleInputChange}
                >
                  <option value="">-- اختر النوع --</option>
                  {expenseCategories.map(category => (
                    <option key={category.id} value={category.name}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">المبلغ</Label>
                <div className="relative">
                  <Input 
                    id="amount" 
                    type="number" 
                    min="0"
                    step="0.01"
                    placeholder="0.00" 
                    className="pl-8"
                    value={formData.amount}
                    onChange={handleInputChange}
                  />
                  <span className="absolute left-3 top-2.5 text-muted-foreground">
                    {siteConfig.currency}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="date">التاريخ</Label>
              <Input 
                id="date" 
                type="date" 
                value={formData.date}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">الوصف</Label>
              <Textarea 
                id="description" 
                placeholder="أدخل وصفاً للمصروف" 
                rows={3}
                value={formData.description}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="receipt_url">رابط الإيصال (اختياري)</Label>
              <Input 
                id="receipt_url" 
                placeholder="أدخل رابط الإيصال"
                value={formData.receipt_url}
                onChange={handleInputChange}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              type="submit" 
              onClick={handleEditExpense}
              disabled={updateExpenseMutation.isPending}
            >
              {updateExpenseMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جارِ التحديث...
                </>
              ) : "حفظ التغييرات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Expense Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>حذف المصروف</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من رغبتك في حذف هذا المصروف؟ هذا الإجراء لا يمكن التراجع عنه.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteExpense}
              disabled={deleteExpenseMutation.isPending}
            >
              {deleteExpenseMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جارِ الحذف...
                </>
              ) : "حذف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
