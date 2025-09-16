import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { fetchProductSalesAnalytics } from "@/services/supabase/analyticsService";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodType, getDateRangeFromPeriod } from "@/components/analytics/PeriodFilter";

interface ProductAnalyticsProps {
  selectedPeriod: PeriodType;
}

export function ProductAnalytics({ selectedPeriod }: ProductAnalyticsProps) {
  const dateRange = getDateRangeFromPeriod(selectedPeriod);
  
  const { data: productSalesData, isLoading, error } = useQuery({
    queryKey: ["product-sales-analytics", selectedPeriod],
    queryFn: () => fetchProductSalesAnalytics({
      from: dateRange.from || new Date(),
      to: dateRange.to || new Date()
    }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-destructive">خطأ في تحميل تحليلات المنتجات</p>
        </CardContent>
      </Card>
    );
  }

  if (!productSalesData || productSalesData.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">لا توجد بيانات مبيعات للمنتجات في هذه الفترة</p>
        </CardContent>
      </Card>
    );
  }

  // أخذ أفضل 10 منتجات فقط للعرض
  const topProducts = productSalesData.slice(0, 10);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const totalRevenue = productSalesData.reduce((sum, product) => sum + product.totalRevenue, 0);
  const totalProfit = productSalesData.reduce((sum, product) => sum + product.totalProfit, 0);
  const totalQuantity = productSalesData.reduce((sum, product) => sum + product.totalQuantity, 0);

  return (
    <div className="space-y-6">
      {/* البطاقات الإحصائية */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الإيرادات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(totalRevenue)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الأرباح</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalProfit)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الكمية المباعة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{totalQuantity.toLocaleString('ar-EG')}</div>
          </CardContent>
        </Card>
      </div>

      {/* الرسم البياني */}
      <Card>
        <CardHeader>
          <CardTitle>أفضل 10 منتجات مبيعاً</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={topProducts} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <XAxis 
                dataKey="name" 
                angle={-45}
                textAnchor="end"
                height={100}
                interval={0}
              />
              <YAxis />
              <Tooltip 
                labelFormatter={(label) => `المنتج: ${label}`}
                formatter={(value: number, name: string) => [
                  name === 'totalQuantity' ? value.toLocaleString('ar-EG') : formatCurrency(value),
                  name === 'totalQuantity' ? 'الكمية' : name === 'totalRevenue' ? 'الإيرادات' : 'الأرباح'
                ]}
              />
              <Legend 
                formatter={(value) => 
                  value === 'totalQuantity' ? 'الكمية' : 
                  value === 'totalRevenue' ? 'الإيرادات' : 'الأرباح'
                }
              />
              <Bar dataKey="totalQuantity" fill="hsl(var(--primary))" name="totalQuantity" />
              <Bar dataKey="totalRevenue" fill="hsl(var(--secondary))" name="totalRevenue" />
              <Bar dataKey="totalProfit" fill="hsl(var(--accent))" name="totalProfit" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* جدول المنتجات */}
      <Card>
        <CardHeader>
          <CardTitle>تفاصيل أداء المنتجات</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-right p-2">المنتج</th>
                  <th className="text-right p-2">الكمية المباعة</th>
                  <th className="text-right p-2">الإيرادات</th>
                  <th className="text-right p-2">الأرباح</th>
                  <th className="text-right p-2">هامش الربح</th>
                </tr>
              </thead>
              <tbody>
                {productSalesData.map((product) => (
                  <tr key={product.id} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">{product.name}</td>
                    <td className="p-2">{product.totalQuantity.toLocaleString('ar-EG')}</td>
                    <td className="p-2">{formatCurrency(product.totalRevenue)}</td>
                    <td className="p-2 text-green-600">{formatCurrency(product.totalProfit)}</td>
                    <td className="p-2">
                      {product.totalRevenue > 0 
                        ? `${((product.totalProfit / product.totalRevenue) * 100).toFixed(1)}%`
                        : '0%'
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}