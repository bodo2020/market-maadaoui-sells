
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createDeliveryLocation, fetchDeliveryTypes, createDeliveryTypePrice } from "@/services/supabase/deliveryService";
import { DeliveryType } from "@/types/shipping";

interface DeliveryLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  onSuccess?: () => void;
}

export default function DeliveryLocationDialog({
  open,
  onOpenChange,
  providerId,
  onSuccess
}: DeliveryLocationDialogProps) {
  const [loading, setLoading] = useState(false);
  const [deliveryTypes, setDeliveryTypes] = useState<DeliveryType[]>([]);
  const [governorate, setGovernorate] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [prices, setPrices] = useState<{ [key: string]: { price: number; estimatedTime: string } }>({});

  useEffect(() => {
    loadDeliveryTypes();
  }, []);

  useEffect(() => {
    if (governorate && city) {
      const generatedName = `${governorate} - ${city}${area ? ` - ${area}` : ''}${neighborhood ? ` - ${neighborhood}` : ''}`;
      setName(generatedName);
    }
  }, [governorate, city, area, neighborhood]);

  const loadDeliveryTypes = async () => {
    try {
      const data = await fetchDeliveryTypes();
      setDeliveryTypes(data);
      // Initialize prices state with empty values for each delivery type
      const initialPrices = data.reduce((acc, type) => ({
        ...acc,
        [type.id]: { price: 0, estimatedTime: '' }
      }), {});
      setPrices(initialPrices);
    } catch (error) {
      console.error('Error loading delivery types:', error);
      toast.error("حدث خطأ أثناء تحميل أنواع التوصيل");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      
      // Create the delivery location first
      const location = await createDeliveryLocation({
        name,
        governorate,
        city,
        area,
        neighborhood,
        provider_id: providerId, // Add the missing provider_id
        price: 0, // Default price will be 0 since we're using delivery_type_pricing
        active,
        notes
      });

      // Create pricing entries for each delivery type
      await Promise.all(
        Object.entries(prices).map(([typeId, { price, estimatedTime }]) =>
          createDeliveryTypePrice({
            delivery_location_id: location.id,
            delivery_type_id: typeId,
            price,
            estimated_time: estimatedTime
          })
        )
      );

      toast.success("تم إضافة منطقة التوصيل بنجاح");
      onSuccess?.();
      resetForm();
    } catch (error) {
      console.error('Error saving delivery location:', error);
      toast.error("حدث خطأ أثناء حفظ منطقة التوصيل");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setGovernorate("");
    setCity("");
    setArea("");
    setNeighborhood("");
    setName("");
    setActive(true);
    setNotes("");
    setPrices({});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rtl">
        <DialogHeader>
          <DialogTitle>إضافة منطقة توصيل جديدة</DialogTitle>
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
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="neighborhood">الحي</Label>
            <Input
              id="neighborhood"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="أدخل اسم الحي"
              className="text-right"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">الاسم المعروض (يتم إنشاؤه تلقائيًا)</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="الاسم المعروض للمنطقة"
              className="text-right"
              required
            />
          </div>

          <div className="space-y-4">
            <Label>أسعار التوصيل</Label>
            {deliveryTypes.map((type) => (
              <div key={type.id} className="space-y-2 border rounded-lg p-4">
                <Label>{type.name}</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label htmlFor={`price-${type.id}`}>السعر</Label>
                    <Input
                      id={`price-${type.id}`}
                      type="number"
                      value={prices[type.id]?.price || 0}
                      onChange={(e) => setPrices(prev => ({
                        ...prev,
                        [type.id]: { ...prev[type.id], price: Number(e.target.value) }
                      }))}
                      placeholder="أدخل السعر"
                      className="text-right"
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor={`time-${type.id}`}>الوقت المتوقع</Label>
                    <Input
                      id={`time-${type.id}`}
                      value={prices[type.id]?.estimatedTime || ''}
                      onChange={(e) => setPrices(prev => ({
                        ...prev,
                        [type.id]: { ...prev[type.id], estimatedTime: e.target.value }
                      }))}
                      placeholder="مثال: 30-45 دقيقة"
                      className="text-right"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">ملاحظات</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أية ملاحظات إضافية"
              className="text-right"
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

          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? "جاري الحفظ..." : "إضافة"}
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
