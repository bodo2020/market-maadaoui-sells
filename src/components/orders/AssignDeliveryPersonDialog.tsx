
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const [deliveryPerson, setDeliveryPerson] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // List of delivery persons (could be fetched from the database in a real app)
  const deliveryPersons = [
    "أحمد محمد",
    "محمود علي",
    "محمد أحمد",
    "عمر خالد",
    "خالد عمر"
  ];

  const assignDeliveryPerson = async () => {
    if (!orderId || !deliveryPerson) return;
    
    try {
      setIsSubmitting(true);
      
      const updateData: any = { 
        delivery_person: deliveryPerson,
        status: 'shipped',
        updated_at: new Date().toISOString()
      };
      
      if (trackingNumber) {
        updateData.tracking_number = trackingNumber;
      }
      
      const { error } = await supabase
        .from('online_orders')
        .update(updateData)
        .eq('id', orderId);
      
      if (error) throw error;
      
      toast.success('تم تعيين مندوب التوصيل بنجاح');
      onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error('Error assigning delivery person:', error);
      toast.error('حدث خطأ أثناء تعيين مندوب التوصيل');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">تعيين مندوب توصيل</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4 dir-rtl">
          <div className="space-y-2">
            <Label htmlFor="delivery-person">اختر مندوب التوصيل</Label>
            <Select
              value={deliveryPerson}
              onValueChange={setDeliveryPerson}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر مندوب التوصيل" />
              </SelectTrigger>
              <SelectContent>
                {deliveryPersons.map((person) => (
                  <SelectItem key={person} value={person}>
                    {person}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="tracking-number">رقم التتبع (اختياري)</Label>
            <Input
              id="tracking-number"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="أدخل رقم التتبع"
            />
          </div>
        </div>
        
        <DialogFooter className="flex flex-row gap-2 sm:justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            disabled={isSubmitting || !deliveryPerson}
            onClick={assignDeliveryPerson}
          >
            تعيين
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
