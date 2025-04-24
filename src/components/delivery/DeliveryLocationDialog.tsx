
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
  parentId?: string;
  providerId?: string | null;
  onSuccess?: (data?: any) => void;
}

export default function DeliveryLocationDialog({
  open,
  onOpenChange,
  mode,
  parentId,
  providerId,
  onSuccess
}: DeliveryLocationDialogProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [newLocationId, setNewLocationId] = useState<string | null>(null);

  const isFormValid = name.trim() !== "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    
    setLoading(true);

    try {
      let result;

      switch (mode) {
        case 'governorate':
          result = await createGovernorate({
            name,
            provider_id: providerId || undefined
          });
          break;

        case 'city':
          if (!parentId) throw new Error("Governorate ID is required");
          result = await createCity({
            name,
            governorate_id: parentId
          });
          break;

        case 'area':
          if (!parentId) throw new Error("City ID is required");
          result = await createArea({
            name,
            city_id: parentId
          });
          break;

        case 'neighborhood':
          if (!parentId) throw new Error("Area ID is required");
          result = await createNeighborhood({
            name,
            area_id: parentId,
            price: 0
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
              <Button type="submit" disabled={loading || !isFormValid}>
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
