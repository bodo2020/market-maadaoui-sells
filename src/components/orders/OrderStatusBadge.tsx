import { Badge } from "@/components/ui/badge";
import { Order } from "@/types";
import { CheckCircle, Clock, Package, Truck, MapPin, X } from "lucide-react";

interface OrderStatusBadgeProps {
  status: Order['status'];
  className?: string;
}

const statusConfig = {
  pending: {
    label: "قيد المراجعة",
    icon: Clock,
    variant: "secondary" as const,
    className: "bg-muted text-muted-foreground"
  },
  confirmed: {
    label: "تم التأكيد",
    icon: CheckCircle,
    variant: "default" as const,
    className: "bg-primary/10 text-primary border-primary/20"
  },
  preparing: {
    label: "قيد التجهيز",
    icon: Package,
    variant: "secondary" as const,
    className: "bg-warning/10 text-warning border-warning/20"
  },
  ready: {
    label: "جاهز للشحن",
    icon: CheckCircle,
    variant: "secondary" as const,
    className: "bg-success/10 text-success border-success/20"
  },
  shipped: {
    label: "تم الشحن",
    icon: Truck,
    variant: "secondary" as const,
    className: "bg-info/10 text-info border-info/20"
  },
  delivered: {
    label: "تم التسليم",
    icon: MapPin,
    variant: "secondary" as const,
    className: "bg-success/10 text-success border-success/20"
  },
  cancelled: {
    label: "ملغي",
    icon: X,
    variant: "destructive" as const,
    className: "bg-destructive/10 text-destructive border-destructive/20"
  }
};

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge 
      variant={config.variant} 
      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium ${config.className} ${className}`}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}