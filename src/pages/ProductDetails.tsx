import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Package, TrendingUp, BarChart3, Edit } from "lucide-react";
import { fetchProductById } from "@/services/supabase/productService";
import { getProductSalesAnalytics } from "@/services/supabase/analyticsService";
import { Product } from "@/types";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

interface ProductAnalytics {
  totalSales: number;
  totalProfit: number;
  totalQuantitySold: number;
  dailySales: Array<{
    date: string;
    sales: number;
    profit: number;
    quantity: number;
  }>;
  topCustomers: Array<{
    customerName: string;
    totalPurchases: number;
    totalSpent: number;
  }>;
}

export default function ProductDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [analytics, setAnalytics] = useState<ProductAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProductDetails = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        const [productData, analyticsData] = await Promise.all([
          fetchProductById(id),
          getProductSalesAnalytics(id)
        ]);
        
        setProduct(productData);
        setAnalytics(analyticsData);
      } catch (error) {
        console.error("Error loading product details:", error);
        toast.error("خطأ في تحميل بيانات المنتج");
      } finally {
        setLoading(false);
      }
    };

    loadProductDetails();
  }, [id]);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    );
  }

  if (!product) {
    return (
      <MainLayout>
        <div className="text-center py-8">
          <p className="text-muted-foreground">المنتج غير موجود</p>
          <Button onClick={() => navigate("/products")} className="mt-4">
            العودة للمنتجات
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/products")}
            >
              <ArrowLeft className="h-4 w-4 ml-2" />
              العودة
            </Button>
            <h1 className="text-2xl font-bold">{product.name}</h1>
          </div>
          <Button onClick={() => navigate(`/add-product?id=${product.id}`)}>
            <Edit className="h-4 w-4 ml-2" />
            تعديل المنتج
          </Button>
        </div>

        {/* Product Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">المخزون الحالي</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{product.quantity}</div>
              <p className="text-xs text-muted-foreground">
                وحدة متاحة
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي المبيعات</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics?.totalSales.toFixed(2) || 0} ج.م</div>
              <p className="text-xs text-muted-foreground">
                الكمية المباعة: {analytics?.totalQuantitySold || 0}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الأرباح</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics?.totalProfit.toFixed(2) || 0} ج.م</div>
              <p className="text-xs text-muted-foreground">
                هامش الربح
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">السعر</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{product.price} ج.م</div>
              <p className="text-xs text-muted-foreground">
                سعر البيع
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Product Details and Analytics */}
        <Tabs defaultValue="details" className="space-y-4">
          <TabsList>
            <TabsTrigger value="details">تفاصيل المنتج</TabsTrigger>
            <TabsTrigger value="sales">المبيعات</TabsTrigger>
            <TabsTrigger value="customers">العملاء</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>معلومات المنتج</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="font-semibold">الاسم:</label>
                    <p>{product.name}</p>
                  </div>
                  <div>
                    <label className="font-semibold">الباركود:</label>
                    <p>{product.barcode || "غير محدد"}</p>
                  </div>
                  <div>
                    <label className="font-semibold">الوصف:</label>
                    <p>{product.description || "غير محدد"}</p>
                  </div>
                  <div>
                    <label className="font-semibold">وحدة القياس:</label>
                    <p>{product.unit_of_measure || "قطعة"}</p>
                  </div>
                  <div>
                    <label className="font-semibold">نوع الباركود:</label>
                    <Badge variant="outline">{product.barcode_type || "عادي"}</Badge>
                  </div>
                  <div>
                    <label className="font-semibold">البيع بالجملة:</label>
                    <Badge variant={product.bulk_enabled ? "default" : "secondary"}>
                      {product.bulk_enabled ? "مفعل" : "غير مفعل"}
                    </Badge>
                  </div>
                </div>
                
                {product.image_urls && product.image_urls.length > 0 && (
                  <div>
                    <label className="font-semibold block mb-2">صور المنتج:</label>
                    <div className="flex gap-2 flex-wrap">
                      {product.image_urls.map((url, index) => (
                        <img
                          key={index}
                          src={url}
                          alt={`${product.name} ${index + 1}`}
                          className="w-20 h-20 object-cover rounded border"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sales" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>مؤشرات المبيعات</CardTitle>
              </CardHeader>
              <CardContent>
                {analytics?.dailySales && analytics.dailySales.length > 0 ? (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold mb-4">المبيعات اليومية</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={analytics.dailySales}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Line type="monotone" dataKey="sales" stroke="#8884d8" name="المبيعات" />
                          <Line type="monotone" dataKey="profit" stroke="#82ca9d" name="الأرباح" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-semibold mb-4">الكميات المباعة</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analytics.dailySales}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="quantity" fill="#8884d8" name="الكمية" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    لا توجد بيانات مبيعات لهذا المنتج
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customers" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>أهم العملاء</CardTitle>
              </CardHeader>
              <CardContent>
                {analytics?.topCustomers && analytics.topCustomers.length > 0 ? (
                  <div className="space-y-4">
                    {analytics.topCustomers.map((customer, index) => (
                      <div key={index} className="flex justify-between items-center p-4 border rounded">
                        <div>
                          <p className="font-semibold">{customer.customerName}</p>
                          <p className="text-sm text-muted-foreground">
                            عدد المشتريات: {customer.totalPurchases}
                          </p>
                        </div>
                        <div className="text-left">
                          <p className="font-semibold">{customer.totalSpent.toFixed(2)} ج.م</p>
                          <p className="text-sm text-muted-foreground">إجمالي الإنفاق</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    لا توجد بيانات عملاء لهذا المنتج
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}