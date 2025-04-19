
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fetchDeliveryTypes, createDeliveryTypePrice } from "@/services/supabase/deliveryService";

interface DeliveryType {
  id: string;
  name: string;
  description?: string;
}

interface DeliveryTypePricingProps {
  locationId: string;
  onSuccess: () => void;
}

export default function DeliveryTypePricing({ locationId, onSuccess }: DeliveryTypePricingProps) {
  const [deliveryTypes, setDeliveryTypes] = useState<DeliveryType[]>([]);
  const [prices, setPrices] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadDeliveryTypes();
  }, []);

  const loadDeliveryTypes = async () => {
    try {
      const types = await fetchDeliveryTypes();
      setDeliveryTypes(types);
      const initialPrices = types.reduce((acc, type) => ({
        ...acc,
        [type.id]: 0
      }), {});
      setPrices(initialPrices);
    } catch (error) {
      console.error('Error loading delivery types:', error);
      toast.error("حدث خطأ أثناء تحميل أنواع التوصيل");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await Promise.all(
        Object.entries(prices).map(([typeId, price]) =>
          createDeliveryTypePrice({
            delivery_location_id: locationId,
            delivery_type_id: typeId,
            price: Number(price)
          })
        )
      );
      onSuccess();
    } catch (error) {
      console.error('Error saving prices:', error);
      toast.error("حدث خطأ أثناء حفظ الأسعار");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {deliveryTypes.map((type) => (
        <div key={type.id} className="flex items-center gap-4">
          <label className="flex-1 text-right">{type.name}</label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={prices[type.id]}
            onChange={(e) => setPrices(prev => ({
              ...prev,
              [type.id]: parseFloat(e.target.value) || 0
            }))}
            className="w-32 text-left"
          />
        </div>
      ))}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </form>
  );
}
