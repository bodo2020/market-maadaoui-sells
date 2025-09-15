import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ProductBatch } from "@/types";
import { updateProductBatch } from "@/services/supabase/productBatchService";

interface ExpiredProductActionsDialogProps {
  open: boolean;
  onClose: () => void;
  batch: ProductBatch | null;
  onActionComplete: () => void;
}

export function ExpiredProductActionsDialog({
  open,
  onClose,
  batch,
  onActionComplete
}: ExpiredProductActionsDialogProps) {
  const [actionType, setActionType] = useState<'damaged' | 'replace' | ''>('');
  const [newExpiryDate, setNewExpiryDate] = useState('');
  const [newBatchNumber, setNewBatchNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!batch || !actionType) return;

    setLoading(true);
    try {
      if (actionType === 'damaged') {
        // Mark as damaged - set quantity to 0 and add note
        await updateProductBatch(batch.id, {
          quantity: 0,
          notes: `تالف - ${notes || 'منتج منتهي الصلاحية'}`,
        });

        toast({
          title: "تم بنجاح",
          description: "تم تمييز المنتج كتالف",
        });
      } else if (actionType === 'replace') {
        if (!newExpiryDate || !newBatchNumber) {
          toast({
            title: "خطأ",
            description: "يرجى إدخال تاريخ الصلاحية الجديد ورقم الدفعة",
            variant: "destructive"
          });
          return;
        }

        // Replace with new batch
        await updateProductBatch(batch.id, {
          expiry_date: newExpiryDate,
          batch_number: newBatchNumber,
          notes: `تم التبديل - ${notes || 'استبدال منتج منتهي الصلاحية'}`,
        });

        toast({
          title: "تم بنجاح",
          description: "تم تبديل المنتج بدفعة جديدة",
        });
      }

      onActionComplete();
      onClose();
      setActionType('');
      setNewExpiryDate('');
      setNewBatchNumber('');
      setNotes('');
    } catch (error) {
      console.error("Error processing expired product action:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء معالجة الطلب",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setActionType('');
    setNewExpiryDate('');
    setNewBatchNumber('');
    setNotes('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md dir-rtl">
        <DialogHeader>
          <DialogTitle>إجراء على المنتج منتهي الصلاحية</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {batch && (
            <div className="bg-muted p-3 rounded-lg">
              <p className="font-medium">
                {(batch as any).products?.name || (batch as any).product_name || `منتج #${batch.product_id.slice(-6)}`}
              </p>
              <p className="text-sm text-muted-foreground">دفعة: {batch.batch_number}</p>
              <p className="text-sm text-muted-foreground">الكمية: {batch.quantity}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>نوع الإجراء</Label>
            <Select value={actionType} onValueChange={(value: 'damaged' | 'replace') => setActionType(value)}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الإجراء" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="damaged">تالف - إزالة من المخزون</SelectItem>
                <SelectItem value="replace">تبديل بمنتج جديد الصلاحية</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {actionType === 'replace' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="newBatchNumber">رقم الدفعة الجديدة</Label>
                <Input
                  id="newBatchNumber"
                  value={newBatchNumber}
                  onChange={(e) => setNewBatchNumber(e.target.value)}
                  placeholder="أدخل رقم الدفعة الجديدة"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newExpiryDate">تاريخ الصلاحية الجديد</Label>
                <Input
                  id="newExpiryDate"
                  type="date"
                  value={newExpiryDate}
                  onChange={(e) => setNewExpiryDate(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">ملاحظات</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أضف ملاحظات إضافية..."
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSubmit} disabled={loading || !actionType}>
              {loading ? "جاري المعالجة..." : "تأكيد"}
            </Button>
            <Button variant="outline" onClick={handleClose}>
              إلغاء
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}