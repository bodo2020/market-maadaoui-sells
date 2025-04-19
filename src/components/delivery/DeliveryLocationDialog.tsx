
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createGovernorate, createCity, createArea, createNeighborhood } from "@/services/supabase/deliveryService";
import DeliveryTypePricing from "./DeliveryTypePricing";

interface DeliveryLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'governorate' | 'city' | 'area' | 'neighborhood';
  parentData?: {
    governorate?: string;
    city?: string;
    area?: string;
  };
  providerId?: string;
  onSuccess?: () => void;
}

export default function DeliveryLocationDialog({
  open,
  onOpenChange,
  mode,
  parentData,
  providerId,
  onSuccess
}: DeliveryLocationDialogProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [newLocationId, setNewLocationId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let result;
      switch (mode) {
        case 'governorate':
          result = await createGovernorate({ 
            governorate: name,
            provider_id: providerId 
          });
          setNewLocationId(result.id);
          break;
        case 'city':
          if (parentData?.governorate) {
            result = await createCity({
              governorate: parentData.governorate,
              city: name,
              provider_id: providerId
            });
            setNewLocationId(result.id);
          }
          break;
        case 'area':
          if (parentData?.governorate && parentData?.city) {
            result = await createArea({
              governorate: parentData.governorate,
              city: parentData.city,
              area: name,
              provider_id: providerId
            });
            setNewLocationId(result.id);
          }
          break;
        case 'neighborhood':
          if (parentData?.governorate && parentData?.city && parentData?.area) {
            result = await createNeighborhood({
              governorate: parentData.governorate,
              city: parentData.city,
              area: parentData.area,
              neighborhood: name,
              price: 0, // Add default price to fix the TypeScript error
              provider_id: providerId
            });
            setNewLocationId(result.id);
          }
          break;
      }
      
      setShowPricing(true);
    } catch (error) {
      console.error('Error creating location:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    onSuccess?.();
    setName("");
    setShowPricing(false);
    setNewLocationId(null);
    onOpenChange(false);
  };

  const titles = {
    governorate: 'إضافة محافظة جديدة',
    city: 'إضافة مدينة جديدة',
    area: 'إضافة منطقة جديدة',
    neighborhood: 'إضافة حي جديد'
  };

  const labels = {
    governorate: 'اسم المحافظة',
    city: 'اسم المدينة',
    area: 'اسم المنطقة',
    neighborhood: 'اسم الحي'
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rtl">
        <DialogHeader>
          <DialogTitle>{showPricing ? "أسعار التوصيل" : titles[mode]}</DialogTitle>
        </DialogHeader>
        
        {!showPricing ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{labels[mode]}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`أدخل ${labels[mode]}`}
                className="text-right"
                required
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "جاري الحفظ..." : "التالي"}
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
        ) : (
          <DeliveryTypePricing 
            locationId={newLocationId!}
            onSuccess={handleFinish}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
