
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

interface UpdateOrderStatusDialogProps {
  orderId: string;
  currentStatus: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusUpdated: (status: string) => void;
}

// Update the component to handle all possible status values
export function UpdateOrderStatusDialog({ orderId, currentStatus, open, onOpenChange, onStatusUpdated }: UpdateOrderStatusDialogProps) {
  const [newStatus, setNewStatus] = useState<string>(currentStatus);
  
  // Make sure to include all possible statuses
  const statusOptions = [
    { value: "waiting", label: "في الانتظار" },
    { value: "ready", label: "جاهز" },
    { value: "shipped", label: "تم الشحن" },
    { value: "done", label: "مكتمل" },
    { value: "cancelled", label: "ملغي" },
    { value: "returned", label: "مرتجع" }
  ];

  const handleStatusChange = async () => {
    try {
      onStatusUpdated(newStatus);
      toast.success("تم تحديث حالة الطلب بنجاح");
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating order status:", error);
      toast.error("فشل في تحديث حالة الطلب");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>تحديث حالة الطلب</DialogTitle>
          <DialogDescription>
            تغيير حالة الطلب رقم {orderId}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="status" className="text-right">
              الحالة
            </Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="اختر حالة" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleStatusChange}>تحديث الحالة</Button>
      </DialogContent>
    </Dialog>
  );
}
