
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createShippingProvider } from "@/services/supabase/deliveryService";

interface ShippingProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function ShippingProviderDialog({
  open,
  onOpenChange,
  onSuccess
}: ShippingProviderDialogProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await createShippingProvider({
        name,
        active
      });
      toast.success("تم إضافة شركة الشحن بنجاح");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving shipping provider:', error);
      toast.error("حدث خطأ أثناء حفظ شركة الشحن");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rtl">
        <DialogHeader>
          <DialogTitle>إضافة شركة شحن جديدة</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">اسم شركة الشحن</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="أدخل اسم شركة الشحن"
              className="text-right"
              required
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="active">تفعيل شركة الشحن</Label>
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
