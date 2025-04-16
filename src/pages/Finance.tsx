
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

// Mock data for the finance page
const revenueData = [
  { name: "يناير", amount: 12000 },
  { name: "فبراير", amount: 19000 },
  { name: "مارس", amount: 15000 },
  { name: "أبريل", amount: 25000 },
  { name: "مايو", amount: 22000 },
  { name: "يونيو", amount: 30000 }
];

const expenseData = [
  { name: "إيجار", value: 5000, color: "#4338ca" },
  { name: "مرافق", value: 2000, color: "#6366f1" },
  { name: "رواتب", value: 10000, color: "#8b5cf6" },
  { name: "مستلزمات", value: 3000, color: "#a855f7" },
  { name: "نقل", value: 1500, color: "#d946ef" },
  { name: "أخرى", value: 2500, color: "#ec4899" }
];

const recentTransactions = [
  { id: 1, type: "income", description: "مبيعات اليوم", amount: 2450, date: "2025-04-15" },
  { id: 2, type: "expense", description: "شراء مخزون", amount: 1200, date: "2025-04-14" },
  { id: 3, type: "income", description: "مبيعات اليوم", amount: 1850, date: "2025-04-13" },
  { id: 4, type: "expense", description: "رواتب الموظفين", amount: 3500, date: "2025-04-12" },
  { id: 5, type: "expense", description: "فاتورة الكهرباء", amount: 450, date: "2025-04-11" },
  { id: 6, type: "income", description: "مبيعات اليوم", amount: 2100, date: "2025-04-10" }
];

function formatCurrency(amount: number): string {
  return `${siteConfig.currency} ${amount.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}`;
}

export default function Finance() {
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">("month");
  
  // Calculate summary data
  const totalRevenue = revenueData.reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = expenseData.reduce((sum, item) => sum + item.value, 0);
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = (netProfit / totalRevenue) * 100;
  
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
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
            <div className="flex items-center text-xs text-green-500 mt-1">
              <ArrowUpRight className="h-3 w-3 ml-1" />
              <span>بزيادة 8.2%</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المصروفات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalExpenses)}</div>
            <div className="flex items-center text-xs text-red-500 mt-1">
              <ArrowDownLeft className="h-3 w-3 ml-1" />
              <span>بزيادة 4.1%</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">صافي الربح</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(netProfit)}</div>
            <div className="flex items-center text-xs text-green-500 mt-1">
              <TrendingUp className="h-3 w-3 ml-1" />
              <span>بنسبة {profitMargin.toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">رصيد الصندوق</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(35000)}</div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              <CreditCard className="h-3 w-3 ml-1" />
              <span>محدث {format(new Date(), "yyyy/MM/dd")}</span>
            </div>
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
              <div className="space-y-4">
                {[...recentTransactions, ...recentTransactions].map((transaction, index) => (
                  <div 
                    key={`${transaction.id}-${index}`} 
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
