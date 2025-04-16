import { useState } from "react";
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
  Users
} from "lucide-react";
import { expenses, formatCurrency } from "@/data/mockData";
import { Expense } from "@/types";

// Expense categories
const expenseCategories = [
  { id: "rent", name: "إيجار", icon: <Building2 className="h-4 w-4" /> },
  { id: "utilities", name: "مرافق", icon: <Zap className="h-4 w-4" /> },
  { id: "salaries", name: "رواتب", icon: <Users className="h-4 w-4" /> },
  { id: "supplies", name: "مستلزمات", icon: <ReceiptText className="h-4 w-4" /> },
  { id: "transport", name: "نقل", icon: <Truck className="h-4 w-4" /> },
  { id: "other", name: "أخرى", icon: <DollarSign className="h-4 w-4" /> }
];

export default function ExpenseManagement() {
  const [allExpenses, setAllExpenses] = useState<Expense[]>(expenses);
  const [search, setSearch] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Filtered expenses based on search and category
  const filteredExpenses = allExpenses.filter(expense => {
    const matchesSearch = expense.description.includes(search) || 
                          expense.type.includes(search);
    const matchesCategory = selectedCategory ? expense.type === selectedCategory : true;
    return matchesSearch && matchesCategory;
  });
  
  // Calculate total expenses
  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  
  // Group expenses by category
  const expensesByCategory = filteredExpenses.reduce((groups, expense) => {
    const category = expense.type;
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(expense);
    return groups;
  }, {} as Record<string, Expense[]>);
  
  // Get total by category
  const getTotalByCategory = (category: string) => {
    return (expensesByCategory[category] || []).reduce((sum, expense) => sum + expense.amount, 0);
  };
  
  // Functions to handle adding a new expense
  const handleAddExpense = () => {
    // In a real app, this would validate and add the expense to the database
    setIsAddDialogOpen(false);
  };
  
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
            <div className="text-2xl font-bold">{formatCurrency(totalExpenses)}</div>
            <p className="text-xs text-muted-foreground">
              {filteredExpenses.length} مصروف مسجل
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">مصروفات هذا الشهر</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(
                filteredExpenses.filter(expense => {
                  const now = new Date();
                  const expenseDate = new Date(expense.date);
                  return expenseDate.getMonth() === now.getMonth() && 
                         expenseDate.getFullYear() === now.getFullYear();
                }).reduce((sum, expense) => sum + expense.amount, 0)
              )}
            </div>
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
            {Object.keys(expensesByCategory).length > 0 ? (
              <>
                <div className="text-2xl font-bold">
                  {Object.entries(expensesByCategory)
                    .sort((a, b) => 
                      getTotalByCategory(b[0]) - getTotalByCategory(a[0])
                    )[0][0]}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(
                    Math.max(...Object.keys(expensesByCategory).map(category => 
                      getTotalByCategory(category)
                    ))
                  )}
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
        {/* Expense List */}
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
                  <Button variant="outline" className="flex gap-2">
                    <Calendar className="h-4 w-4" />
                    <span className="hidden sm:inline">تاريخ</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
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
                    variant={selectedCategory === category.id ? "default" : "outline"}
                    className="text-xs"
                    onClick={() => setSelectedCategory(
                      selectedCategory === category.id ? null : category.id
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
                    {filteredExpenses.length === 0 ? (
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
                                <DropdownMenuItem>
                                  <Pencil className="ml-2 h-4 w-4" />
                                  تعديل
                                </DropdownMenuItem>
                                {expense.receiptUrl && (
                                  <DropdownMenuItem>
                                    <FileImage className="ml-2 h-4 w-4" />
                                    عرض الإيصال
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem className="text-destructive">
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
        
        {/* Expense Summary */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>ملخص المصروفات</CardTitle>
              <CardDescription>
                تحليل المصروفات حسب الفئة
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {Object.keys(expensesByCategory).length === 0 ? (
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
                <Label htmlFor="expenseType">نوع المصروف</Label>
                <select 
                  id="expenseType"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2"
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
                    placeholder="0.00" 
                    className="pl-8"
                  />
                  <span className="absolute left-3 top-2.5 text-muted-foreground">
                    {siteConfig.currency}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="date">التاريخ</Label>
              <Input id="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">الوصف</Label>
              <Textarea 
                id="description" 
                placeholder="أدخل وصفاً للمصروف" 
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="receipt">إرفاق إيصال (اختياري)</Label>
              <Input id="receipt" type="file" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" onClick={handleAddExpense}>حفظ المصروف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
