import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateBranchNeighborhoodPricing } from "@/services/supabase/deliveryService";
import { toast } from "sonner";

interface Props {
  branchId: string;
  neighborhood: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditNeighborhoodPricingDialog({ branchId, neighborhood, open, onOpenChange }: Props) {
  const [price, setPrice] = useState(neighborhood?.price || 0);
  const [estimatedTime, setEstimatedTime] = useState(neighborhood?.estimated_time || "");
  const [priority, setPriority] = useState(neighborhood?.priority || 1);
  const [isPrimary, setIsPrimary] = useState(neighborhood?.is_primary || false);
  
  const queryClient = useQueryClient();

  useEffect(() => {
    if (neighborhood) {
      setPrice(neighborhood.price || 0);
      setEstimatedTime(neighborhood.estimated_time || "");
      setPriority(neighborhood.priority || 1);
      setIsPrimary(neighborhood.is_primary || false);
    }
  }, [neighborhood]);

  const updateMutation = useMutation({
    mutationFn: () => updateBranchNeighborhoodPricing(
      branchId,
      neighborhood.neighborhood_id,
      {
        price,
        estimated_time: estimatedTime,
        priority,
        is_primary: isPrimary,
      }
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-neighborhoods", branchId] });
      toast.success("تم تحديث البيانات بنجاح");
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Error updating neighborhood pricing:", error);
      toast.error("حدث خطأ أثناء تحديث البيانات");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            تعديل سعر ووقت التوصيل
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {neighborhood?.neighborhoods?.name}
          </p>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="price">السعر (ج.م)</Label>
            <Input
              id="price"
              type="number"
              value={price}
              onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
              required
            />
          </div>
          
          <div>
            <Label htmlFor="estimatedTime">الوقت المتوقع</Label>
            <Input
              id="estimatedTime"
              type="text"
              placeholder="مثال: 30-45 دقيقة"
              value={estimatedTime}
              onChange={(e) => setEstimatedTime(e.target.value)}
            />
          </div>
          
          <div>
            <Label htmlFor="priority">الأولوية</Label>
            <Input
              id="priority"
              type="number"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value) || 1)}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              الأولوية الأقل = أعلى أفضلية (1 هو الأعلى)
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Checkbox
              id="isPrimary"
              checked={isPrimary}
              onCheckedChange={(checked) => setIsPrimary(checked as boolean)}
            />
            <Label htmlFor="isPrimary" className="cursor-pointer">
              جعل هذا الفرع هو الفرع الرئيسي لهذا الحي
            </Label>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
