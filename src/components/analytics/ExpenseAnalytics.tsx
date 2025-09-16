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
import { PeriodType, getDateRangeFromPeriod } from "@/components/analytics/PeriodFilter";

interface ExpenseData {
  id: string;
  amount: number;
  description: string;
  type: string;
  date: string;
  category?: string;
}

interface ExpenseTypeData {
  type: string;
  amount: number;
  count: number;
  percentage: number;
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
  employee_id: string;
  notes?: string;
  month: number;
  year: number;
  status: string;
  payment_date?: string;
}

interface ExpenseAnalyticsProps {
  selectedPeriod: PeriodType;
}

export function ExpenseAnalytics({ selectedPeriod }: ExpenseAnalyticsProps) {
  const selectedDateRange = getDateRangeFromPeriod(selectedPeriod);
  const [expenses, setExpenses] = useState<ExpenseData[]>([]);
  const [salaries, setSalaries] = useState<SalaryData[]>([]);
  const [damageStats, setDamageStats] = useState({ totalCost: 0, totalQuantity: 0, recordsCount: 0 });
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: selectedDateRange.from || startOfMonth(new Date()),
    to: selectedDateRange.to || endOfMonth(new Date())
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
      const filteredExpenses = expensesData.filter(expense => {
        if (!dateRange?.from || !dateRange?.to) return true;
        const expenseDate = new Date(expense.date);
        return expenseDate >= dateRange.from && expenseDate <= dateRange.to;
      });

      // Filter salaries by date range
      const filteredSalaries = salariesData.filter(salary => {
        if (!dateRange?.from || !dateRange?.to || !salary.payment_date) return true;
        const salaryDate = new Date(salary.payment_date);
        return salaryDate >= dateRange.from && salaryDate <= dateRange.to;
      });

      setExpenses(filteredExpenses);
      setSalaries(filteredSalaries);
      setDamageStats(damageData);
    } catch (error) {
      console.error('Error loading expense data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dateRange]);

  useEffect(() => {
    setDateRange({
      from: selectedDateRange.from || startOfMonth(new Date()),
      to: selectedDateRange.to || endOfMonth(new Date())
    });
  }, [selectedPeriod, selectedDateRange]);

  // Calculate totals
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalSalaries = salaries.reduce((sum, salary) => sum + salary.amount, 0);
  const grandTotal = totalExpenses + totalSalaries + damageStats.totalCost;
  const expenseCount = expenses.length;
  const avgExpense = expenseCount > 0 ? totalExpenses / expenseCount : 0;

  // Process expenses by type including salaries
  const expensesByType: ExpenseTypeData[] = [];
  const expenseTypeMap = new Map<string, { amount: number; count: number }>();

  // Process regular expenses
  expenses.forEach(expense => {
    const existing = expenseTypeMap.get(expense.type) || { amount: 0, count: 0 };
    expenseTypeMap.set(expense.type, {
      amount: existing.amount + expense.amount,
      count: existing.count + 1
    });
  });

  // Add salaries as a separate type
  if (totalSalaries > 0) {
    expenseTypeMap.set('الرواتب', {
      amount: totalSalaries,
      count: salaries.length
    });
  }

  // Convert to array and add colors
  expenseTypeMap.forEach((data, type) => {
    expensesByType.push({
      type,
      amount: data.amount,
      count: data.count,
      percentage: (data.amount / grandTotal) * 100,
      color: getTypeColor(type)
    });
  });

  expensesByType.sort((a, b) => b.amount - a.amount);

  // Generate monthly data for the last 6 months
  const monthlyData: MonthlyExpenseData[] = [];
  for (let i = 5; i >= 0; i--) {
    const date = subDays(new Date(), i * 30);
    const monthKey = format(date, 'MMM yyyy', { locale: ar });
    
    const monthExpenses = expenses
      .filter(expense => format(new Date(expense.date), 'MMM yyyy', { locale: ar }) === monthKey)
      .reduce((sum, expense) => sum + expense.amount, 0);
    
    const monthSalaries = salaries
      .filter(salary => salary.payment_date && format(new Date(salary.payment_date), 'MMM yyyy', { locale: ar }) === monthKey)
      .reduce((sum, salary) => sum + salary.amount, 0);
    
    // For simplicity, distribute damages evenly across months
    const monthDamages = damageStats.totalCost / 6;
    
    monthlyData.push({
      month: monthKey,
      expenses: monthExpenses,
      damages: monthDamages,
      salaries: monthSalaries,
      total: monthExpenses + monthSalaries + monthDamages
    });
  }

  function getTypeColor(type: string): string {
    const colors = [
      'hsl(var(--primary))',
      'hsl(var(--secondary))', 
      'hsl(var(--accent))',
      'hsl(var(--destructive))',
      '#8884d8',
      '#82ca9d',
      '#ffc658',
      '#ff7300',
      '#00ff00',
      '#ff00ff'
    ];
    const index = Array.from(expenseTypeMap.keys()).indexOf(type);
    return colors[index % colors.length];
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg">جاري تحميل بيانات المصروفات...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Range Picker and Refresh Button */}
      <div className="flex items-center justify-between">
        <DateRangePicker
          from={dateRange?.from || new Date()}
          to={dateRange?.to || new Date()}
          onSelect={setDateRange}
          className="w-auto"
        />
        <Button onClick={loadData} variant="outline">
          تحديث البيانات
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              إجمالي المصروفات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatCurrency(totalExpenses)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              إجمالي الرواتب
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(totalSalaries)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              الإجمالي العام
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(grandTotal)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              الأضرار
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(damageStats.totalCost)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4" />
              أنواع المصروفات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{expensesByType.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <Tabs defaultValue="monthly" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="monthly">الاتجاه الشهري</TabsTrigger>
          <TabsTrigger value="types">حسب النوع</TabsTrigger>
          <TabsTrigger value="breakdown">التفصيل</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>الاتجاه الشهري للمصروفات</CardTitle>
              <CardDescription>توزيع المصروفات والرواتب والأضرار على مدى الأشهر الستة الماضية</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === 'expenses' ? 'المصروفات' : 
                      name === 'salaries' ? 'الرواتب' : 
                      name === 'damages' ? 'الأضرار' : 'الإجمالي'
                    ]}
                  />
                  <Bar dataKey="expenses" fill="hsl(var(--destructive))" name="expenses" />
                  <Bar dataKey="salaries" fill="hsl(var(--primary))" name="salaries" />
                  <Bar dataKey="damages" fill="hsl(var(--secondary))" name="damages" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="types" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                      labelLine={false}
                      label={({ type, percentage }) => `${type}: ${percentage.toFixed(1)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="amount"
                    >
                      {expensesByType.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>أعلى 5 أنواع مصروفات</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={expensesByType.slice(0, 5)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="amount" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>تفصيل المصروفات حسب النوع</CardTitle>
              <CardDescription>قائمة شاملة بجميع أنواع المصروفات ومساهمتها في الإجمالي</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {expensesByType.map((expense, index) => (
                  <div key={expense.type} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: expense.color }}
                      />
                      <div>
                        <div className="font-medium">{expense.type}</div>
                        <div className="text-sm text-muted-foreground">
                          {expense.count} عنصر
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatCurrency(expense.amount)}</div>
                      <div className="text-sm text-muted-foreground">
                        {expense.percentage.toFixed(1)}% من الإجمالي
                      </div>
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