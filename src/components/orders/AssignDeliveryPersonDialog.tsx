
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User, UserRole } from "@/types";

interface AssignDeliveryPersonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  onConfirm?: () => void;
}

export function AssignDeliveryPersonDialog({
  open,
  onOpenChange,
  orderId,
  onConfirm
}: AssignDeliveryPersonDialogProps) {
  const [loading, setLoading] = useState(false);
  const [deliveryPersons, setDeliveryPersons] = useState<User[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<string>("");
  const [trackingNumber, setTrackingNumber] = useState<string>("");

  // Fetch delivery persons when dialog opens
  useEffect(() => {
    if (open) {
      fetchDeliveryPersons();
      fetchCurrentAssignment();
    }
  }, [open, orderId]);

  const fetchDeliveryPersons = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', UserRole.DELIVERY)
        .eq('active', true);
      
      if (error) throw error;
      
      // Convert the string role to UserRole enum
      const typedData = data?.map(user => ({
        ...user,
        role: user.role as UserRole
      })) || [];
      
      setDeliveryPersons(typedData);
    } catch (error) {
      console.error('Error fetching delivery persons:', error);
      toast.error("حدث خطأ أثناء تحميل مندوبي التوصيل");
    }
  };

  const fetchCurrentAssignment = async () => {
    try {
      const { data, error } = await supabase
        .from('online_orders')
        .select('delivery_person, tracking_number')
        .eq('id', orderId)
        .single();
      
      if (error) throw error;
      
      if (data) {
        setSelectedPerson(data.delivery_person || "");
        setTrackingNumber(data.tracking_number || "");
      }
    } catch (error) {
      console.error('Error fetching current assignment:', error);
    }
  };

  const handleAssign = async () => {
    if (!selectedPerson) {
      toast.error("الرجاء اختيار مندوب توصيل");
      return;
    }

    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({
          delivery_person: selectedPerson,
          tracking_number: trackingNumber || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);
      
      if (error) throw error;
      
      toast.success("تم تعيين مندوب التوصيل بنجاح");
      if (onConfirm) onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error('Error assigning delivery person:', error);
      toast.error("حدث خطأ أثناء تعيين مندوب التوصيل");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({
          delivery_person: null,
          tracking_number: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);
      
      if (error) throw error;
      
      toast.success("تم إلغاء تعيين مندوب التوصيل");
      if (onConfirm) onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error('Error clearing delivery person:', error);
      toast.error("حدث خطأ أثناء إلغاء تعيين مندوب التوصيل");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] dir-rtl">
        <DialogHeader>
          <DialogTitle>تعيين مندوب توصيل</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="delivery-person" className="text-right col-span-4">
              مندوب التوصيل
            </Label>
            <Select
              value={selectedPerson}
              onValueChange={setSelectedPerson}
            >
              <SelectTrigger className="col-span-4">
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
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="tracking-number" className="text-right col-span-4">
              رقم التتبع (اختياري)
            </Label>
            <Input
              id="tracking-number"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              className="col-span-4"
            />
          </div>
        </div>
        
        <DialogFooter className="flex justify-between sm:justify-between">
          {selectedPerson && (
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleClear} 
              disabled={loading}
            >
              إلغاء التعيين
            </Button>
          )}
          <Button 
            type="button" 
            onClick={handleAssign} 
            disabled={loading}
          >
            {loading ? "جاري التعيين..." : "تعيين"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
