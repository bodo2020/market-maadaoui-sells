import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, Package, Truck, Home } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface TimelineItem {
  status: string;
  label: string;
  icon: any;
  date?: string;
  isActive: boolean;
  isCompleted: boolean;
}

interface OrderTimelineProps {
  status: string;
  createdAt: string;
  updatedAt: string;
}

const statusOrder = ['pending', 'confirmed', 'preparing', 'shipped', 'delivered'];

const statusConfig: Record<string, { label: string; icon: any }> = {
  pending: { label: 'تم إنشاء الطلب', icon: Clock },
  confirmed: { label: 'تم التأكيد', icon: CheckCircle2 },
  preparing: { label: 'جاري التجهيز', icon: Package },
  shipped: { label: 'تم الشحن', icon: Truck },
  delivered: { label: 'تم التسليم', icon: Home },
};

export function OrderTimeline({ status, createdAt, updatedAt }: OrderTimelineProps) {
  const currentStatusIndex = statusOrder.indexOf(status);

  const timelineItems: TimelineItem[] = statusOrder.map((orderStatus, index) => {
    const config = statusConfig[orderStatus];
    return {
      status: orderStatus,
      label: config.label,
      icon: config.icon,
      date: index === 0 ? createdAt : (index <= currentStatusIndex ? updatedAt : undefined),
      isActive: index === currentStatusIndex,
      isCompleted: index < currentStatusIndex,
    };
  });

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle className="text-lg">مراحل الطلب</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute right-4 top-0 bottom-0 w-0.5 bg-border" />
          
          <div className="space-y-6">
            {timelineItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={item.status} className="relative flex items-start gap-4">
                  {/* Icon Circle */}
                  <div className={`
                    relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2
                    ${item.isCompleted ? 'bg-green-500 border-green-500' : 
                      item.isActive ? 'bg-primary border-primary' : 
                      'bg-muted border-border'}
                  `}>
                    <Icon className={`h-4 w-4 ${item.isCompleted || item.isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 pb-6">
                    <p className={`font-medium ${item.isCompleted || item.isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {item.label}
                    </p>
                    {item.date && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {format(new Date(item.date), 'dd MMMM yyyy - HH:mm', { locale: ar })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
