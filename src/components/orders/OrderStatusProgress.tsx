import { CheckCircle, Clock, Package, Truck, MapPin, X } from "lucide-react";
import { Order } from "@/types";

interface OrderStatusProgressProps {
  status: Order['status'];
  className?: string;
}

const statusConfig = {
  pending: {
    label: "قيد المراجعة",
    icon: Clock,
    color: "hsl(var(--muted-foreground))",
    bgColor: "hsl(var(--muted))",
    step: 1
  },
  confirmed: {
    label: "تم التأكيد",
    icon: CheckCircle,
    color: "hsl(var(--primary))",
    bgColor: "hsl(var(--primary) / 0.1)",
    step: 2
  },
  preparing: {
    label: "قيد التجهيز",
    icon: Package,
    color: "hsl(var(--warning))",
    bgColor: "hsl(var(--warning) / 0.1)",
    step: 3
  },
  ready: {
    label: "جاهز للشحن",
    icon: CheckCircle,
    color: "hsl(var(--success))",
    bgColor: "hsl(var(--success) / 0.1)",
    step: 4
  },
  shipped: {
    label: "تم الشحن",
    icon: Truck,
    color: "hsl(var(--info))",
    bgColor: "hsl(var(--info) / 0.1)",
    step: 5
  },
  delivered: {
    label: "تم التسليم",
    icon: MapPin,
    color: "hsl(var(--success))",
    bgColor: "hsl(var(--success) / 0.1)",
    step: 6
  },
  cancelled: {
    label: "ملغي",
    icon: X,
    color: "hsl(var(--destructive))",
    bgColor: "hsl(var(--destructive) / 0.1)",
    step: 0
  }
};

const statusOrder: (keyof typeof statusConfig)[] = [
  'pending', 'confirmed', 'preparing', 'ready', 'shipped', 'delivered'
];

export function OrderStatusProgress({ status, className }: OrderStatusProgressProps) {
  const currentStep = statusConfig[status].step;
  const isCancelled = status === 'cancelled';

  if (isCancelled) {
    const CancelledIcon = statusConfig.cancelled.icon;
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div 
          className="flex items-center justify-center w-8 h-8 rounded-full"
          style={{ 
            backgroundColor: statusConfig.cancelled.bgColor,
            color: statusConfig.cancelled.color 
          }}
        >
          <CancelledIcon className="w-4 h-4" />
        </div>
        <span className="text-sm font-medium" style={{ color: statusConfig.cancelled.color }}>
          {statusConfig.cancelled.label}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {statusOrder.map((statusKey, index) => {
        const config = statusConfig[statusKey];
        const Icon = config.icon;
        const isCompleted = config.step <= currentStep;
        const isCurrent = config.step === currentStep;
        
        return (
          <div key={statusKey} className="flex items-center">
            <div 
              className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 ${
                isCurrent ? 'scale-110 ring-2 ring-offset-1' : ''
              }`}
              style={{ 
                backgroundColor: isCompleted ? config.bgColor : 'hsl(var(--muted))',
                color: isCompleted ? config.color : 'hsl(var(--muted-foreground))'
              } as React.CSSProperties}
            >
              <Icon className="w-4 h-4" />
            </div>
            
            {index < statusOrder.length - 1 && (
              <div 
                className="w-6 h-0.5 mx-1 transition-colors duration-300"
                style={{ 
                  backgroundColor: config.step < currentStep 
                    ? 'hsl(var(--primary))' 
                    : 'hsl(var(--border))' 
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}