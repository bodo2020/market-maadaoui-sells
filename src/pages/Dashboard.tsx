
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { useQuery } from "@tanstack/react-query";
import { 
  BarChart4, 
  ShoppingCart, 
  Package, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight 
} from "lucide-react";
import { fetchSales } from "@/services/supabase/saleService";
import { fetchProducts } from "@/services/supabase/productService";
import { CartItem, Product, Sale } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: JSX.Element;
  trend?: "up" | "down";
  trendValue?: string;
}

function StatCard({ title, value, description, icon, trend, trendValue }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
        {trend && (
          <div className="flex items-center gap-1 mt-2">
            {trend === "up" ? (
              <ArrowUpRight className="h-4 w-4 text-green-500" />
            ) : (
              <ArrowDownRight className="h-4 w-4 text-red-500" />
            )}
            <span className={`text-xs ${trend === "up" ? "text-green-500" : "text-red-500"}`}>
              {trendValue}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatCurrency(amount: number): string {
  return `${siteConfig.currency} ${amount.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { currentBranch } = useBranch();
  const isAdmin = user?.role === 'admin';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ['sales', currentBranch?.id],
    queryFn: () => fetchSales(undefined, undefined, currentBranch?.id),
    enabled: !!currentBranch
  });

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['products', currentBranch?.id],
    queryFn: () => fetchProducts(currentBranch?.id),
    enabled: !!currentBranch
  });

  const todaySales = sales?.filter(sale => {
    const saleDate = new Date(sale.date);
    saleDate.setHours(0, 0, 0, 0);
    return saleDate.getTime() === today.getTime();
  }) || [];
  
  const totalSalesToday = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const totalProfitToday = todaySales.reduce((sum, sale) => sum + sale.profit, 0);
  
  const lowStockProducts = products?.filter(product => product.quantity <= 5) || [];
  
  const thisMonth = today.getMonth();
  const thisYear = today.getFullYear();
  
  const monthlySales = sales?.filter(sale => {
    const saleDate = new Date(sale.date);
    return saleDate.getMonth() === thisMonth && saleDate.getFullYear() === thisYear;
  }) || [];
  
  const totalMonthlySales = monthlySales.reduce((sum, sale) => sum + sale.total, 0);
  const totalMonthlyTransactions = monthlySales.length;
  
  const recentSales = [...(sales || [])]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);
  
  const productsSoldMap = new Map<string, { product: Product; quantitySold: number; revenue: number }>();
  
  sales?.forEach(sale => {
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

  // Create different stats for admin and cashier
  const adminStats = [
    {
      title: "إجمالي المبيعات اليوم",
      value: salesLoading ? `${siteConfig.currency} ...` : formatCurrency(totalSalesToday),
      description: `${todaySales.length} معاملة اليوم`,
      icon: <ShoppingCart size={16} />,
      trend: "up" as const,
      trendValue: "15% من الأمس"
    },
    {
      title: "الربح اليوم",
      value: salesLoading ? `${siteConfig.currency} ...` : formatCurrency(totalProfitToday),
      description: "إجمالي الأرباح من المبيعات",
      icon: <TrendingUp size={16} />,
      trend: "up" as const,
      trendValue: "10% من الأمس"
    },
    {
      title: "منتجات منخفضة المخزون",
      value: productsLoading ? "..." : `${lowStockProducts.length}`,
      description: "منتجات تحتاج إلى تجديد المخزون",
      icon: <Package size={16} />,
      trend: "down" as const,
      trendValue: "3 أقل من الأسبوع الماضي"
    },
    {
      title: "مبيعات هذا الشهر",
      value: salesLoading ? `${siteConfig.currency} ...` : formatCurrency(totalMonthlySales),
      description: `إجمالي ${totalMonthlyTransactions} معاملة`,
      icon: <BarChart4 size={16} />,
      trend: "up" as const,
      trendValue: "8% من الشهر الماضي"
    }
  ];

  const cashierStats = [
    {
      title: "إجمالي المبيعات اليوم",
      value: salesLoading ? `${siteConfig.currency} ...` : formatCurrency(totalSalesToday),
      description: `${todaySales.length} معاملة اليوم`,
      icon: <ShoppingCart size={16} />,
      trend: "up" as const,
      trendValue: "15% من الأمس"
    },
    {
      title: "منتجات منخفضة المخزون",
      value: productsLoading ? "..." : `${lowStockProducts.length}`,
      description: "منتجات تحتاج إلى تجديد المخزون",
      icon: <Package size={16} />,
      trend: "down" as const,
      trendValue: "3 أقل من الأسبوع الماضي"
    }
  ];

  // Select which stats to display based on user role
  const stats = isAdmin ? adminStats : cashierStats;

  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-8">
        {siteConfig.logoUrl ? (
          <div className="h-12">
            <img 
              src={siteConfig.logoUrl} 
              alt={siteConfig.name}
              className="h-full object-contain" 
            />
          </div>
        ) : (
          <h1 className="text-2xl font-bold">مرحباً بك في {siteConfig.name}</h1>
        )}
        <p className="text-muted-foreground">
          {new Date().toLocaleDateString('ar-EG', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>أحدث المبيعات</CardTitle>
            <CardDescription>
              آخر 5 معاملات مبيعات
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {salesLoading ? (
                <p className="text-center py-4 text-muted-foreground">جاري تحميل البيانات...</p>
              ) : recentSales.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">لا توجد مبيعات حتى الآن</p>
              ) : (
                recentSales.map((sale) => (
                  <div key={sale.id} className="flex justify-between items-center pb-2 border-b">
                    <div>
                      <p className="font-medium">{sale.invoice_number}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(sale.date).toLocaleDateString('ar-EG')}
                      </p>
                    </div>
                    <p className="font-medium">{formatCurrency(sale.total)}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>المنتجات الأكثر مبيعاً</CardTitle>
            <CardDescription>
              أعلى 5 منتجات مبيعاً
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {salesLoading || productsLoading ? (
                <p className="text-center py-4 text-muted-foreground">جاري تحميل البيانات...</p>
              ) : topSellingProducts.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">لا توجد بيانات حتى الآن</p>
              ) : (
                topSellingProducts.map((item) => (
                  <div key={item.product.id} className="flex justify-between items-center pb-2 border-b">
                    <p className="font-medium">{item.product.name}</p>
                    <p className="text-sm font-medium">{item.quantitySold} وحدة</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
