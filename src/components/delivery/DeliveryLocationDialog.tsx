
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { 
  createGovernorate,
  createCity,
  createArea,
  createNeighborhood
} from "@/services/supabase/deliveryService";
import DeliveryTypePricing from "./DeliveryTypePricing";
import { toast } from "sonner";

interface DeliveryLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'governorate' | 'city' | 'area' | 'neighborhood';
  parentData?: {
    governorate?: string;
    city?: string;
    area?: string;
  };
  providerId?: string | null;
  onSuccess?: (data?: any) => void;
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
            provider_id: providerId || undefined
          });
          break;

        case 'city':
          if (!parentData?.governorate) throw new Error("Governorate is required");
          result = await createCity({
            governorate: parentData.governorate,
            city: name,
            provider_id: providerId || undefined
          });
          break;

        case 'area':
          if (!parentData?.governorate || !parentData?.city) 
            throw new Error("Governorate and city are required");
          result = await createArea({
            governorate: parentData.governorate,
            city: parentData.city,
            area: name,
            provider_id: providerId || undefined
          });
          break;

        case 'neighborhood':
          if (!parentData?.governorate || !parentData?.city || !parentData?.area) 
            throw new Error("Governorate, city and area are required");
          result = await createNeighborhood({
            governorate: parentData.governorate,
            city: parentData.city,
            area: parentData.area,
            neighborhood: name,
            price: 0,
            provider_id: providerId || undefined
          });
          
          if (result?.id) {
            setNewLocationId(result.id);
            setShowPricing(true);
            return;
          }
          break;
      }

      onSuccess?.(result);
      setName("");
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating location:', error);
      toast.error("حدث خطأ أثناء حفظ المنطقة");
    } finally {
      setLoading(false);
    }
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
                {loading ? "جاري الحفظ..." : mode === 'neighborhood' ? "التالي" : "حفظ"}
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
          <div>
            <DeliveryTypePricing 
              locationId={newLocationId!}
              onSuccess={() => {
                onOpenChange(false);
                setShowPricing(false);
                setNewLocationId(null);
                onSuccess?.();
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
