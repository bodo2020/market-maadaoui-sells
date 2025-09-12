import { useState } from "react";
import { Order } from "@/types";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { CheckCircle, Clock, Package, Truck, MapPin, X, Check } from "lucide-react";

interface OrderStatusSelectorProps {
  currentStatus: Order['status'];
  onStatusChange: (newStatus: Order['status'], notes?: string) => void;
  isUpdating?: boolean;
  className?: string;
}

const statusFlow: Record<Order['status'], Order['status'][]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: []
};

const statusConfig = {
  pending: {
    label: "قيد المراجعة",
    icon: Clock,
    description: "الطلب في انتظار المراجعة"
  },
  confirmed: {
    label: "تم التأكيد",
    icon: CheckCircle,
    description: "تم تأكيد الطلب وسيتم تجهيزه"
  },
  preparing: {
    label: "قيد التجهيز",
    icon: Package,
    description: "جاري تجهيز المنتجات"
  },
  ready: {
    label: "جاهز للشحن",
    icon: CheckCircle,
    description: "المنتجات جاهزة للشحن"
  },
  shipped: {
    label: "تم الشحن",
    icon: Truck,
    description: "تم شحن الطلب"
  },
  delivered: {
    label: "تم التسليم",
    icon: MapPin,
    description: "تم تسليم الطلب بنجاح"
  },
  cancelled: {
    label: "ملغي",
    icon: X,
    description: "تم إلغاء الطلب"
  }
};

export function OrderStatusSelector({ 
  currentStatus, 
  onStatusChange, 
  isUpdating = false,
  className 
}: OrderStatusSelectorProps) {
  const [selectedStatus, setSelectedStatus] = useState<Order['status'] | null>(null);
  const [notes, setNotes] = useState("");

  const nextStatuses = statusFlow[currentStatus] || [];
  
  const handleConfirm = () => {
    if (selectedStatus) {
      onStatusChange(selectedStatus, notes);
      setSelectedStatus(null);
      setNotes("");
    }
  };

  const getNextStatusButton = (status: Order['status']) => {
    const config = statusConfig[status];
    const Icon = config.icon;
    const isSelected = selectedStatus === status;
    
    return (
      <button
        key={status}
        onClick={() => setSelectedStatus(isSelected ? null : status)}
        disabled={isUpdating}
        className={`
          flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all duration-200
          ${isSelected 
            ? 'bg-primary text-primary-foreground border-primary ring-2 ring-primary/20' 
            : 'bg-background hover:bg-muted border-border hover:border-primary/30'
          }
          ${isUpdating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <Icon className="w-4 h-4" />
        <div className="text-start">
          <div className="text-sm font-medium">{config.label}</div>
          <div className="text-xs opacity-70">{config.description}</div>
        </div>
      </button>
    );
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">الحالة الحالية:</span>
        <OrderStatusBadge status={currentStatus} />
      </div>

      {nextStatuses.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-medium text-foreground">تحديث الحالة إلى:</div>
          <div className="grid gap-2">
            {nextStatuses.map(getNextStatusButton)}
          </div>
        </div>
      )}

      {selectedStatus && (
        <div className="space-y-3 p-4 bg-muted/50 rounded-lg border">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle className="w-4 h-4 text-primary" />
            سيتم تحديث الحالة إلى: 
            <OrderStatusBadge status={selectedStatus} />
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              ملاحظات (اختيارية)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أضف ملاحظات حول هذا التحديث..."
              className="w-full px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              rows={2}
              disabled={isUpdating}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleConfirm}
              disabled={isUpdating}
              size="sm"
              className="flex-1"
            >
              {isUpdating ? (
                <>جاري التحديث...</>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  تأكيد التحديث
                </>
              )}
            </Button>
            <Button
              onClick={() => setSelectedStatus(null)}
              disabled={isUpdating}
              variant="outline"
              size="sm"
            >
              إلغاء
            </Button>
          </div>
        </div>
      )}

      {nextStatuses.length === 0 && currentStatus !== 'cancelled' && (
        <div className="text-sm text-muted-foreground text-center py-4">
          {currentStatus === 'delivered' 
            ? '✅ تم إنجاز هذا الطلب بنجاح' 
            : '⏳ لا توجد إجراءات متاحة للحالة الحالية'
          }
        </div>
      )}
    </div>
  );
}