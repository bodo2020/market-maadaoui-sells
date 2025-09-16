import MainLayout from "@/components/layout/MainLayout";
import { ProductAnalytics } from "@/components/crm/ProductAnalytics";
import { CustomerAnalytics } from "@/components/crm/CustomerAnalytics";
import { OrderHeatmap } from "@/components/crm/OrderHeatmap";
import { ExpenseAnalytics } from "@/components/analytics/ExpenseAnalytics";
import { RevenueAnalytics } from "@/components/analytics/RevenueAnalytics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Activity, Package, Receipt, DollarSign } from "lucide-react";

export default function Analytics() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">التحليلات</h1>
            <p className="text-muted-foreground mt-2">
              تحليلات شاملة للمبيعات والعملاء والطلبات
            </p>
          </div>
        </div>

        <Tabs defaultValue="product-analytics" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="product-analytics" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              تحليلات المنتجات
            </TabsTrigger>
            <TabsTrigger value="customer-analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              تحليلات العملاء
            </TabsTrigger>
            <TabsTrigger value="order-heatmap" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              خريطة الطلبات
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

          <TabsContent value="order-heatmap" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>خريطة الطلبات</CardTitle>
                <CardDescription>
                  توزيع الطلبات حسب الوقت والأيام لفهم أوقات الذروة
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OrderHeatmap />
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