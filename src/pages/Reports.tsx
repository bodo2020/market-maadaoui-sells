
import { useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { useQuery } from "@tanstack/react-query";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart4, 
  Download, 
  TrendingUp, 
  Store, 
  ShoppingCart, 
  Users, 
  Calendar,
  DollarSign,
  Percent
} from "lucide-react";
import { fetchSales } from "@/services/supabase/saleService";
import { fetchProducts } from "@/services/supabase/productService";
import { CartItem, Product, Sale } from "@/types";

// Demo chart data
const BarChart = () => (
  <div className="w-full h-64 bg-gray-50 rounded-md p-6 flex items-end space-x-2 rtl:space-x-reverse">
    {Array.from({ length: 10 }).map((_, i) => {
      const height = 20 + Math.random() * 150;
      return (
        <div key={i} className="flex flex-col items-center flex-1">
          <div 
            className="w-full bg-primary rounded-t-sm" 
            style={{ height: `${height}px` }}
          ></div>
          <span className="text-xs mt-2">{i + 1}</span>
        </div>
      );
    })}
  </div>
);

function formatCurrency(amount: number): string {
  return `${siteConfig.currency} ${amount.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}`;
}

export default function Reports() {
  const [dateRange, setDateRange] = useState("week");
  const [reportType, setReportType] = useState("sales");
  
  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ['sales'],
    queryFn: fetchSales
  });

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts
  });
  
  // Calculate total sales and profits
  const filteredSales = sales || [];
  const totalSales = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
  const totalProfit = filteredSales.reduce((sum, sale) => sum + sale.profit, 0);
  const totalItems = filteredSales.reduce((sum, sale) => 
    sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
  
  // Get top selling products
  const productsSoldMap = new Map<string, { product: Product; quantitySold: number; revenue: number }>();
  
  filteredSales.forEach(sale => {
    sale.items.forEach((item: CartItem) => {
      const productId = item.product.id;
      if (productsSoldMap.has(productId)) {
        const existing = productsSoldMap.get(productId)!;
        existing.quantitySold += item.quantity;
        existing.revenue += item.total;
      } else {
        productsSoldMap.set(productId, {
          product: item.product,
          quantitySold: item.quantity,
          revenue: item.total
        });
      }
    });
  });
  
  const topSellingProducts = Array.from(productsSoldMap.values())
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, 5);
  
  const handleExportReport = () => {
    alert('سيتم تنفيذ تصدير التقرير قريبًا');
    // TODO: Implement report export functionality
  };
  
  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">التقارير والإحصائيات</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportReport}>
            <Download className="ml-2 h-4 w-4" />
            تصدير التقرير
          </Button>
          <Select defaultValue={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="اختر الفترة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">اليوم</SelectItem>
              <SelectItem value="week">هذا الأسبوع</SelectItem>
              <SelectItem value="month">هذا الشهر</SelectItem>
              <SelectItem value="quarter">هذا الربع</SelectItem>
              <SelectItem value="year">هذا العام</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">المبيعات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{salesLoading ? "..." : formatCurrency(totalSales)}</div>
            <div className="flex items-center mt-1">
              <TrendingUp className="h-4 w-4 text-green-500 ml-1" />
              <span className="text-xs text-green-500">%12+</span>
              <span className="text-xs text-muted-foreground mr-1">من الفترة السابقة</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">الأرباح</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{salesLoading ? "..." : formatCurrency(totalProfit)}</div>
            <div className="flex items-center mt-1">
              <TrendingUp className="h-4 w-4 text-green-500 ml-1" />
              <span className="text-xs text-green-500">%8+</span>
              <span className="text-xs text-muted-foreground mr-1">من الفترة السابقة</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">المنتجات المباعة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{salesLoading ? "..." : `${totalItems} وحدة`}</div>
            <div className="flex items-center mt-1">
              <TrendingUp className="h-4 w-4 text-green-500 ml-1" />
              <span className="text-xs text-green-500">%15+</span>
              <span className="text-xs text-muted-foreground mr-1">من الفترة السابقة</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">معدل الربح</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {salesLoading ? "..." : totalSales > 0 ? `${Math.round((totalProfit / totalSales) * 100)}%` : "0%"}
            </div>
            <div className="flex items-center mt-1">
              <TrendingUp className="h-4 w-4 text-green-500 ml-1" />
              <span className="text-xs text-green-500">%2+</span>
              <span className="text-xs text-muted-foreground mr-1">من الفترة السابقة</span>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Tabs defaultValue="sales" className="mb-6" onValueChange={setReportType}>
        <TabsList className="grid grid-cols-5 w-fit mb-4">
          <TabsTrigger value="sales" className="flex gap-2">
            <ShoppingCart className="h-4 w-4" />
            <span>المبيعات</span>
          </TabsTrigger>
          <TabsTrigger value="products" className="flex gap-2">
            <Store className="h-4 w-4" />
            <span>المنتجات</span>
          </TabsTrigger>
          <TabsTrigger value="cashiers" className="flex gap-2">
            <Users className="h-4 w-4" />
            <span>الكاشير</span>
          </TabsTrigger>
          <TabsTrigger value="profitability" className="flex gap-2">
            <DollarSign className="h-4 w-4" />
            <span>الربحية</span>
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex gap-2">
            <BarChart4 className="h-4 w-4" />
            <span>الاتجاهات</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="sales">
          <Card>
            <CardHeader>
              <CardTitle>تقرير المبيعات</CardTitle>
              <CardDescription>
                {dateRange === "day" && "إحصائيات المبيعات لليوم الحالي"}
                {dateRange === "week" && "إحصائيات المبيعات للأسبوع الحالي"}
                {dateRange === "month" && "إحصائيات المبيعات للشهر الحالي"}
                {dateRange === "quarter" && "إحصائيات المبيعات للربع الحالي"}
                {dateRange === "year" && "إحصائيات المبيعات للعام الحالي"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <BarChart />
              </div>
              
              {salesLoading ? (
                <p className="text-center py-4 text-muted-foreground">جاري تحميل البيانات...</p>
              ) : filteredSales.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">لا توجد بيانات مبيعات للعرض</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>رقم الفاتورة</TableHead>
                        <TableHead>التاريخ</TableHead>
                        <TableHead>العناصر</TableHead>
                        <TableHead>المجموع</TableHead>
                        <TableHead>الربح</TableHead>
                        <TableHead>طريقة الدفع</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSales.map(sale => (
                        <TableRow key={sale.id}>
                          <TableCell className="font-medium">{sale.invoice_number}</TableCell>
                          <TableCell>{new Date(sale.date).toLocaleDateString('ar-EG')}</TableCell>
                          <TableCell>
                            {sale.items.reduce((sum, item) => sum + item.quantity, 0)} عنصر
                          </TableCell>
                          <TableCell>{formatCurrency(sale.total)}</TableCell>
                          <TableCell className="text-green-600">
                            {formatCurrency(sale.profit)}
                          </TableCell>
                          <TableCell>
                            {sale.payment_method === 'cash' && 'نقداً'}
                            {sale.payment_method === 'card' && 'بطاقة'}
                            {sale.payment_method === 'mixed' && 'مختلط'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="products">
          <Card>
            <CardHeader>
              <CardTitle>تقرير المنتجات الأكثر مبيعاً</CardTitle>
              <CardDescription>
                المنتجات الأكثر مبيعاً حسب الكمية والإيرادات
              </CardDescription>
            </CardHeader>
            <CardContent>
              {salesLoading || productsLoading ? (
                <p className="text-center py-4 text-muted-foreground">جاري تحميل البيانات...</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">حسب الكمية</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {topSellingProducts.length === 0 ? (
                        <p className="text-center py-4 text-muted-foreground">لا توجد بيانات للعرض</p>
                      ) : (
                        <div className="space-y-4">
                          {topSellingProducts.map((item, index) => (
                            <div key={item.product.id} className="flex items-center">
                              <div className="w-8 text-muted-foreground">{index + 1}.</div>
                              <div className="flex-1">
                                <div className="font-medium">{item.product.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {formatCurrency(item.product.price)} / وحدة
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold">{item.quantitySold} وحدة</div>
                                <div className="text-sm text-muted-foreground">
                                  {formatCurrency(item.revenue)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">حسب الإيرادات</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {topSellingProducts.length === 0 ? (
                        <p className="text-center py-4 text-muted-foreground">لا توجد بيانات للعرض</p>
                      ) : (
                        <div className="space-y-4">
                          {[...topSellingProducts]
                            .sort((a, b) => b.revenue - a.revenue)
                            .map((item, index) => (
                              <div key={item.product.id} className="flex items-center">
                                <div className="w-8 text-muted-foreground">{index + 1}.</div>
                                <div className="flex-1">
                                  <div className="font-medium">{item.product.name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {item.quantitySold} وحدة
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-bold">{formatCurrency(item.revenue)}</div>
                                  <div className="text-sm text-green-600">
                                    ربح: {formatCurrency(item.revenue - (item.product.purchase_price * item.quantitySold))}
                                  </div>
                                </div>
                              </div>
                            ))
                          }
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
              
              {salesLoading || productsLoading ? (
                <p className="text-center py-4 text-muted-foreground">جاري تحميل البيانات...</p>
              ) : productsSoldMap.size === 0 ? (
                <p className="text-center py-4 text-muted-foreground">لا توجد بيانات للعرض</p>
              ) : (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">جميع المنتجات المباعة</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>المنتج</TableHead>
                            <TableHead>الكمية المباعة</TableHead>
                            <TableHead>سعر الوحدة</TableHead>
                            <TableHead>إجمالي المبيعات</TableHead>
                            <TableHead>نسبة المبيعات</TableHead>
                            <TableHead>الربح</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.from(productsSoldMap.values()).map(item => (
                            <TableRow key={item.product.id}>
                              <TableCell className="font-medium">{item.product.name}</TableCell>
                              <TableCell>{item.quantitySold} وحدة</TableCell>
                              <TableCell>
                                {formatCurrency(item.product.is_offer && item.product.offer_price
                                  ? item.product.offer_price
                                  : item.product.price
                                )}
                              </TableCell>
                              <TableCell>{formatCurrency(item.revenue)}</TableCell>
                              <TableCell>
                                {totalSales > 0 ? ((item.revenue / totalSales) * 100).toFixed(1) : 0}%
                              </TableCell>
                              <TableCell className="text-green-600">
                                {formatCurrency(item.revenue - (item.product.purchase_price * item.quantitySold))}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="cashiers">
          <Card>
            <CardHeader>
              <CardTitle>تقرير أداء الكاشير</CardTitle>
              <CardDescription>
                مقارنة أداء الكاشير حسب المبيعات والأرباح
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <BarChart />
              </div>
              
              <div className="text-center py-8 text-muted-foreground">
                سيتم قريبًا توفير تقارير مفصلة عن أداء الكاشير
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="profitability">
          <Card>
            <CardHeader>
              <CardTitle>تحليل الربحية</CardTitle>
              <CardDescription>
                تحليل لهوامش الربح وأداء المنتجات
              </CardDescription>
            </CardHeader>
            <CardContent>
              {salesLoading || productsLoading ? (
                <p className="text-center py-4 text-muted-foreground">جاري تحميل البيانات...</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">متوسط هامش الربح</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold flex items-center">
                          <Percent className="h-6 w-6 mr-1 text-primary" />
                          {totalSales > 0 ? Math.round((totalProfit / totalSales) * 100) : 0}%
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">أعلى هامش ربح</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {Array.from(productsSoldMap.values()).length === 0 ? (
                          <div className="text-3xl font-bold text-green-600">0%</div>
                        ) : (
                          <>
                            <div className="text-3xl font-bold text-green-600">
                              {Math.max(...Array.from(productsSoldMap.values()).map(item => {
                                const profit = item.revenue - (item.product.purchase_price * item.quantitySold);
                                return Math.round((profit / item.revenue) * 100);
                              }), 0)}%
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              لمنتج {Array.from(productsSoldMap.values())
                                .sort((a, b) => {
                                  const profitA = a.revenue - (a.product.purchase_price * a.quantitySold);
                                  const profitB = b.revenue - (b.product.purchase_price * b.quantitySold);
                                  const marginA = profitA / a.revenue;
                                  const marginB = profitB / b.revenue;
                                  return marginB - marginA;
                                })[0]?.product.name || ''}
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">أقل هامش ربح</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {Array.from(productsSoldMap.values())
                          .filter(item => item.revenue > 0).length === 0 ? (
                          <div className="text-3xl font-bold text-yellow-600">0%</div>
                        ) : (
                          <>
                            <div className="text-3xl font-bold text-yellow-600">
                              {Math.min(...Array.from(productsSoldMap.values())
                                .filter(item => item.revenue > 0)
                                .map(item => {
                                  const profit = item.revenue - (item.product.purchase_price * item.quantitySold);
                                  return Math.round((profit / item.revenue) * 100);
                                }), 0)}%
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              لمنتج {Array.from(productsSoldMap.values())
                                .sort((a, b) => {
                                  const profitA = a.revenue - (a.product.purchase_price * a.quantitySold);
                                  const profitB = b.revenue - (b.product.purchase_price * b.quantitySold);
                                  const marginA = profitA / a.revenue;
                                  const marginB = profitB / b.revenue;
                                  return marginA - marginB;
                                })
                                .filter(item => item.revenue > 0)[0]?.product.name || ''}
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                  
                  {productsSoldMap.size === 0 ? (
                    <p className="text-center py-4 text-muted-foreground">لا توجد بيانات للعرض</p>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>المنتج</TableHead>
                            <TableHead>سعر البيع</TableHead>
                            <TableHead>سعر الشراء</TableHead>
                            <TableHead>هامش الربح</TableHead>
                            <TableHead>الكمية المباعة</TableHead>
                            <TableHead>إجمالي الربح</TableHead>
                            <TableHead>نسبة من إجمالي الربح</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.from(productsSoldMap.values())
                            .sort((a, b) => {
                              const profitA = a.revenue - (a.product.purchase_price * a.quantitySold);
                              const profitB = b.revenue - (b.product.purchase_price * b.quantitySold);
                              return profitB - profitA;
                            })
                            .map(item => {
                              const profit = item.revenue - (item.product.purchase_price * item.quantitySold);
                              const margin = item.revenue > 0 ? (profit / item.revenue) * 100 : 0;
                              
                              return (
                                <TableRow key={item.product.id}>
                                  <TableCell className="font-medium">{item.product.name}</TableCell>
                                  <TableCell>
                                    {formatCurrency(item.product.is_offer && item.product.offer_price
                                      ? item.product.offer_price
                                      : item.product.price
                                    )}
                                  </TableCell>
                                  <TableCell>{formatCurrency(item.product.purchase_price)}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center">
                                      <div 
                                        className={`h-2 rounded-full mr-2 ${
                                          margin >= 30 ? 'bg-green-500' : 
                                          margin >= 20 ? 'bg-yellow-500' : 
                                          'bg-red-500'
                                        }`}
                                        style={{ width: `${Math.min(margin, 50)}%` }}
                                      ></div>
                                      <span>{margin.toFixed(1)}%</span>
                                    </div>
                                  </TableCell>
                                  <TableCell>{item.quantitySold} وحدة</TableCell>
                                  <TableCell className="text-green-600">{formatCurrency(profit)}</TableCell>
                                  <TableCell>
                                    {totalProfit > 0 ? (profit / totalProfit * 100).toFixed(1) : 0}%
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <CardTitle>اتجاهات المبيعات</CardTitle>
              <CardDescription>
                تحليل اتجاهات المبيعات على مدار الوقت
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-8">
                <div>
                  <h3 className="text-lg font-medium mb-4">المبيعات اليومية</h3>
                  <BarChart />
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-4">المبيعات الأسبوعية</h3>
                  <BarChart />
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-4">المبيعات الشهرية</h3>
                  <BarChart />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
