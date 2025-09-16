import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { fetchProductSalesAnalytics, fetchCategorySalesAnalytics } from "@/services/supabase/analyticsService";
import { Package, TrendingUp, BarChart3 } from "lucide-react";

export function ProductAnalytics() {
  const { data: productSales = [], isLoading: isLoadingProducts } = useQuery({
    queryKey: ["product-sales-analytics"],
    queryFn: fetchProductSalesAnalytics,
  });

  const { data: categorySales = [], isLoading: isLoadingCategories } = useQuery({
    queryKey: ["category-sales-analytics"],
    queryFn: fetchCategorySalesAnalytics,
  });

  const colors = ['#8884d8', '#83a6ed', '#8dd1e1', '#82ca9d', '#a4de6c', '#d0ed57', '#ffc658', '#ff7c7c'];

  if (isLoadingProducts || isLoadingCategories) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              <div className="h-32 bg-gray-200 rounded"></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              <div className="h-32 bg-gray-200 rounded"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* إحصائيات سريعة */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Package className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{productSales.length}</p>
                <p className="text-sm text-muted-foreground">منتج مُباع</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">
                  {productSales.reduce((sum, product) => sum + product.totalQuantity, 0)}
                </p>
                <p className="text-sm text-muted-foreground">إجمالي الكمية المباعة</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">{categorySales.length}</p>
                <p className="text-sm text-muted-foreground">فئة نشطة</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* أكثر المنتجات مبيعاً */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              أكثر المنتجات مبيعاً
            </CardTitle>
          </CardHeader>
          <CardContent>
            {productSales.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد مبيعات</p>
            ) : (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={productSales.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 12 }}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis />
                    <Tooltip 
                      formatter={(value, name) => [
                        `${value} قطعة`,
                        name === 'totalQuantity' ? 'الكمية المباعة' : name
                      ]}
                      labelFormatter={(label) => `المنتج: ${label}`}
                    />
                    <Bar dataKey="totalQuantity" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>

                {/* قائمة تفصيلية */}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {productSales.map((product, index) => (
                    <div key={product.id} className="flex items-center justify-between p-6 border rounded-lg min-h-[80px]">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">#{index + 1}</Badge>
                        <span className="font-medium">{product.name}</span>
                      </div>
                      <div className="text-left">
                        <div className="font-bold text-lg">{product.totalQuantity} قطعة</div>
                        <div className="text-sm text-muted-foreground">
                          {product.totalRevenue?.toFixed(0) || 0} ج.م
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* مبيعات الفئات */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              مبيعات الفئات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categorySales.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد مبيعات</p>
            ) : (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categorySales}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="totalQuantity"
                    >
                      {categorySales.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value) => [`${value} قطعة`, 'الكمية المباعة']}
                      labelFormatter={(label) => `الفئة: ${label}`}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* قائمة الفئات */}
                <div className="space-y-2">
                  {categorySales.map((category, index) => (
                    <div key={category.name} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: colors[index % colors.length] }}
                        ></div>
                        <span className="font-medium">{category.name}</span>
                      </div>
                      <div className="text-left">
                        <div className="font-bold">{category.totalQuantity} قطعة</div>
                        <div className="text-sm text-muted-foreground">
                          {category.totalRevenue?.toFixed(0) || 0} ج.م
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* أكثر المنتجات تحقيقاً للأرباح */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            أكثر المنتجات تحقيقاً للأرباح
          </CardTitle>
        </CardHeader>
        <CardContent>
          {productSales.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد مبيعات</p>
          ) : (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={productSales.slice(0, 10).sort((a, b) => (b.totalRevenue - b.totalQuantity * (b.totalRevenue / b.totalQuantity) * 0.7) - (a.totalRevenue - a.totalQuantity * (a.totalRevenue / a.totalQuantity) * 0.7))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 12 }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number, name) => [
                      `${(value || 0).toFixed(0)} ج.م`,
                      'الربح المقدر'
                    ]}
                    labelFormatter={(label) => `المنتج: ${label}`}
                  />
                  <Bar 
                    dataKey={(entry) => entry.totalRevenue - (entry.totalQuantity * (entry.totalRevenue / entry.totalQuantity) * 0.7)}
                    fill="#10b981" 
                    name="الربح المقدر"
                  />
                </BarChart>
              </ResponsiveContainer>

              {/* قائمة تفصيلية للأرباح */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {productSales
                  .sort((a, b) => {
                    const profitA = a.totalRevenue - (a.totalQuantity * (a.totalRevenue / a.totalQuantity) * 0.7);
                    const profitB = b.totalRevenue - (b.totalQuantity * (b.totalRevenue / b.totalQuantity) * 0.7);
                    return profitB - profitA;
                  })
                  .slice(0, 10)
                  .map((product, index) => {
                    const estimatedProfit = product.totalRevenue - (product.totalQuantity * (product.totalRevenue / product.totalQuantity) * 0.7);
                    return (
                      <div key={product.id} className="flex items-center justify-between p-6 border rounded-lg min-h-[80px] bg-gradient-to-r from-green-50 to-green-100">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="bg-green-100 text-green-800">#{index + 1}</Badge>
                          <div>
                            <span className="font-medium block">{product.name}</span>
                            <span className="text-sm text-muted-foreground">{product.totalQuantity} قطعة مباعة</span>
                          </div>
                        </div>
                        <div className="text-left">
                          <div className="font-bold text-lg text-green-600">{estimatedProfit.toFixed(0)} ج.م</div>
                          <div className="text-sm text-muted-foreground">
                            ربح مقدر
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}