import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ProductBatch } from "@/types";
import { updateProductBatch, createProductBatch } from "@/services/supabase/productBatchService";
import { fetchProducts, updateProductQuantity } from "@/services/supabase/productService";
import { createDamageExpense } from "@/services/supabase/expenseService";

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
  const [damagedQuantity, setDamagedQuantity] = useState(0);
  const [newExpiryDate, setNewExpiryDate] = useState('');
  const [newBatchNumber, setNewBatchNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Generate automatic batch number
  const generateBatchNumber = () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `B${year}${month}${day}${random}`;
  };

  // Check if this is a product from main products table (not product_batches)
  const isMainProduct = (batch: ProductBatch) => {
    return batch.notes === 'من المخزون الرئيسي' || batch.batch_number.startsWith('MAIN-');
  };

  const handleSubmit = async () => {
    if (!batch || !actionType) return;

    if (actionType === 'damaged') {
      if (!damagedQuantity || damagedQuantity <= 0) {
        toast({
          title: "خطأ",
          description: "يرجى إدخال كمية صحيحة للتلف",
          variant: "destructive"
        });
        return;
      }

      if (damagedQuantity > batch.quantity) {
        toast({
          title: "خطأ",
          description: "الكمية التالفة لا يمكن أن تتجاوز الكمية المتوفرة",
          variant: "destructive"
        });
        return;
      }
    }

    setLoading(true);
    try {
      const isMainProd = isMainProduct(batch);

      if (actionType === 'damaged') {
        // Calculate damage cost (purchase price * damaged quantity)
        const purchasePrice = batch.purchase_price || (batch as any).products?.purchase_price || 10; // fallback
        const damageCost = damagedQuantity * purchasePrice;

        // Create new batch entry for damaged quantity
        await createProductBatch({
          product_id: batch.product_id,
          batch_number: `DAMAGED-${generateBatchNumber()}`,
          quantity: damagedQuantity,
          expiry_date: batch.expiry_date,
          shelf_location: batch.shelf_location,
          purchase_price: purchasePrice,
          notes: `تالف - ${notes || 'منتج منتهي الصلاحية'} - الكمية التالفة: ${damagedQuantity}`,
        });

        // Update original batch to reduce quantity
        const remainingQuantity = batch.quantity - damagedQuantity;
        if (isMainProd) {
          // For main products, we can't directly update, so we'll handle it differently
          // Create a new batch for remaining quantity if needed
          if (remainingQuantity > 0) {
            await createProductBatch({
              product_id: batch.product_id,
              batch_number: `REMAINING-${generateBatchNumber()}`,
              quantity: remainingQuantity,
              expiry_date: batch.expiry_date,
              shelf_location: batch.shelf_location,
              purchase_price: purchasePrice,
              notes: `الكمية المتبقية بعد التلف`,
            });
          }
        } else {
          // Update existing batch with remaining quantity
          await updateProductBatch(batch.id, {
            quantity: remainingQuantity,
            notes: `تم خصم ${damagedQuantity} كتالف - ${batch.notes || ''}`,
          });
        }

        // Decrease inventory quantity by damaged amount
        await updateProductQuantity(batch.product_id, damagedQuantity, 'decrease');

        // Add damage expense (no cash deduction, just record)
        try {
          await createDamageExpense({
            type: "منتج تالف",
            amount: damageCost,
            description: `منتج تالف منتهي الصلاحية - ${(batch as any).products?.name || (batch as any).product_name || `منتج #${batch.product_id.slice(-6)}`} - الكمية: ${damagedQuantity}`,
            date: new Date().toISOString(),
          });
          
          toast({
            title: "تم بنجاح",
            description: `تم تمييز ${damagedQuantity} من المنتج كتالف وتسجيل مصروف ${damageCost.toFixed(2)} ج.م`,
          });
        } catch (expenseError) {
          console.error("Could not create damage expense record:", expenseError);
          toast({
            title: "تم جزئياً",
            description: `تم تمييز ${damagedQuantity} من المنتج كتالف لكن فشل في تسجيل المصروف`,
            variant: "destructive"
          });
        }
      } else if (actionType === 'replace') {
        if (!newExpiryDate) {
          toast({
            title: "خطأ",
            description: "يرجى إدخال تاريخ الصلاحية الجديد",
            variant: "destructive"
          });
          return;
        }

        const batchNumber = newBatchNumber || generateBatchNumber();

        if (isMainProd) {
          // Create new batch entry for main product with new expiry
          await createProductBatch({
            product_id: batch.product_id,
            batch_number: batchNumber,
            quantity: batch.quantity,
            expiry_date: newExpiryDate,
            shelf_location: batch.shelf_location,
            notes: `تم التبديل - ${notes || 'استبدال منتج منتهي الصلاحية'}`,
          });
        } else {
          // Update existing batch
          await updateProductBatch(batch.id, {
            expiry_date: newExpiryDate,
            batch_number: batchNumber,
            notes: `تم التبديل - ${notes || 'استبدال منتج منتهي الصلاحية'}`,
          });
        }

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
    setDamagedQuantity(0);
    setNewExpiryDate('');
    setNewBatchNumber('');
    setNotes('');
    onClose();
  };

  // Auto-generate batch number when replace is selected
  const handleActionTypeChange = (value: 'damaged' | 'replace') => {
    setActionType(value);
    if (value === 'replace' && !newBatchNumber) {
      setNewBatchNumber(generateBatchNumber());
    }
    if (value === 'damaged' && batch) {
      setDamagedQuantity(batch.quantity); // Default to full quantity
    }
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
            <Select value={actionType} onValueChange={handleActionTypeChange}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الإجراء" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="damaged">تالف - إزالة من المخزون</SelectItem>
                <SelectItem value="replace">تبديل بمنتج جديد الصلاحية</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {actionType === 'damaged' && (
            <div className="space-y-2">
              <Label htmlFor="damagedQuantity">الكمية التالفة</Label>
              <Input
                id="damagedQuantity"
                type="number"
                min="1"
                max={batch?.quantity || 1}
                value={damagedQuantity}
                onChange={(e) => setDamagedQuantity(Number(e.target.value))}
                placeholder="أدخل الكمية التالفة"
              />
              <p className="text-sm text-muted-foreground">
                الكمية المتوفرة: {batch?.quantity || 0}
              </p>
            </div>
          )}

          {actionType === 'replace' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="newBatchNumber">رقم الدفعة الجديدة</Label>
                <div className="flex gap-2">
                  <Input
                    id="newBatchNumber"
                    value={newBatchNumber}
                    onChange={(e) => setNewBatchNumber(e.target.value)}
                    placeholder="رقم الدفعة التلقائي"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setNewBatchNumber(generateBatchNumber())}
                  >
                    توليد تلقائي
                  </Button>
                </div>
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