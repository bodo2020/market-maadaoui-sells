
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Save, Trash2 } from "lucide-react";
import { fetchDeliveryTypes, fetchDeliveryTypePricing, createDeliveryTypePrice, deleteDeliveryTypePrice } from "@/services/supabase/deliveryService";
import { Badge } from "@/components/ui/badge";
import { DeliveryType, DeliveryTypePrice } from "@/types/shipping";

interface DeliveryTypePricingProps {
  locationId: string;
  onSuccess?: () => void;
}

export default function DeliveryTypePricing({ locationId, onSuccess }: DeliveryTypePricingProps) {
  const queryClient = useQueryClient();
  const [isAddingPrice, setIsAddingPrice] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [estimatedTimeInput, setEstimatedTimeInput] = useState("");

  const { data: deliveryTypes = [], isLoading: typesLoading } = useQuery({
    queryKey: ["deliveryTypes"],
    queryFn: fetchDeliveryTypes
  });

  const { data: pricingData = [], isLoading: pricingLoading } = useQuery({
    queryKey: ["deliveryTypePricing", locationId],
    queryFn: () => fetchDeliveryTypePricing(locationId),
    enabled: !!locationId
  });

  // Reset form when location changes
  useEffect(() => {
    setIsAddingPrice(false);
    setSelectedType(null);
    setPriceInput("");
    setEstimatedTimeInput("");
  }, [locationId]);

  const createPriceMutation = useMutation({
    mutationFn: (data: {
      neighborhood_id: string;
      delivery_type_id: string;
      price: number;
      estimated_time?: string;
    }) => createDeliveryTypePrice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveryTypePricing", locationId] });
      toast.success("تم إضافة السعر بنجاح");
      setIsAddingPrice(false);
      setSelectedType(null);
      setPriceInput("");
      setEstimatedTimeInput("");
      onSuccess?.();
    },
    onError: (error) => {
      console.error("Error creating delivery type price:", error);
      toast.error("حدث خطأ أثناء إضافة السعر");
    }
  });

  const deletePriceMutation = useMutation({
    mutationFn: (id: string) => deleteDeliveryTypePrice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveryTypePricing", locationId] });
      toast.success("تم حذف السعر بنجاح");
    },
    onError: (error) => {
      console.error("Error deleting delivery type price:", error);
      toast.error("حدث خطأ أثناء حذف السعر");
    }
  });

  const handleAddPrice = () => {
    if (!selectedType) {
      toast.error("الرجاء اختيار نوع التوصيل");
      return;
    }

    if (!priceInput || isNaN(Number(priceInput))) {
      toast.error("الرجاء إدخال سعر صحيح");
      return;
    }

    createPriceMutation.mutate({
      neighborhood_id: locationId,
      delivery_type_id: selectedType,
      price: Number(priceInput),
      estimated_time: estimatedTimeInput || undefined
    });
  };

  // Find already priced delivery types to exclude from selection
  const existingTypesIds = Array.isArray(pricingData)
    ? pricingData.map((p: DeliveryTypePrice) => p.delivery_type_id)
    : [];
    
  const availableTypes = Array.isArray(deliveryTypes)
    ? deliveryTypes.filter((type: DeliveryType) => !existingTypesIds.includes(type.id))
    : [];

  // Get delivery type name by ID
  const getDeliveryTypeName = (typeId: string) => {
    const type = Array.isArray(deliveryTypes)
      ? deliveryTypes.find((t: DeliveryType) => t.id === typeId)
      : null;
    return type ? type.name : "غير معروف";
  };

  if (pricingLoading || typesLoading) {
    return <div className="text-center py-2 text-sm text-muted-foreground">جارٍ التحميل...</div>;
  }

  return (
    <div className="mt-2 space-y-2 text-sm">
      <div className="flex justify-between items-center mb-1">
        <span className="font-medium">خيارات التوصيل</span>
        {!isAddingPrice && availableTypes.length > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setIsAddingPrice(true)}
            className="h-7 px-2 text-xs"
          >
            <Plus className="h-3 w-3 ml-1" />
            إضافة
          </Button>
        )}
      </div>

      {pricingData.length === 0 && !isAddingPrice ? (
        <p className="text-xs text-muted-foreground">لا توجد خيارات توصيل مضافة بعد</p>
      ) : (
        <div className="space-y-2">
          {Array.isArray(pricingData) && pricingData.map((pricing: DeliveryTypePrice) => (
            <div key={pricing.id} className="flex justify-between items-center bg-muted/40 p-1.5 rounded">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="h-5 px-1.5 bg-background text-xs">
                  {getDeliveryTypeName(pricing.delivery_type_id)}
                </Badge>
                {pricing.estimated_time && (
                  <span className="text-xs text-muted-foreground">
                    {pricing.estimated_time}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">
                  {pricing.price} ج.م
                </span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={() => deletePriceMutation.mutate(pricing.id)}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isAddingPrice && (
        <div className="border-t pt-2 mt-2">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {availableTypes.map((type: DeliveryType) => (
                <Badge 
                  key={type.id} 
                  variant={selectedType === type.id ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setSelectedType(type.id)}
                >
                  {type.name}
                </Badge>
              ))}
            </div>
            
            <div className="flex gap-2">
              <Input
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="السعر"
                type="number"
                min="0"
                className="text-sm"
              />
              <Input
                value={estimatedTimeInput}
                onChange={(e) => setEstimatedTimeInput(e.target.value)}
                placeholder="وقت التوصيل (اختياري)"
                className="text-sm"
              />
            </div>
            
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddingPrice(false)}
                className="h-7 px-2 text-xs"
              >
                إلغاء
              </Button>
              <Button
                size="sm"
                onClick={handleAddPrice}
                className="h-7 px-3 text-xs"
                disabled={!selectedType || !priceInput}
              >
                <Save className="h-3 w-3 ml-1" />
                حفظ
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
