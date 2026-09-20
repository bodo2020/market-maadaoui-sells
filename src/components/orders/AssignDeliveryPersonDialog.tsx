import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, MapPin, Search, Truck, UserCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

function availabilityLabel(person: DeliveryCandidate) {
  if (person.availability === "available") return "متاح";
  if (person.availability === "busy") return "مشغول";
  return "غير متصل";
}

function statusHint(person: DeliveryCandidate) {
  if (person.status_reason === "location_missing") return "لم يرسل موقعه بعد";
  if (person.status_reason === "location_stale") return "آخر موقع قديم";
  if (person.status_reason === "outside_dispatch_radius") return "بعيد عن نطاق الإرسال التلقائي";
  if (person.status_reason === "distance_unknown") return "تعذر حساب المسافة";
  if (person.status_reason === "busy") return "ينفذ طلبًا حاليًا";
  if (person.status_reason === "offline") return "خارج وضع التوصيل";
  return "جاهز للاستلام";
}

export function AssignDeliveryPersonDialog({ open, onOpenChange, orderId, onConfirm }: AssignDeliveryPersonDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [deliveryPersons, setDeliveryPersons] = useState<DeliveryCandidate[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [currentName, setCurrentName] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
        setSearch("");
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return deliveryPersons.filter(person => !term || person.name.toLowerCase().includes(term));
  }, [deliveryPersons, search]);

  const selected = deliveryPersons.find(person => person.id === selectedPersonId);

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
        reason: currentName ? "تغيير المندوب يدويًا من تفاصيل الطلب" : "تعيين مندوب يدويًا بعد تعذر التوزيع التلقائي",
      });
      setCurrentName(result.delivery_name || null);
      toast.success(result.idempotent ? "بيانات المندوب محدثة" : "تم تكليف المندوب بالطلب");
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
        reason: "إلغاء تعيين مندوب التوصيل يدويًا",
      });
      setSelectedPersonId("");
      setCurrentName(null);
      setTrackingNumber("");
      toast.success("تم إلغاء تعيين المندوب");
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[620px] dir-rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-[#005931]" />
            تكليف الطلب لمندوب
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>استخدم التعيين اليدوي لو التوزيع التلقائي لم يجد مندوبًا مناسبًا، أو لو محتاج تغيّر المندوب الحالي.</p>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">ابحث عن مندوب</Label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={event => setSearch(event.target.value)} className="pr-9" placeholder="اسم المندوب" />
            </div>
          </div>

          <div className="space-y-2">
            {loadingWorkspace ? (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">جاري تحميل مندوبي الفرع…</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا يوجد مندوب مطابق للبحث في هذا الفرع.</div>
            ) : filtered.map(person => {
              const active = selectedPersonId === person.id;
              return (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => setSelectedPersonId(person.id)}
                  className={`w-full rounded-2xl border p-3 text-right transition ${active ? "border-[#005931] bg-emerald-50 shadow-sm" : "border-slate-200 bg-white hover:border-emerald-200"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="truncate">{person.name}</strong>
                        <Badge variant={person.availability === "available" ? "default" : "secondary"}>{availabilityLabel(person)}</Badge>
                        {person.dispatch_ready && <Badge variant="outline" className="border-emerald-200 text-emerald-700">مناسب تلقائيًا</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{statusHint(person)}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-600">
                        <span><Truck className="ml-1 inline h-3 w-3" />طلبات حالية: {Number(person.active_orders || 0)}</span>
                        {person.distance_km != null && <span><MapPin className="ml-1 inline h-3 w-3" />{Number(person.distance_km).toFixed(1)} كم</span>}
                        {person.travel_minutes != null && <span><Clock3 className="ml-1 inline h-3 w-3" />وصول ≈ {person.travel_minutes} د</span>}
                      </div>
                    </div>
                    {active && <UserCheck className="h-5 w-5 shrink-0 text-[#005931]" />}
                  </div>
                </button>
              );
            })}
          </div>

          {selected && !selected.dispatch_ready && (
            <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              المندوب المختار غير مرشح للإرسال التلقائي حاليًا ({statusHint(selected)})، لكن المسؤول يقدر يكلّفه يدويًا عند الحاجة.
            </p>
          )}

          <div>
            <Label htmlFor="tracking-number" className="mb-2 block">رقم التتبع (اختياري)</Label>
            <Input id="tracking-number" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} disabled={loading} />
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between">
          {currentName && (
            <Button type="button" variant="outline" onClick={handleClear} disabled={loading || loadingWorkspace}>إلغاء التعيين</Button>
          )}
          <Button type="button" onClick={handleAssign} disabled={loading || loadingWorkspace || !selectedPersonId} className="bg-[#005931] hover:bg-[#004526]">
            {loading ? "جاري التكليف…" : currentName ? "حفظ المندوب" : "تكليف المندوب"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
