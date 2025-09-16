import MainLayout from "@/components/layout/MainLayout";
import { ProductAnalytics } from "@/components/analytics/ProductAnalytics";
import { CustomerAnalytics } from "@/components/analytics/CustomerAnalytics";
import { OnlineOrdersHeatmap } from "@/components/analytics/OnlineOrdersHeatmap";
import { POSSalesHeatmap } from "@/components/analytics/POSSalesHeatmap";
import { ExpenseAnalytics } from "@/components/analytics/ExpenseAnalytics";
import { RevenueAnalytics } from "@/components/analytics/RevenueAnalytics";
import { PeriodFilter, PeriodType, getDateRangeFromPeriod, getPeriodLabel } from "@/components/analytics/PeriodFilter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, ShoppingCart, Package, Receipt, DollarSign, CreditCard, Download } from "lucide-react";
import { exportComprehensiveAnalyticsReport } from "@/services/excelExportService";
import { toast } from "sonner";
import { useState } from "react";

export default function Analytics() {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("month");

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
            <Button onClick={handleExportReport} className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              تصدير تقرير شامل
            </Button>
          </div>
          
          <PeriodFilter 
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
          />
        </div>

        <Tabs defaultValue="product-analytics" className="space-y-4">
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
                <ProductAnalytics selectedPeriod={selectedPeriod} />
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
                <CustomerAnalytics selectedPeriod={selectedPeriod} />
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
                <OnlineOrdersHeatmap selectedPeriod={selectedPeriod} />
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
                <POSSalesHeatmap selectedPeriod={selectedPeriod} />
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
                <ExpenseAnalytics selectedPeriod={selectedPeriod} />
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
                <RevenueAnalytics selectedPeriod={selectedPeriod} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}