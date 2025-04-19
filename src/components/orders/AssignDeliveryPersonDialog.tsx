
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  const [deliveryPersons, setDeliveryPersons] = useState<any[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<string>('');
  const [trackingNumber, setTrackingNumber] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchDeliveryPersons();
  }, []);

  const fetchDeliveryPersons = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name')
        .eq('role', 'delivery')
        .eq('active', true);

      if (error) throw error;
      setDeliveryPersons(data || []);
    } catch (error) {
      console.error('Error fetching delivery persons:', error);
      toast.error('حدث خطأ أثناء تحميل قائمة مندوبي التوصيل');
    }
  };

  const handleAssign = async () => {
    if (!selectedPerson) {
      toast.error('يرجى اختيار مندوب التوصيل');
      return;
    }

    try {
      setIsLoading(true);

      const { error } = await supabase
        .from('online_orders')
        .update({
          delivery_person: selectedPerson,
          tracking_number: trackingNumber || null,
          status: 'shipped',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) throw error;

      toast.success('تم تعيين مندوب التوصيل بنجاح');
      onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error('Error assigning delivery person:', error);
      toast.error('حدث خطأ أثناء تعيين مندوب التوصيل');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dir-rtl">
        <DialogHeader>
          <DialogTitle>تعيين مندوب توصيل</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>اختر مندوب التوصيل</Label>
            <Select value={selectedPerson} onValueChange={setSelectedPerson}>
              <SelectTrigger>
                <SelectValue placeholder="اختر مندوب التوصيل" />
              </SelectTrigger>
              <SelectContent>
                {deliveryPersons.map(person => (
                  <SelectItem key={person.id} value={person.name}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>رقم التتبع (اختياري)</Label>
            <Input 
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="أدخل رقم التتبع"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
          <Button 
            onClick={handleAssign}
            disabled={!selectedPerson || isLoading}
          >
            تعيين
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
