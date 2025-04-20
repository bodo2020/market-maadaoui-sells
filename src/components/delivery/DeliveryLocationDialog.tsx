
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
      onSuccess?.({name});
      setName("");
      setShowPricing(false);
      setNewLocationId(null);
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating location:', error);
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
          <div>
            <DeliveryTypePricing 
              locationId={newLocationId!}
              onSuccess={() => {
                onOpenChange(false);
                setShowPricing(false);
                setNewLocationId(null);
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
