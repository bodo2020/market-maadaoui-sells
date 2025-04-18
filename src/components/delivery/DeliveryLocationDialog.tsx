
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createDeliveryLocation, updateDeliveryLocation } from "@/services/supabase/deliveryService";

interface DeliveryLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location?: {
    id: string;
    name: string;
    price: number;
    estimated_time?: string;
    active: boolean;
    notes?: string;
  };
}

export default function DeliveryLocationDialog({
  open,
  onOpenChange,
  location
}: DeliveryLocationDialogProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(location?.name || "");
  const [price, setPrice] = useState(location?.price || 0);
  const [estimatedTime, setEstimatedTime] = useState(location?.estimated_time || "");
  const [active, setActive] = useState(location?.active ?? true);
  const [notes, setNotes] = useState(location?.notes || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const locationData = {
        name,
        price,
        estimated_time: estimatedTime,
        active,
        notes
      };

      if (location?.id) {
        await updateDeliveryLocation(location.id, locationData);
        toast.success("تم تحديث منطقة التوصيل بنجاح");
      } else {
        await createDeliveryLocation(locationData);
        toast.success("تم إضافة منطقة التوصيل بنجاح");
      }

      onOpenChange(false);
      window.location.reload();
    } catch (error) {
      console.error('Error saving delivery location:', error);
      toast.error("حدث خطأ أثناء حفظ منطقة التوصيل");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {location ? "تعديل منطقة التوصيل" : "إضافة منطقة توصيل جديدة"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">اسم المنطقة</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="أدخل اسم المنطقة"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="price">سعر التوصيل</Label>
            <Input
              id="price"
              type="number"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              placeholder="أدخل سعر التوصيل"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="estimatedTime">الوقت المتوقع للتوصيل</Label>
            <Input
              id="estimatedTime"
              value={estimatedTime}
              onChange={(e) => setEstimatedTime(e.target.value)}
              placeholder="مثال: 30-45 دقيقة"
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="active">تفعيل المنطقة</Label>
            <Switch
              id="active"
              checked={active}
              onCheckedChange={setActive}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="notes">ملاحظات</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات إضافية..."
            />
          </div>
          
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "جاري الحفظ..." : location ? "تحديث" : "إضافة"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
