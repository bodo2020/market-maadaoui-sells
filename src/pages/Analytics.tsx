import MainLayout from "@/components/layout/MainLayout";
import { ProductAnalytics } from "@/components/crm/ProductAnalytics";
import { CustomerAnalytics } from "@/components/crm/CustomerAnalytics";
import { OnlineOrdersHeatmap } from "@/components/analytics/OnlineOrdersHeatmap";
import { POSSalesHeatmap } from "@/components/analytics/POSSalesHeatmap";
import { ExpenseAnalytics } from "@/components/analytics/ExpenseAnalytics";
import { RevenueAnalytics } from "@/components/analytics/RevenueAnalytics";
import { PeriodFilter, PeriodType, getDateRangeFromPeriod, getPeriodLabel } from "@/components/analytics/PeriodFilter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, ShoppingCart, Package, Receipt, DollarSign, CreditCard, Download, Sparkles } from "lucide-react";
import { exportComprehensiveAnalyticsReport } from "@/services/excelExportService";
import { toast } from "sonner";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Analytics() {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("month");
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState("product-analytics");

  const handleExportReport = async () => {
    try {
      toast.loading("جاري إنشاء التقرير...");
      const dateRange = getDateRangeFromPeriod(selectedPeriod);
      await exportComprehensiveAnalyticsReport(dateRange, selectedPeriod);
      toast.success("تم تصدير التقرير بنجاح!");
    } catch (error) {
      console.error("Error exporting report:", error);
      toast.error("حدث خطأ في تصدير التقرير");
    }
  };

  const handleAIAnalysis = async () => {
    setIsAnalyzing(true);
    setAiInsights(null);
    
    try {
      toast.loading("جاري تحليل البيانات بالذكاء الاصطناعي...");
      
      // Fetch relevant data based on active tab
      const dateRange = getDateRangeFromPeriod(selectedPeriod);
      let analyticsData: any = {};
      let analysisType = '';

      if (activeTab === 'product-analytics') {
        // Fetch product analytics data
        const { data: sales } = await supabase
          .from('sales')
          .select('items, total, profit, date')
          .gte('date', dateRange.from?.toISOString())
          .lte('date', dateRange.to?.toISOString());
        analyticsData = { sales };
        analysisType = 'products';
      } else if (activeTab === 'customer-analytics') {
        // Fetch customer analytics data
        const { data: customers } = await supabase
          .from('customers')
          .select('*');
        const { data: orders } = await supabase
          .from('online_orders')
          .select('*')
          .gte('created_at', dateRange.from?.toISOString())
          .lte('created_at', dateRange.to?.toISOString());
        analyticsData = { customers, orders };
        analysisType = 'customers';
      } else if (activeTab === 'revenue-analytics') {
        // Fetch revenue data
        const { data: sales } = await supabase
          .from('sales')
          .select('total, profit, date')
          .gte('date', dateRange.from?.toISOString())
          .lte('date', dateRange.to?.toISOString());
        const { data: expenses } = await supabase
          .from('expenses')
          .select('amount, type, date')
          .gte('date', dateRange.from?.toISOString())
          .lte('date', dateRange.to?.toISOString());
        analyticsData = { sales, expenses };
        analysisType = 'revenue';
      } else if (activeTab === 'expense-analytics') {
        // Fetch expense data
        const { data: expenses } = await supabase
          .from('expenses')
          .select('*')
          .gte('date', dateRange.from?.toISOString())
          .lte('date', dateRange.to?.toISOString());
        analyticsData = { expenses };
        analysisType = 'expenses';
      }

      const { data, error } = await supabase.functions.invoke('analyze-data', {
        body: { analyticsData, analysisType }
      });

      if (error) throw error;

      setAiInsights(data.insights);
      toast.success("تم التحليل بنجاح!");
    } catch (error: any) {
      console.error("Error analyzing data:", error);
      toast.error(error.message || "حدث خطأ في التحليل");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">التحليلات</h1>
              <p className="text-muted-foreground mt-2">
                تحليلات شاملة للمبيعات والعملاء والطلبات
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAIAnalysis} disabled={isAnalyzing} className="flex items-center gap-2">
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                تحليل بالذكاء الاصطناعي
              </Button>
              <Button onClick={handleExportReport} className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                تصدير تقرير شامل
              </Button>
            </div>
          </div>
          
          <PeriodFilter 
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
          />
        </div>

        {aiInsights && (
          <Alert className="bg-primary/5 border-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
            <AlertDescription className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
              {aiInsights}
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="product-analytics" className="space-y-4" onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="product-analytics" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              تحليلات المنتجات
            </TabsTrigger>
            <TabsTrigger value="customer-analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              تحليلات العملاء
            </TabsTrigger>
            <TabsTrigger value="online-orders-heatmap" className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              ساعات العمل - أونلاين
            </TabsTrigger>
            <TabsTrigger value="pos-sales-heatmap" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              ساعات العمل - كاشير
            </TabsTrigger>
            <TabsTrigger value="expense-analytics" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              تحليلات المصروفات
            </TabsTrigger>
            <TabsTrigger value="revenue-analytics" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              تحليلات الإيرادات
            </TabsTrigger>
          </TabsList>

          <TabsContent value="product-analytics" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>تحليلات المنتجات والمبيعات</CardTitle>
                <CardDescription>
                  إحصائيات شاملة عن أداء المنتجات والفئات
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProductAnalytics />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customer-analytics" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>تحليلات العملاء</CardTitle>
                <CardDescription>
                  إحصائيات شاملة عن سلوك العملاء ومبيعاتهم
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CustomerAnalytics />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="online-orders-heatmap" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>ساعات العمل - الطلبات الأونلاين</CardTitle>
                <CardDescription>
                  توزيع الطلبات الأونلاين حسب الوقت والأيام لفهم أوقات الذروة
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OnlineOrdersHeatmap />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pos-sales-heatmap" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>ساعات العمل - مبيعات الكاشير</CardTitle>
                <CardDescription>
                  توزيع مبيعات الكاشير حسب الوقت والأيام لفهم أوقات الذروة
                </CardDescription>
              </CardHeader>
              <CardContent>
                <POSSalesHeatmap />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="expense-analytics" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>تحليلات المصروفات والتوالف</CardTitle>
                <CardDescription>
                  إحصائيات شاملة للمصروفات والمنتجات التالفة
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ExpenseAnalytics />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="revenue-analytics" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>تحليلات الإيرادات والأرباح</CardTitle>
                <CardDescription>
                  إحصائيات شاملة للإيرادات والأرباح ومقارنات شهرية
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RevenueAnalytics />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}