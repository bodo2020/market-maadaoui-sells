
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Banknote, 
  ArrowUpRight, 
  ArrowDownLeft, 
  DollarSign, 
  TrendingUp,
  Receipt,
  Calendar,
  CreditCard,
  LineChart
} from "lucide-react";
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
  Legend
} from "recharts";
import { format } from "date-fns";
import { 
  fetchFinancialSummary, 
  fetchMonthlyRevenue, 
  fetchExpensesByCategory, 
  fetchRecentTransactions,
  fetchAllTransactions
} from "@/services/supabase/financeService";

function formatCurrency(amount: number): string {
  return `${siteConfig.currency} ${amount.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}`;
}

export default function Finance() {
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">("month");
  
  // Fetch financial summary data
  const { data: summaryData, isLoading: isLoadingSummary } = useQuery({
    queryKey: ['financialSummary', period],
    queryFn: () => fetchFinancialSummary(period)
  });
  
  // Fetch revenue data
  const { data: revenueData, isLoading: isLoadingRevenue } = useQuery({
    queryKey: ['monthlyRevenue', period],
    queryFn: () => fetchMonthlyRevenue(period)
  });
  
  // Fetch expense data
  const { data: expenseData, isLoading: isLoadingExpenses } = useQuery({
    queryKey: ['expensesByCategory', period],
    queryFn: () => fetchExpensesByCategory(period)
  });
  
  // Fetch recent transactions
  const { data: recentTransactions, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['recentTransactions'],
    queryFn: () => fetchRecentTransactions(6)
  });
  
  // Fetch all transactions for the transactions tab
  const { data: allTransactions, isLoading: isLoadingAllTransactions } = useQuery({
    queryKey: ['allTransactions'],
    queryFn: fetchAllTransactions
  });
  
  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">الإدارة المالية</h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الإيرادات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <div className="text-2xl font-bold animate-pulse">تحميل...</div>
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(summaryData?.totalRevenue || 0)}</div>
                <div className="flex items-center text-xs text-green-500 mt-1">
                  <ArrowUpRight className="h-3 w-3 ml-1" />
                  <span>من المبيعات</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المصروفات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <div className="text-2xl font-bold animate-pulse">تحميل...</div>
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(summaryData?.totalExpenses || 0)}</div>
                <div className="flex items-center text-xs text-red-500 mt-1">
                  <ArrowDownLeft className="h-3 w-3 ml-1" />
                  <span>من المصروفات</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">صافي الربح</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <div className="text-2xl font-bold animate-pulse">تحميل...</div>
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(summaryData?.netProfit || 0)}</div>
                <div className="flex items-center text-xs text-green-500 mt-1">
                  <TrendingUp className="h-3 w-3 ml-1" />
                  <span>بنسبة {(summaryData?.profitMargin || 0).toFixed(1)}%</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">رصيد الصندوق</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <div className="text-2xl font-bold animate-pulse">تحميل...</div>
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(summaryData?.cashBalance || 0)}</div>
                <div className="flex items-center text-xs text-muted-foreground mt-1">
                  <CreditCard className="h-3 w-3 ml-1" />
                  <span>محدث {format(new Date(), "yyyy/MM/dd")}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="revenue">الإيرادات</TabsTrigger>
          <TabsTrigger value="expenses">المصروفات</TabsTrigger>
          <TabsTrigger value="transactions">المعاملات</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>توزيع الإيرادات</CardTitle>
                <CardDescription>إجمالي الإيرادات حسب الشهر</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {isLoadingRevenue ? (
                    <div className="h-full w-full flex items-center justify-center">
                      <div className="text-lg text-muted-foreground">تحميل البيانات...</div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value: number) => formatCurrency(value)} 
                          labelFormatter={(label) => `شهر ${label}`}
                        />
                        <Bar dataKey="amount" fill="#8b5cf6" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>توزيع المصروفات</CardTitle>
                <CardDescription>إجمالي المصروفات حسب الفئة</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {isLoadingExpenses ? (
                    <div className="h-full w-full flex items-center justify-center">
                      <div className="text-lg text-muted-foreground">تحميل البيانات...</div>
                    </div>
                  ) : expenseData && expenseData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <Pie
                          data={expenseData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                          nameKey="name"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {expenseData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <div className="text-lg text-muted-foreground">لا توجد مصروفات لعرضها</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>المعاملات الأخيرة</CardTitle>
              <CardDescription>آخر المعاملات المالية</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingTransactions ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse"></div>
                  ))}
                </div>
              ) : recentTransactions && recentTransactions.length > 0 ? (
                <div className="space-y-2">
                  {recentTransactions.map(transaction => (
                    <div 
                      key={transaction.id} 
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${
                          transaction.type === "income" ? "bg-green-100" : "bg-red-100"
                        }`}>
                          {transaction.type === "income" ? (
                            <Banknote className="h-5 w-5 text-green-600" />
                          ) : (
                            <Receipt className="h-5 w-5 text-red-600" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium">{transaction.description}</div>
                          <div className="text-xs text-muted-foreground flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {format(new Date(transaction.date), "yyyy/MM/dd")}
                          </div>
                        </div>
                      </div>
                      <div className={`font-bold ${
                        transaction.type === "income" ? "text-green-600" : "text-red-600"
                      }`}>
                        {transaction.type === "income" ? "+" : "-"}
                        {formatCurrency(transaction.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  لا توجد معاملات لعرضها
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>تحليل الإيرادات</CardTitle>
              <CardDescription>بيانات الإيرادات التفصيلية</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                {isLoadingRevenue ? (
                  <div className="h-full w-full flex items-center justify-center">
                    <div className="text-lg text-muted-foreground">تحميل البيانات...</div>
                  </div>
                ) : revenueData && revenueData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip 
                        formatter={(value: number) => formatCurrency(value)} 
                        labelFormatter={(label) => `شهر ${label}`}
                      />
                      <Legend />
                      <Bar dataKey="amount" name="الإيرادات" fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <div className="text-lg text-muted-foreground">لا توجد إيرادات لعرضها</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="expenses" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>تحليل المصروفات</CardTitle>
              <CardDescription>بيانات المصروفات التفصيلية</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                {isLoadingExpenses ? (
                  <div className="h-full w-full flex items-center justify-center">
                    <div className="text-lg text-muted-foreground">تحميل البيانات...</div>
                  </div>
                ) : expenseData && expenseData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 10, right: 30, left: 30, bottom: 0 }}>
                      <Pie
                        data={expenseData}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        outerRadius={150}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                        label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                      >
                        {expenseData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <div className="text-lg text-muted-foreground">لا توجد مصروفات لعرضها</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>سجل المعاملات</CardTitle>
              <CardDescription>جميع المعاملات المالية</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingAllTransactions ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                    <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse"></div>
                  ))}
                </div>
              ) : allTransactions && allTransactions.length > 0 ? (
                <div className="space-y-4">
                  {allTransactions.map((transaction) => (
                    <div 
                      key={transaction.id} 
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${
                          transaction.type === "income" ? "bg-green-100" : "bg-red-100"
                        }`}>
                          {transaction.type === "income" ? (
                            <Banknote className="h-5 w-5 text-green-600" />
                          ) : (
                            <Receipt className="h-5 w-5 text-red-600" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium">{transaction.description}</div>
                          <div className="text-xs text-muted-foreground flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {format(new Date(transaction.date), "yyyy/MM/dd")}
                          </div>
                        </div>
                      </div>
                      <div className={`font-bold ${
                        transaction.type === "income" ? "text-green-600" : "text-red-600"
                      }`}>
                        {transaction.type === "income" ? "+" : "-"}
                        {formatCurrency(transaction.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  لا توجد معاملات لعرضها
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
