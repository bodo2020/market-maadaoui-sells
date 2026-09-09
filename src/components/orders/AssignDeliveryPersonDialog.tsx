import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  DeliveryCandidate,
  getDeliveryAssignmentWorkspace,
  setDeliveryOrderAssignment,
} from "@/services/deliveryAssignmentService";

interface AssignDeliveryPersonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  onConfirm?: () => void;
}

export function AssignDeliveryPersonDialog({ open, onOpenChange, orderId, onConfirm }: AssignDeliveryPersonDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [deliveryPersons, setDeliveryPersons] = useState<DeliveryCandidate[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [currentName, setCurrentName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const load = async () => {
      setLoadingWorkspace(true);
      try {
        const workspace = await getDeliveryAssignmentWorkspace(orderId);
        if (!active) return;
        setDeliveryPersons(workspace.candidates || []);
        setSelectedPersonId(workspace.current?.delivery_user_id || "");
        setCurrentName(workspace.current?.name || workspace.legacy_delivery_person || null);
        setTrackingNumber(workspace.tracking_number || "");
      } catch (error) {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "تعذر تحميل بيانات التوصيل");
      } finally {
        if (active) setLoadingWorkspace(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [open, orderId]);

  const handleAssign = async () => {
    if (!selectedPersonId) {
      toast.error("الرجاء اختيار مندوب توصيل");
      return;
    }
    try {
      setLoading(true);
      const result = await setDeliveryOrderAssignment({
        orderId,
        deliveryUserId: selectedPersonId,
        trackingNumber,
        reason: currentName ? "تحديث أو إعادة تعيين مندوب التوصيل" : "تعيين مندوب التوصيل",
      });
      setCurrentName(result.delivery_name || null);
      toast.success(result.idempotent ? "تم تحديث بيانات التوصيل" : "تم تعيين مندوب التوصيل بنجاح");
      onConfirm?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "حدث خطأ أثناء تعيين مندوب التوصيل");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    try {
      setLoading(true);
      await setDeliveryOrderAssignment({
        orderId,
        deliveryUserId: null,
        reason: "إلغاء تعيين مندوب التوصيل",
      });
      setSelectedPersonId("");
      setCurrentName(null);
      setTrackingNumber("");
      toast.success("تم إلغاء تعيين مندوب التوصيل");
      onConfirm?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "حدث خطأ أثناء إلغاء تعيين مندوب التوصيل");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] dir-rtl">
        <DialogHeader><DialogTitle>تعيين مندوب توصيل</DialogTitle></DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="delivery-person" className="text-right col-span-4">مندوب التوصيل</Label>
            <Select value={selectedPersonId} onValueChange={setSelectedPersonId} disabled={loadingWorkspace || loading}>
              <SelectTrigger className="col-span-4"><SelectValue placeholder={loadingWorkspace ? "جاري تحميل مندوبي الفرع..." : "اختر مندوب التوصيل"} /></SelectTrigger>
              <SelectContent>
                {deliveryPersons.map((person) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!loadingWorkspace && deliveryPersons.length === 0 && (
              <p className="col-span-4 text-xs text-amber-700">لا يوجد حساب مندوب توصيل نشط ومسند لهذا الفرع.</p>
            )}
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="tracking-number" className="text-right col-span-4">رقم التتبع (اختياري)</Label>
            <Input id="tracking-number" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className="col-span-4" disabled={loading} />
            <p className="col-span-4 text-xs text-muted-foreground">يحفظ رقم التتبع في سجل التوصيل التشغيلي، بدون تعديل Snapshot الطلب المحمي.</p>
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          {currentName && (
            <Button type="button" variant="outline" onClick={handleClear} disabled={loading || loadingWorkspace}>إلغاء التعيين</Button>
          )}
          <Button type="button" onClick={handleAssign} disabled={loading || loadingWorkspace || !selectedPersonId}>
            {loading ? "جاري التعيين..." : currentName ? "حفظ التعيين" : "تعيين"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
