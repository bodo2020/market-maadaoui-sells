
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchDeliveryTypes, updateDeliveryTypePricing } from "@/services/supabase/deliveryService";
import { toast } from "sonner";

interface DeliveryTypePricingProps {
  locationId: string;
  onSuccess?: () => void;
}

export default function DeliveryTypePricing({ locationId, onSuccess }: DeliveryTypePricingProps) {
  const [deliveryTypes, setDeliveryTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [prices, setPrices] = useState<Record<string, { price: string; estimatedTime: string }>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadDeliveryTypes = async () => {
      try {
        const types = await fetchDeliveryTypes();
        setDeliveryTypes(types);
        
        // Initialize prices object
        const initialPrices: Record<string, { price: string; estimatedTime: string }> = {};
        types.forEach(type => {
          initialPrices[type.id] = { price: '0', estimatedTime: '' };
        });
        setPrices(initialPrices);
      } catch (error) {
        console.error("Error loading delivery types:", error);
      }
    };
    
    loadDeliveryTypes();
  }, []);

  const handlePriceChange = (typeId: string, value: string) => {
    setPrices(prev => ({
      ...prev,
      [typeId]: { ...prev[typeId], price: value }
    }));
  };

  const handleTimeChange = (typeId: string, value: string) => {
    setPrices(prev => ({
      ...prev,
      [typeId]: { ...prev[typeId], estimatedTime: value }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Process and save all delivery type prices
      for (const typeId of Object.keys(prices)) {
        await updateDeliveryTypePricing({
          delivery_location_id: locationId,
          delivery_type_id: typeId,
          price: parseFloat(prices[typeId].price) || 0,
          estimated_time: prices[typeId].estimatedTime
        });
      }
      
      toast.success("تم حفظ أسعار التوصيل بنجاح");
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error saving delivery prices:", error);
      toast.error("حدث خطأ أثناء حفظ أسعار التوصيل");
    } finally {
      setLoading(false);
    }
  };

  // Check if form has valid data to enable the save button
  const isFormValid = Object.keys(prices).length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {deliveryTypes.map(type => (
        <div key={type.id} className="space-y-2 border p-3 rounded">
          <div className="font-medium mb-2">{type.name}</div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`price-${type.id}`}>السعر</Label>
              <Input
                id={`price-${type.id}`}
                type="number"
                min="0"
                step="0.1"
                value={prices[type.id]?.price || ''}
                onChange={(e) => handlePriceChange(type.id, e.target.value)}
                placeholder="أدخل السعر"
                className="text-right"
              />
            </div>
            
            <div>
              <Label htmlFor={`time-${type.id}`}>وقت التوصيل</Label>
              <Input
                id={`time-${type.id}`}
                value={prices[type.id]?.estimatedTime || ''}
                onChange={(e) => handleTimeChange(type.id, e.target.value)}
                placeholder="مثال: 30-60 دقيقة"
                className="text-right"
              />
            </div>
          </div>
        </div>
      ))}
      
      <div className="flex justify-end gap-2">
        <Button 
          type="submit" 
          disabled={loading || !isFormValid}
        >
          {loading ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </form>
  );
}
