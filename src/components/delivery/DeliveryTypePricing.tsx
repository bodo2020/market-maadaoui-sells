
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchDeliveryTypes, updateDeliveryTypePricing, fetchDeliveryTypePricing } from "@/services/supabase/deliveryService";
import { toast } from "sonner";

interface DeliveryTypePricingProps {
  locationId: string;
  onSuccess?: () => void;
}

export default function DeliveryTypePricing({ locationId, onSuccess }: DeliveryTypePricingProps) {
  const [deliveryTypes, setDeliveryTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [prices, setPrices] = useState<Record<string, { price: string; estimatedTime: string }>>({});
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [isValid, setIsValid] = useState(false);

  // Load delivery types and existing pricing data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingData(true);
        
        // Load delivery types
        const types = await fetchDeliveryTypes();
        setDeliveryTypes(types);
        
        // Initialize prices object
        const initialPrices: Record<string, { price: string; estimatedTime: string }> = {};
        
        // Load existing pricing data
        if (locationId) {
          const existingPricing = await fetchDeliveryTypePricing(locationId);
          
          // Populate the prices object with existing data
          types.forEach(type => {
            const pricing = existingPricing.find(p => p.delivery_type_id === type.id);
            if (pricing) {
              initialPrices[type.id] = { 
                price: pricing.price.toString(), 
                estimatedTime: pricing.estimated_time || '' 
              };
            } else {
              initialPrices[type.id] = { price: '0', estimatedTime: '' };
            }
          });
        } else {
          // If no location ID, initialize empty prices
          types.forEach(type => {
            initialPrices[type.id] = { price: '0', estimatedTime: '' };
          });
        }
        
        setPrices(initialPrices);
        validateForm(initialPrices);
      } catch (error) {
        console.error("Error loading delivery data:", error);
        toast.error("حدث خطأ أثناء تحميل بيانات التوصيل");
      } finally {
        setLoadingData(false);
      }
    };
    
    loadData();
  }, [locationId]);

  const validateForm = (currentPrices: Record<string, { price: string; estimatedTime: string }>) => {
    // Form is valid if we have at least one delivery type and all prices are valid numbers
    const hasTypes = Object.keys(currentPrices).length > 0;
    const allPricesValid = Object.values(currentPrices).every(
      item => !isNaN(parseFloat(item.price)) && parseFloat(item.price) >= 0
    );
    
    setIsValid(hasTypes && allPricesValid);
  };

  const handlePriceChange = (typeId: string, value: string) => {
    const newPrices = {
      ...prices,
      [typeId]: { ...prices[typeId], price: value }
    };
    setPrices(newPrices);
    validateForm(newPrices);
  };

  const handleTimeChange = (typeId: string, value: string) => {
    const newPrices = {
      ...prices,
      [typeId]: { ...prices[typeId], estimatedTime: value }
    };
    setPrices(newPrices);
    validateForm(newPrices);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      console.log("Saving prices for locationId:", locationId);
      console.log("Prices to save:", prices);
      
      // Process and save all delivery type prices
      const savePromises = Object.keys(prices).map(typeId => {
        const priceData = {
          delivery_location_id: locationId,
          delivery_type_id: typeId,
          price: parseFloat(prices[typeId].price) || 0,
          estimated_time: prices[typeId].estimatedTime
        };
        console.log("Saving price:", priceData);
        return updateDeliveryTypePricing(priceData);
      });
      
      await Promise.all(savePromises);
      
      toast.success("تم حفظ أسعار التوصيل بنجاح");
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error saving delivery prices:", error);
      toast.error("حدث خطأ أثناء حفظ أسعار التوصيل");
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return <div className="p-4 text-center">جاري تحميل بيانات التوصيل...</div>;
  }

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
          disabled={loading || !isValid}
        >
          {loading ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </form>
  );
}
