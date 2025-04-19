
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Order } from "@/types";
import { useDeliveryPersonnel } from "@/hooks/delivery/useDeliveryPersonnel";
import { Loader } from "lucide-react";

interface AssignDeliveryDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (deliveryPerson: string, trackingNumber: string) => void;
}

export function AssignDeliveryDialog({
  order,
  open,
  onOpenChange,
  onConfirm
}: AssignDeliveryDialogProps) {
  const [deliveryPerson, setDeliveryPerson] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { deliveryPersonnel, loading } = useDeliveryPersonnel();
  
  // Reset form when order changes
  useEffect(() => {
    if (order) {
      setDeliveryPerson(order.delivery_person || "");
      setTrackingNumber(order.tracking_number || "");
    }
  }, [order]);
  
  const handleSubmit = () => {
    if (!deliveryPerson) return;
    
    setIsSubmitting(true);
    
    try {
      onConfirm(deliveryPerson, trackingNumber);
    } catch (error) {
      console.error("Error assigning delivery person:", error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (!order) return null;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md dir-rtl">
        <DialogHeader>
          <DialogTitle>تعيين مندوب توصيل</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="delivery-person">مندوب التوصيل</Label>
            <Select
              value={deliveryPerson}
              onValueChange={setDeliveryPerson}
              disabled={loading || isSubmitting}
            >
              <SelectTrigger id="delivery-person">
                <SelectValue placeholder="اختر مندوب التوصيل" />
              </SelectTrigger>
              <SelectContent>
                {loading ? (
                  <div className="flex items-center justify-center p-2">
                    <Loader className="h-4 w-4 animate-spin" />
                    <span className="mr-2">جاري التحميل...</span>
                  </div>
                ) : deliveryPersonnel.length === 0 ? (
                  <div className="text-center p-2 text-muted-foreground">
                    لا يوجد مندوبين متاحين
                  </div>
                ) : (
                  deliveryPersonnel.map(person => (
                    <SelectItem key={person.id} value={person.name}>
                      {person.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="tracking-number">رقم التتبع (اختياري)</Label>
            <Input
              id="tracking-number"
              value={trackingNumber}
              onChange={e => setTrackingNumber(e.target.value)}
              placeholder="أدخل رقم التتبع"
              disabled={isSubmitting}
            />
          </div>
        </div>
        
        <DialogFooter className="sm:justify-start flex flex-row-reverse gap-2">
          <Button 
            type="button"
            onClick={handleSubmit}
            disabled={!deliveryPerson || isSubmitting}
          >
            {isSubmitting && <Loader className="h-4 w-4 animate-spin mr-2" />}
            تعيين
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
