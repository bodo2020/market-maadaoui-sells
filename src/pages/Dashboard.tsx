
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { 
  BarChart4, 
  ShoppingCart, 
  Package, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight 
} from "lucide-react";

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

export default function Dashboard() {
  // Demo data for the dashboard
  const stats = [
    {
      title: "إجمالي المبيعات اليوم",
      value: `${siteConfig.currency} 12,500`,
      description: "20 معاملة اليوم",
      icon: <ShoppingCart size={16} />,
      trend: "up" as const,
      trendValue: "15% من الأمس"
    },
    {
      title: "الربح اليوم",
      value: `${siteConfig.currency} 3,200`,
      description: "إجمالي الأرباح من المبيعات",
      icon: <TrendingUp size={16} />,
      trend: "up" as const,
      trendValue: "10% من الأمس"
    },
    {
      title: "منتجات منخفضة المخزون",
      value: "8",
      description: "منتجات تحتاج إلى تجديد المخزون",
      icon: <Package size={16} />,
      trend: "down" as const,
      trendValue: "3 أقل من الأسبوع الماضي"
    },
    {
      title: "مبيعات هذا الشهر",
      value: `${siteConfig.currency} 120,000`,
      description: "إجمالي 450 معاملة",
      icon: <BarChart4 size={16} />,
      trend: "up" as const,
      trendValue: "8% من الشهر الماضي"
    }
  ];

  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">مرحباً بك في {siteConfig.name}</h1>
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
              {/* For demo, we'll add static data */}
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex justify-between items-center pb-2 border-b">
                  <div>
                    <p className="font-medium">فاتورة #{1000 + i}</p>
                    <p className="text-sm text-muted-foreground">منذ {30 - i * 5} دقيقة</p>
                  </div>
                  <p className="font-medium">{siteConfig.currency} {Math.floor(Math.random() * 500) + 100}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>المنتجات الأكثر مبيعاً</CardTitle>
            <CardDescription>
              أعلى 5 منتجات مبيعاً هذا الأسبوع
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Static data for demo */}
              {[
                "سكر 1 كيلو",
                "زيت عباد الشمس 1 لتر",
                "أرز مصري 5 كيلو",
                "شاي ليبتون 100 كيس",
                "دقيق فاخر 1 كيلو"
              ].map((product, i) => (
                <div key={i} className="flex justify-between items-center pb-2 border-b">
                  <p className="font-medium">{product}</p>
                  <p className="text-sm font-medium">{Math.floor(Math.random() * 50) + 10} وحدة</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
