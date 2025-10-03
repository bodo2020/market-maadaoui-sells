import { Order } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart, Clock, CheckCircle2, XCircle, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderStatsProps {
  orders: Order[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  gradient: string;
  changePercent?: number;
}

function StatCard({ title, value, icon, active, onClick, gradient, changePercent }: StatCardProps) {
  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1",
        active ? "ring-2 ring-primary shadow-lg" : ""
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <div className={cn("p-2 rounded-lg", gradient)}>
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between">
          <div className="text-3xl font-bold">{value}</div>
          {changePercent !== undefined && (
            <div className={cn(
              "flex items-center text-xs font-medium",
              changePercent >= 0 ? "text-green-600" : "text-red-600"
            )}>
              {changePercent >= 0 ? (
                <TrendingUp className="h-3 w-3 ml-1" />
              ) : (
                <TrendingDown className="h-3 w-3 ml-1" />
              )}
              {Math.abs(changePercent)}%
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function OrderStats({ orders, activeTab, onTabChange }: OrderStatsProps) {
  const getOrdersCount = (status: string) => {
    return orders.filter(order => order.status === status).length;
  };

  const stats = [
    {
      id: "all",
      title: "إجمالي الطلبات",
      value: orders.length,
      icon: <ShoppingCart className="h-4 w-4 text-white" />,
      gradient: "bg-gradient-to-br from-primary to-primary/80",
      changePercent: 12
    },
    {
      id: "pending",
      title: "في الانتظار",
      value: getOrdersCount('pending'),
      icon: <Clock className="h-4 w-4 text-white" />,
      gradient: "bg-gradient-to-br from-amber-500 to-amber-600",
      changePercent: 8
    },
    {
      id: "delivered",
      title: "مكتمل",
      value: getOrdersCount('delivered'),
      icon: <CheckCircle2 className="h-4 w-4 text-white" />,
      gradient: "bg-gradient-to-br from-green-500 to-green-600",
      changePercent: 15
    },
    {
      id: "cancelled",
      title: "ملغي",
      value: getOrdersCount('cancelled'),
      icon: <XCircle className="h-4 w-4 text-white" />,
      gradient: "bg-gradient-to-br from-red-500 to-red-600",
      changePercent: -5
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {stats.map((stat) => (
        <StatCard
          key={stat.id}
          title={stat.title}
          value={stat.value}
          icon={stat.icon}
          active={activeTab === stat.id}
          onClick={() => onTabChange(stat.id)}
          gradient={stat.gradient}
          changePercent={stat.changePercent}
        />
      ))}
    </div>
  );
}
