
import { Order } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Bike } from "lucide-react";

interface OrderSummaryActionsProps {
  order: Order;
  onUpdateStatus: () => void;
  onPaymentConfirm: () => void;
  onAssignDelivery: () => void;
  onUpdateShipping: (status: 'shipped' | 'done') => void;
  isUpdatingShipping: boolean;
}

export function OrderSummaryActions({
  order,
  onUpdateStatus,
  onPaymentConfirm,
  onAssignDelivery,
  onUpdateShipping,
  isUpdatingShipping
}: OrderSummaryActionsProps) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <Button 
          variant={order.status === 'ready' ? 'default' : 'outline'} 
          className="w-full" 
          onClick={onUpdateStatus}
        >
          تجهيز المنتجات
        </Button>
      </div>
      
      <div className="flex items-center gap-3 mt-4">
        {order.payment_status === 'pending' ? (
          <Button 
            variant="outline"
            className="w-full"
            onClick={onPaymentConfirm}
          >
            بانتظار الدفع
          </Button>
        ) : (
          <Badge 
            variant="default"
            className="px-4 py-2 text-base w-full flex justify-center items-center"
          >
            مدفوع بالكامل
          </Badge>
        )}
      </div>

      <div className="mt-6 space-y-3">
        <h3 className="font-medium text-lg">حالة التوصيل</h3>
        <div className="flex gap-3">
          <Button 
            variant={order.status === 'shipped' ? 'default' : 'outline'}
            className="w-full"
            disabled={isUpdatingShipping || order.status === 'shipped' || order.status === 'done'}
            onClick={() => onUpdateShipping('shipped')}
          >
            خرج للتوصيل
          </Button>
          <Button 
            variant={order.status === 'done' ? 'default' : 'outline'}
            className="w-full"
            disabled={isUpdatingShipping || order.status === 'done'}
            onClick={() => onUpdateShipping('done')}
          >
            تم التوصيل
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <h3 className="font-medium text-lg">تعيين مندوب توصيل</h3>
        <Button 
          variant="outline"
          className="w-full flex gap-2 items-center justify-center"
          onClick={onAssignDelivery}
        >
          <Bike className="w-4 h-4" />
          {order.delivery_person ? 'تغيير مندوب التوصيل' : 'اختيار مندوب التوصيل'}
        </Button>
        {order.delivery_person && (
          <div className="p-2 bg-muted rounded-md mt-2">
            <p className="text-sm">المندوب: {order.delivery_person}</p>
            {order.tracking_number && (
              <p className="text-sm">رقم التتبع: {order.tracking_number}</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="space-y-1">
          <div className="flex justify-between">
            <span>المجموع الفرعي:</span>
            <span>{order.total} ج.م</span>
          </div>
          <div className="flex justify-between">
            <span>الشحن:</span>
            <span>0 ج.م</span>
          </div>
          <div className="flex justify-between">
            <span>الضرائب التقديرية:</span>
            <span>0 ج.م</span>
          </div>
          <Separator />
          <div className="flex justify-between font-bold">
            <span>المجموع:</span>
            <span>{order.total} ج.م</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>وسيلة الدفع:</span>
            <span>{order.payment_method || 'الدفع عند الاستلام'}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>المدفوع:</span>
            <span>0 ج.م</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>المتبقي:</span>
            <span>{order.total} ج.م</span>
          </div>
        </div>
      </div>
    </div>
  );
}
