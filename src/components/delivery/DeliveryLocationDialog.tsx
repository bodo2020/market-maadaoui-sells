
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
    governorate?: string;
    city?: string;
    area?: string;
    neighborhood?: string;
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
  const [governorate, setGovernorate] = useState(location?.governorate || "");
  const [city, setCity] = useState(location?.city || "");
  const [area, setArea] = useState(location?.area || "");
  const [neighborhood, setNeighborhood] = useState(location?.neighborhood || "");
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
        governorate,
        city,
        area,
        neighborhood,
        name: name || `${governorate} - ${city} - ${area}${neighborhood ? ` - ${neighborhood}` : ''}`,
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
      <DialogContent className="sm:max-w-[425px] rtl">
        <DialogHeader>
          <DialogTitle>
            {location ? "تعديل منطقة التوصيل" : "إضافة منطقة توصيل جديدة"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="governorate">المحافظة</Label>
            <Input
              id="governorate"
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value)}
              placeholder="أدخل اسم المحافظة"
              className="text-right"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="city">المدينة</Label>
            <Input
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="أدخل اسم المدينة"
              className="text-right"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="area">المنطقة</Label>
            <Input
              id="area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="أدخل اسم المنطقة"
              className="text-right"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="neighborhood">الحي</Label>
            <Input
              id="neighborhood"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="أدخل اسم الحي (اختياري)"
              className="text-right"
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
              className="text-right"
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
              className="text-right"
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Switch
              id="active"
              checked={active}
              onCheckedChange={setActive}
            />
            <Label htmlFor="active">تفعيل المنطقة</Label>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="notes">ملاحظات</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات إضافية..."
              className="text-right"
            />
          </div>
          
          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? "جاري الحفظ..." : location ? "تحديث" : "إضافة"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
