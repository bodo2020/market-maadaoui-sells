import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrderItem } from "@/types";
import { Barcode, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { updateProductBarcode, generateBarcodeForProduct } from "@/services/supabase/productService";

interface AddBarcodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: OrderItem | null;
  onBarcodeAdded: () => void;
}

export function AddBarcodeDialog({
  open,
  onOpenChange,
  product,
  onBarcodeAdded
}: AddBarcodeDialogProps) {
  const [barcode, setBarcode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!product) return null;

  const handleGenerateBarcode = async () => {
    try {
      const generatedBarcode = await generateBarcodeForProduct(product.product_id);
      setBarcode(generatedBarcode);
      toast.success("تم توليد باركود جديد");
    } catch (error) {
      console.error("Error generating barcode:", error);
      toast.error("حدث خطأ أثناء توليد الباركود");
    }
  };

  const handleSubmit = async () => {
    if (!barcode.trim()) {
      toast.error("يرجى إدخال الباركود");
      return;
    }

    try {
      setIsSubmitting(true);
      await updateProductBarcode(product.product_id, barcode.trim());
      toast.success("تم إضافة الباركود بنجاح");
      onBarcodeAdded();
      onOpenChange(false);
      setBarcode("");
    } catch (error) {
      console.error("Error adding barcode:", error);
      toast.error("حدث خطأ أثناء إضافة الباركود");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Barcode className="h-5 w-5" />
            إضافة باركود
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 dir-rtl">
          <div className="text-center space-y-2 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium">{product.product_name}</h3>
            <p className="text-sm text-muted-foreground">
              هذا المنتج لا يحتوي على باركود
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="barcode">الباركود</Label>
            <div className="flex gap-2">
              <Input
                id="barcode"
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="أدخل الباركود أو اضغط توليد"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleGenerateBarcode}
                className="px-3"
              >
                <Wand2 className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              يمكنك إدخال الباركود يدوياً أو الضغط على زر التوليد لإنشاء باركود تلقائي
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={isSubmitting || !barcode.trim()}
            >
              {isSubmitting ? "جاري الإضافة..." : "إضافة الباركود"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}