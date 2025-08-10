import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Check, Clock, Package, Truck, X } from "lucide-react";
import { Order } from "@/types";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { findOrCreateCustomer } from "@/services/supabase/customerService";
import { updateProductQuantity } from "@/services/supabase/productService";
import { RegisterType, recordCashTransaction } from "@/services/supabase/cashTrackingService";

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
  const [status, setStatus] = useState<Order['status']>(order?.status || 'waiting');
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

      if (status === 'done' && order.status !== 'done') {
        if (order.customer_name || order.customer_phone) {
          const customerInfo = {
            name: order.customer_name || 'عميل غير معروف',
            phone: order.customer_phone || undefined
          };
          
          const customer = await findOrCreateCustomer(customerInfo);
          if (customer) {
            console.log("Customer linked to order:", customer);
            if (!order.customer_id) {
              await supabase
                .from('online_orders')
                .update({ customer_id: customer.id })
                .eq('id', order.id);
            }
          }
        }
        
        const orderItems = order.items || [];
        console.log("Processing inventory for items:", orderItems);
        
        for (const item of orderItems) {
          const { data: product, error: productError } = await supabase
            .from('products')
            .select('*')
            .eq('id', item.product_id)
            .single();
            
          if (productError) {
            console.error("Error fetching product:", productError);
            continue;
          }
          
          let quantityToDeduct = item.quantity;
          if (product.bulk_enabled && item.barcode === product.bulk_barcode) {
            quantityToDeduct = item.quantity * (product.bulk_quantity || 1);
          }
          if (item.is_weight_based || product.barcode_type === 'scale') {
            quantityToDeduct = Math.floor(quantityToDeduct);
          }
          
          await updateProductQuantity(product.id, quantityToDeduct, 'decrease');
          console.log(`Deducted ${quantityToDeduct} from product ${product.name}`);
        }
        
        if (order.payment_status === 'paid') {
          try {
            await recordCashTransaction(
              order.total, 
              'deposit', 
              RegisterType.ONLINE, 
              `أمر الدفع من الطلب الإلكتروني #${order.id.slice(0, 8)}`, 
              ''
            );
            console.log(`Added ${order.total} to online cash register`);
          } catch (cashError) {
            console.error("Error recording cash transaction:", cashError);
            toast.error("تم تحديث المخزون لكن حدث خطأ في تسجيل المعاملة المالية");
          }
        }
      }
      
      if (status === 'ready' && order.payment_status === 'pending') {
        await supabase
          .from('online_orders')
          .update({ 
            status,
            payment_status: 'paid',
            updated_at: new Date().toISOString()
          })
          .eq('id', order.id);
          
        toast.success('تم تحديث حالة الطلب بنجاح');
        toast.info('تم تحديث حالة الدفع إلى "مدفوع"');
      } else {
        const { error } = await supabase
          .from('online_orders')
          .update(updates)
          .eq('id', order.id);
        
        if (error) throw error;
        
        toast.success('تم تحديث حالة الطلب بنجاح');
      }
      
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
    { value: 'waiting', label: 'في الانتظار', icon: <Clock className="h-4 w-4 text-amber-500" /> },
    { value: 'ready', label: 'جاهز للشحن', icon: <Package className="h-4 w-4 text-green-500" /> },
    { value: 'shipped', label: 'تم الشحن', icon: <Truck className="h-4 w-4 text-blue-500" /> },
    { value: 'done', label: 'مكتمل', icon: <Check className="h-4 w-4 text-green-600" /> },
    { value: 'cancelled', label: 'ملغي', icon: <X className="h-4 w-4 text-red-500" /> }
  ];

  const getStatusClass = (statusValue: Order['status']) => {
    const classes: Record<Order['status'], string> = {
      waiting: 'border-amber-500 hover:bg-amber-50',
      ready: 'border-green-500 hover:bg-green-50',
      shipped: 'border-blue-500 hover:bg-blue-50',
      done: 'border-gray-500 hover:bg-gray-50',
      cancelled: 'border-red-500 hover:bg-red-50'
    };
    return classes[statusValue] || '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">تحديث حالة الطلب</DialogTitle>
        </DialogHeader>
        
        {order && (
          <div className="space-y-6 dir-rtl">
            <div className="text-center space-y-2">
              <p className="text-muted-foreground">#{order.id.slice(0, 8)}</p>
              <p className="text-sm font-medium">اختر حالة الطلب الجديدة</p>
            </div>
            
            <RadioGroup 
              value={status} 
              onValueChange={(value) => setStatus(value as Order['status'])}
              className="grid gap-3"
            >
              {statusOptions.map((item) => (
                <div 
                  key={item.value}
                  className={`flex items-center space-x-2 space-x-reverse rounded-lg border-2 p-3 transition-colors ${getStatusClass(item.value)} ${status === item.value ? 'border-primary' : ''}`}
                >
                  <RadioGroupItem value={item.value} id={item.value} />
                  <Label 
                    htmlFor={item.value} 
                    className="flex flex-1 items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      {item.icon}
                      {item.label}
                    </span>
                    {status === item.value && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            
            {status === 'ready' && order.payment_status === 'pending' && (
              <div className="text-sm bg-yellow-50 border border-yellow-200 rounded-md p-3 mt-2">
                <p className="text-yellow-800">
                  سيتم تحديث حالة الدفع تلقائيًا إلى "مدفوع" عند تحديث الحالة إلى "جاهز للشحن".
                </p>
              </div>
            )}

            {status === 'done' && (
              <div className="text-sm bg-blue-50 border border-blue-200 rounded-md p-3 mt-2">
                <p className="text-blue-800">
                  سيتم خصم المنتجات من المخزون وإضافة المبلغ إلى خزنة الأونلاين عند اكتمال الطلب.
                </p>
              </div>
            )}
          </div>
        )}
        
        <DialogFooter className="gap-2 sm:gap-0 dir-rtl">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            إلغاء
          </Button>
          <Button 
            onClick={updateOrderStatus} 
            disabled={isSubmitting || !order || status === order.status}
            className="w-full sm:w-auto gap-2"
          >
            تحديث
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
