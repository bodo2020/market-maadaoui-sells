import { useState, useEffect } from 'react';
import { Order } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Check, Clock, Package, Truck, MapPin, X, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { findOrCreateCustomer } from "@/services/supabase/customerService";
import { recordCashTransaction, RegisterType } from "@/services/supabase/cashTrackingService";
import { useBranchStore } from "@/stores/branchStore";

interface UpdateOrderStatusDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusUpdated: () => void;
}

export function UpdateOrderStatusDialog({ 
  order, 
  open, 
  onOpenChange,
  onStatusUpdated
}: UpdateOrderStatusDialogProps) {
  const { currentBranchId } = useBranchStore();
  const [status, setStatus] = useState<Order['status']>(order?.status || 'pending');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (order) {
      setStatus(order.status);
    }
  }, [order]);

  const updateOrderStatus = async () => {
    if (!order) return;
    
    try {
      setIsSubmitting(true);
      
      const updates = { 
        status,
        updated_at: new Date().toISOString()
      };

      if (status === 'delivered' && order.status !== 'delivered') {
        if (order.customer_name || order.customer_phone) {
          const customerInfo = {
            name: order.customer_name || 'عميل غير معروف',
            phone: order.customer_phone || undefined
          };
          
          const customer = await findOrCreateCustomer(customerInfo);
          if (customer) {
            console.log("Customer linked to order:", customer);
          }
        }

        for (const item of order.items) {
          try {
            const quantityToDeduct = item.is_bulk && item.bulk_quantity 
              ? Math.ceil(item.bulk_quantity) 
              : item.quantity;

            // Update inventory directly
            const { error: inventoryError } = await supabase
              .from('inventory')
              .update({ 
                quantity: quantityToDeduct * -1,
                updated_at: new Date().toISOString()
              })
              .eq('product_id', item.product_id);

            if (inventoryError) {
              console.error(`Error updating inventory for product ${item.product_id}:`, inventoryError);
              throw new Error(`فشل في تحديث المخزون للمنتج: ${item.product_name}`);
            }
            
            console.log(`Updated inventory for ${item.product_name}: -${quantityToDeduct}`);
          } catch (inventoryError) {
            console.error(`Error updating inventory for product ${item.product_id}:`, inventoryError);
            throw new Error(`فشل في تحديث المخزون للمنتج: ${item.product_name}`);
          }
        }

        if (order.payment_status === 'paid') {
          try {
            const branchId = order.branch_id || currentBranchId || undefined;
            await recordCashTransaction(
              order.total,
              'deposit',
              RegisterType.ONLINE,
              `إيداع من الطلب رقم ${order.id.slice(-8)} - ${order.customer_name || 'عميل غير معروف'}`,
              '',
              branchId
            );
            console.log(`Added ${order.total} to online cash register`);
          } catch (cashError) {
            console.error("Error recording cash transaction:", cashError);
            toast.error("تم تحديث المخزون لكن حدث خطأ في تسجيل المعاملة المالية");
          }
        }
      }

      const { error } = await supabase
        .from('online_orders')
        .update(updates)
        .eq('id', order.id);

      if (error) throw error;

      toast.success('تم تحديث حالة الطلب بنجاح');
      onStatusUpdated();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('حدث خطأ أثناء تحديث حالة الطلب');
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusOptions: {value: Order['status'], label: string, icon: JSX.Element}[] = [
    { value: 'pending', label: 'قيد المراجعة', icon: <Clock className="h-4 w-4 text-amber-500" /> },
    { value: 'confirmed', label: 'تم التأكيد', icon: <Check className="h-4 w-4 text-blue-500" /> },
    { value: 'preparing', label: 'قيد التجهيز', icon: <Package className="h-4 w-4 text-orange-500" /> },
    { value: 'ready', label: 'جاهز للشحن', icon: <Check className="h-4 w-4 text-green-500" /> },
    { value: 'shipped', label: 'تم الشحن', icon: <Truck className="h-4 w-4 text-blue-500" /> },
    { value: 'delivered', label: 'تم التسليم', icon: <MapPin className="h-4 w-4 text-green-600" /> },
    { value: 'cancelled', label: 'ملغي', icon: <X className="h-4 w-4 text-red-500" /> }
  ];

  const getStatusClass = (statusValue: Order['status']) => {
    const classes: Record<Order['status'], string> = {
      pending: 'border-amber-500 hover:bg-amber-50',
      confirmed: 'border-blue-500 hover:bg-blue-50',
      preparing: 'border-orange-500 hover:bg-orange-50',
      ready: 'border-green-500 hover:bg-green-50',
      shipped: 'border-blue-500 hover:bg-blue-50',
      delivered: 'border-gray-500 hover:bg-gray-50',
      cancelled: 'border-red-500 hover:bg-red-50'
    };
    return classes[statusValue] || '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تحديث حالة الطلب</DialogTitle>
        </DialogHeader>
        
        {order && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              الطلب رقم: <span className="font-mono">{order.id.slice(-8)}</span>
            </div>
            
            <RadioGroup value={status} onValueChange={(value) => setStatus(value as Order['status'])}>
              {statusOptions.map((item) => (
                <div key={item.value} className={`border-2 rounded-lg p-3 cursor-pointer transition-colors ${
                  status === item.value ? getStatusClass(item.value) : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <Label 
                    htmlFor={item.value} 
                    className="flex items-center space-x-3 space-x-reverse cursor-pointer w-full"
                  >
                    <RadioGroupItem value={item.value} id={item.value} />
                    <div className="flex items-center space-x-2 space-x-reverse flex-1">
                      {item.icon}
                      <span className="font-medium">{item.label}</span>
                    </div>
                    {status === item.value && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            

            {status === 'delivered' && (
              <div className="text-sm bg-blue-50 border border-blue-200 rounded-md p-3 mt-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-blue-800">
                    سيتم خصم المنتجات من المخزون وإضافة المبلغ إلى خزنة الأونلاين عند اكتمال الطلب.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
        
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            إلغاء
          </Button>
          <Button 
            onClick={updateOrderStatus} 
            disabled={!order || status === order.status || isSubmitting}
          >
            {isSubmitting ? 'جاري التحديث...' : 'تحديث الحالة'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}