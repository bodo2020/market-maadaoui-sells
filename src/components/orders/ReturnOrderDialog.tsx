
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OrderItem } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { updateProductQuantity } from "@/services/supabase/productService";
import { RegisterType, recordCashTransaction } from "@/services/supabase/cashTrackingService";

interface ReturnOrderDialogProps {
  orderId: string;
  items: OrderItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ReturnOrderDialog({
  orderId,
  items,
  open,
  onOpenChange,
  onConfirm
}: ReturnOrderDialogProps) {
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleQuantityChange = (productId: string, quantity: number) => {
    const originalItem = items.find(item => item.product_id === productId);
    if (!originalItem || quantity > originalItem.quantity) return;
    
    setSelectedItems(prev => ({
      ...prev,
      [productId]: quantity
    }));
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      
      const returnItems = Object.entries(selectedItems)
        .filter(([_, quantity]) => quantity > 0)
        .map(([productId, quantity]) => {
          const item = items.find(i => i.product_id === productId);
          if (!item) return null;
          return {
            product_id: productId,
            quantity,
            price: item.price,
            total: item.price * quantity,
            reason
          };
        })
        .filter(Boolean);

      if (returnItems.length === 0) {
        toast.error("الرجاء اختيار منتج واحد على الأقل للإرجاع");
        return;
      }

      const totalAmount = returnItems.reduce((sum, item) => sum + (item?.total || 0), 0);

      // لا نحتاج معرف فرع بعد الآن - سنستخدم جدول المخزون مباشرة

      // Create the return record
      const { data: returnData, error: returnError } = await supabase
        .from('returns')
        .insert({
          order_id: orderId,
          total_amount: totalAmount,
          reason,
          status: 'approved' // Set to approved immediately
        })
        .select()
        .single();

      if (returnError) throw returnError;

      // Add the return items
      const { error: itemsError } = await supabase
        .from('return_items')
        .insert(
          returnItems.map(item => ({
            return_id: returnData.id,
            ...item
          }))
        );

      if (itemsError) throw itemsError;

      // Update the order's return status
      const { error: orderError } = await supabase
        .from('online_orders')
        .update({ return_status: 'returned' })
        .eq('id', orderId);

      if (orderError) throw orderError;

      // Process inventory changes - add back returned items to inventory
      console.log('Processing inventory changes for returned items:', returnItems);
      for (const item of returnItems) {
        if (!item) continue;
        console.log(`Updating inventory for product ${item.product_id} quantity by +${item.quantity}`);
        try {
          await updateProductQuantity(item.product_id, item.quantity, 'increase');
          console.log(`Successfully updated inventory for product ${item.product_id}`);
        } catch (error) {
          console.error(`Failed to update inventory for product ${item.product_id}:`, error);
          throw error;
        }
      }

      // Record the cash transaction for the return (negative amount)
      console.log(`Recording cash transaction: -${totalAmount} for return`);
      try {
        // Get current user ID
        const { data: { user } } = await supabase.auth.getUser();
        
        await recordCashTransaction(
          totalAmount, // Use positive amount 
          'withdrawal', 
          RegisterType.ONLINE,
          `مرتجع للطلب #${orderId.slice(0, 8)}`,
          user?.id || 'system' // Pass user ID
        );
        console.log('Cash transaction recorded successfully');
      } catch (error) {
        console.error('Failed to record cash transaction:', error);
      }

      toast.success("تم تسجيل المرتجع بنجاح");
      onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting return:', error);
      toast.error("حدث خطأ أثناء تقديم طلب الإرجاع");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>إرجاع منتجات</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 dir-rtl">
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.product_id} className="flex items-center gap-4 border-b pb-2">
                <div className="flex-1">
                  <p className="font-medium">{item.product_name || 'منتج غير معروف'}</p>
                  <p className="text-sm text-muted-foreground">الكمية الأصلية: {item.quantity}</p>
                  <p className="text-sm text-muted-foreground">السعر: {item.price} ج.م</p>
                </div>
                <div className="text-right">
                  <label className="text-sm font-medium block mb-1">كمية الإرجاع</label>
                  <Input
                    type="number"
                    min="0"
                    max={item.quantity}
                    value={selectedItems[item.product_id] || 0}
                    onChange={(e) => handleQuantityChange(item.product_id, parseInt(e.target.value) || 0)}
                    className="w-24 text-center"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">سبب الإرجاع</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="اكتب سبب الإرجاع هنا..."
              className="h-24"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "جاري التقديم..." : "تأكيد الإرجاع"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
