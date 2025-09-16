import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Button } from "@/components/ui/button";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from "recharts";
import { CalendarIcon, TrendingDown, DollarSign, FileText, AlertTriangle } from "lucide-react";
import { fetchExpenses } from "@/services/supabase/expenseService";
import { getDamageStatistics } from "@/services/supabase/damageService";
import { fetchSalaries } from "@/services/supabase/salaryService";
import { DateRange } from "react-day-picker";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ar } from "date-fns/locale";

interface ExpenseData {
  id: string;
  type: string;
  amount: number;
  date: string;
  description: string;
}

interface ExpenseTypeData {
  type: string;
  amount: number;
  count: number;
  color: string;
}

interface MonthlyExpenseData {
  month: string;
  expenses: number;
  damages: number;
  salaries: number;
  total: number;
}

interface SalaryData {
  id: string;
  amount: number;
  month: number;
  year: number;
  status: string;
  payment_date?: string;
}

export function ExpenseAnalytics() {
  const [expenses, setExpenses] = useState<ExpenseData[]>([]);
  const [salaries, setSalaries] = useState<SalaryData[]>([]);
  const [damageStats, setDamageStats] = useState({ totalCost: 0, totalQuantity: 0, recordsCount: 0 });
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [expensesData, salariesData, damageData] = await Promise.all([
        fetchExpenses(),
        fetchSalaries(),
        getDamageStatistics(
          dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
          dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined
        )
      ]);

      // Filter expenses by date range
      let filteredExpenses = expensesData;
      if (dateRange?.from && dateRange?.to) {
        filteredExpenses = expensesData.filter(expense => {
          const expenseDate = new Date(expense.date);
          return expenseDate >= dateRange.from! && expenseDate <= dateRange.to!;
        });
      }

      // Filter salaries by date range (using payment_date or created_at)
      let filteredSalaries = salariesData;
      if (dateRange?.from && dateRange?.to) {
        filteredSalaries = salariesData.filter(salary => {
          // Convert month/year to a comparable date
          const salaryDate = new Date(salary.year, salary.month - 1, 1);
          return salaryDate >= dateRange.from! && salaryDate <= dateRange.to!;
        });
      }

      setExpenses(filteredExpenses);
      setSalaries(filteredSalaries);
      setDamageStats(damageData);
    } catch (error) {
      console.error("Error loading expense analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dateRange]);

  // Calculate expense statistics
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalSalaries = salaries.reduce((sum, salary) => sum + salary.amount, 0);
  const grandTotal = totalExpenses + totalSalaries;
  const expenseCount = expenses.length;
  const avgExpense = expenseCount > 0 ? totalExpenses / expenseCount : 0;

  // Group expenses by type and include salaries
  const expensesByType = expenses.reduce((acc, expense) => {
    const existing = acc.find(item => item.type === expense.type);
    if (existing) {
      existing.amount += expense.amount;
      existing.count += 1;
    } else {
      acc.push({
        type: expense.type,
        amount: expense.amount,
        count: 1,
        color: getTypeColor(expense.type)
      });
    }
    return acc;
  }, [] as ExpenseTypeData[]);

  // Add salaries as a separate category
  if (salaries.length > 0) {
    expensesByType.push({
      type: "رواتب",
      amount: totalSalaries,
      count: salaries.length,
      color: getTypeColor("رواتب")
    });
  }

  // Generate monthly data for the last 6 months
  const monthlyData: MonthlyExpenseData[] = [];
  for (let i = 5; i >= 0; i--) {
    const date = subDays(new Date(), i * 30);
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    
    const monthExpenses = expenses.filter(expense => {
      const expenseDate = new Date(expense.date);
      return expenseDate >= monthStart && expenseDate <= monthEnd;
    });

    const monthSalaries = salaries.filter(salary => {
      const salaryDate = new Date(salary.year, salary.month - 1, 1);
      return salaryDate >= monthStart && salaryDate <= monthEnd;
    });

    const monthlyExpenseTotal = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const monthlyDamageTotal = monthExpenses
      .filter(expense => expense.type === "منتج تالف")
      .reduce((sum, expense) => sum + expense.amount, 0);
    const monthlySalariesTotal = monthSalaries.reduce((sum, salary) => sum + salary.amount, 0);

    monthlyData.push({
      month: format(date, 'MMM yyyy', { locale: ar }),
      expenses: monthlyExpenseTotal - monthlyDamageTotal,
      damages: monthlyDamageTotal,
      salaries: monthlySalariesTotal,
      total: monthlyExpenseTotal + monthlySalariesTotal
    });
  }

  function getTypeColor(type: string): string {
    const colors = {
      "منتج تالف": "#ef4444",
      "صيانة": "#f97316", 
      "مرافق": "#eab308",
      "رواتب": "#06b6d4",
      "راتب": "#06b6d4",
      "أخرى": "#8b5cf6"
    };
    return colors[type as keyof typeof colors] || "#64748b";
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4" />
          <DateRangePicker
            from={dateRange?.from || new Date()}
            to={dateRange?.to || new Date()}
            onSelect={setDateRange}
          />
        </div>
        <Button onClick={loadData} variant="outline" size="sm">
          تحديث البيانات
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المصروفات</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalExpenses.toFixed(2)} ج.م</div>
            <p className="text-xs text-muted-foreground">
              {expenseCount} مصروف
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الرواتب</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{totalSalaries.toFixed(2)} ج.م</div>
            <p className="text-xs text-muted-foreground">
              {salaries.length} راتب
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المجموع الكلي</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{grandTotal.toFixed(2)} ج.م</div>
            <p className="text-xs text-muted-foreground">
              مصروفات + رواتب
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">التوالف</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{damageStats.totalCost.toFixed(2)} ج.م</div>
            <p className="text-xs text-muted-foreground">
              {damageStats.recordsCount} منتج تالف
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">أنواع المصروفات</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{expensesByType.length}</div>
            <p className="text-xs text-muted-foreground">
              نوع مختلف
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="monthly" className="space-y-4">
        <TabsList>
          <TabsTrigger value="monthly">التطور الشهري</TabsTrigger>
          <TabsTrigger value="types">حسب النوع</TabsTrigger>
          <TabsTrigger value="breakdown">التفصيل</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>تطور المصروفات والرواتب الشهرية</CardTitle>
              <CardDescription>مقارنة المصروفات العادية مع التوالف والرواتب</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value, name) => [
                      `${Number(value).toFixed(2)} ج.م`,
                      name === 'expenses' ? 'مصروفات عادية' : 
                      name === 'damages' ? 'توالف' : 
                      name === 'salaries' ? 'رواتب' : 'المجموع'
                    ]}
                  />
                  <Bar dataKey="expenses" fill="#3b82f6" name="مصروفات عادية" />
                  <Bar dataKey="damages" fill="#ef4444" name="توالف" />
                  <Bar dataKey="salaries" fill="#06b6d4" name="رواتب" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="types" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>توزيع المصروفات حسب النوع</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={expensesByType}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="amount"
                      label={({ type, percent }) => `${type} (${(percent * 100).toFixed(1)}%)`}
                    >
                      {expensesByType.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${Number(value).toFixed(2)} ج.م`, 'المبلغ']} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>أكثر أنواع المصروفات</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={expensesByType.slice(0, 5)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`${Number(value).toFixed(2)} ج.م`, 'المبلغ']} />
                    <Bar dataKey="amount" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>تفصيل المصروفات حسب النوع</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {expensesByType.map((typeData, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: typeData.color }}
                      />
                      <div>
                        <p className="font-medium">{typeData.type}</p>
                        <p className="text-sm text-muted-foreground">{typeData.count} مصروف</p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="font-bold">{typeData.amount.toFixed(2)} ج.م</p>
                      <p className="text-sm text-muted-foreground">
                        {((typeData.amount / grandTotal) * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}