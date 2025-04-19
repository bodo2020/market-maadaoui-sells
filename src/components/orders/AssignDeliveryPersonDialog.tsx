
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface AssignDeliveryPersonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  onConfirm: () => void;
}

export function AssignDeliveryPersonDialog({
  open,
  onOpenChange,
  orderId,
  onConfirm
}: AssignDeliveryPersonDialogProps) {
  const [deliveryPerson, setDeliveryPerson] = useState<string>("");
  const [trackingNumber, setTrackingNumber] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAssign = async () => {
    if (!deliveryPerson.trim()) {
      toast.error("يرجى إدخال اسم مندوب التوصيل");
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      const updateData: {
        delivery_person: string;
        tracking_number?: string;
        status: 'shipped';
        updated_at: string;
      } = {
        delivery_person: deliveryPerson.trim(),
        status: 'shipped',
        updated_at: new Date().toISOString()
      };
      
      if (trackingNumber.trim()) {
        updateData.tracking_number = trackingNumber.trim();
      }
      
      const { error } = await supabase
        .from('online_orders')
        .update(updateData)
        .eq('id', orderId);
      
      if (error) throw error;
      
      toast.success("تم تعيين مندوب التوصيل بنجاح");
      onConfirm();
      onOpenChange(false);
      
      // Reset form
      setDeliveryPerson("");
      setTrackingNumber("");
    } catch (error) {
      console.error('Error assigning delivery person:', error);
      toast.error("حدث خطأ أثناء تعيين مندوب التوصيل");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md dir-rtl">
        <DialogHeader>
          <DialogTitle className="text-xl">تعيين مندوب توصيل</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="deliveryPerson">اسم مندوب التوصيل</Label>
            <Input
              id="deliveryPerson"
              value={deliveryPerson}
              onChange={(e) => setDeliveryPerson(e.target.value)}
              placeholder="اكتب اسم المندوب"
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="trackingNumber">رقم التتبع (اختياري)</Label>
            <Input
              id="trackingNumber"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="رقم التتبع"
            />
          </div>
        </div>
        
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            إلغاء
          </Button>
          <Button 
            onClick={handleAssign}
            disabled={isSubmitting || !deliveryPerson.trim()}
            className="w-full sm:w-auto"
          >
            {isSubmitting ? "جاري التعيين..." : "تعيين"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
