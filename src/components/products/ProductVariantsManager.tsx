import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DragDropImage } from "@/components/ui/drag-drop-image";
import { ProductVariant } from "@/types";
import { Plus, Trash2, Edit, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import BarcodeScanner from "@/components/POS/BarcodeScanner";

interface ProductVariantsManagerProps {
  variants: ProductVariant[];
  onVariantsChange: (variants: ProductVariant[]) => void;
  parentProductId?: string;
}

const variantTypes = [
  { value: "كرتونة", label: "كرتونة" },
  { value: "علبة", label: "علبة" },
  { value: "كيس", label: "كيس" },
  { value: "قطعة", label: "قطعة" },
  { value: "جرام", label: "جرام" },
  { value: "كيلو", label: "كيلو" },
  { value: "أخرى", label: "أخرى" },
];

export default function ProductVariantsManager({ 
  variants, 
  onVariantsChange, 
  parentProductId = "" 
}: ProductVariantsManagerProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerTargetIndex, setScannerTargetIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const addVariant = () => {
    const newVariant: ProductVariant = {
      parent_product_id: parentProductId,
      name: "",
      variant_type: "قطعة",
      price: 0,
      purchase_price: 0,
      conversion_factor: 1,
      barcode: "",
      image_url: "",
      active: true,
      position: variants.length,
    };

    onVariantsChange([...variants, newVariant]);
    setEditingIndex(variants.length);
  };

  const updateVariant = (index: number, field: keyof ProductVariant, value: any) => {
    const updatedVariants = [...variants];
    updatedVariants[index] = { ...updatedVariants[index], [field]: value };
    onVariantsChange(updatedVariants);
  };

  const removeVariant = (index: number) => {
    const updatedVariants = variants.filter((_, i) => i !== index);
    onVariantsChange(updatedVariants);
    if (editingIndex === index) {
      setEditingIndex(null);
    }
  };

  const handleBarcodeScanned = (barcode: string) => {
    if (scannerTargetIndex !== null) {
      updateVariant(scannerTargetIndex, "barcode", barcode);
      setScannerOpen(false);
      setScannerTargetIndex(null);
      toast({
        title: "تم المسح",
        description: "تم إضافة الباركود بنجاح",
      });
    }
  };

  const openBarcodeScanner = (index: number) => {
    setScannerTargetIndex(index);
    setScannerOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>إدارة أصناف المنتج</span>
          <Button onClick={addVariant} size="sm">
            <Plus className="h-4 w-4 ml-2" />
            إضافة صنف
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {variants.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            لم يتم إضافة أي أصناف بعد
          </div>
        ) : (
          <div className="space-y-4">
            {variants.map((variant, index) => (
              <Card key={index} className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* اسم الصنف */}
                  <div className="space-y-2">
                    <Label>اسم الصنف</Label>
                    <Input
                      value={variant.name}
                      onChange={(e) => updateVariant(index, "name", e.target.value)}
                      placeholder="مثل: كرتونة بيض"
                    />
                  </div>

                  {/* نوع الصنف */}
                  <div className="space-y-2">
                    <Label>نوع الصنف</Label>
                    <Select
                      value={variant.variant_type}
                      onValueChange={(value) => updateVariant(index, "variant_type", value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {variantTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* السعر */}
                  <div className="space-y-2">
                    <Label>السعر</Label>
                    <Input
                      type="number"
                      value={variant.price}
                      onChange={(e) => updateVariant(index, "price", parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                    />
                  </div>

                  {/* سعر الشراء */}
                  <div className="space-y-2">
                    <Label>سعر الشراء</Label>
                    <Input
                      type="number"
                      value={variant.purchase_price}
                      onChange={(e) => updateVariant(index, "purchase_price", parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                    />
                  </div>

                  {/* معامل التحويل */}
                  <div className="space-y-2">
                    <Label>معامل التحويل (عدد القطع)</Label>
                    <Input
                      type="number"
                      value={variant.conversion_factor}
                      onChange={(e) => updateVariant(index, "conversion_factor", parseFloat(e.target.value) || 1)}
                      placeholder="1"
                    />
                  </div>

                  {/* الباركود */}
                  <div className="space-y-2">
                    <Label>الباركود</Label>
                    <div className="flex gap-2">
                      <Input
                        value={variant.barcode || ""}
                        onChange={(e) => updateVariant(index, "barcode", e.target.value)}
                        placeholder="اختياري"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => openBarcodeScanner(index)}
                      >
                        <QrCode className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* حالة النشاط */}
                  <div className="space-y-2">
                    <Label>نشط</Label>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={variant.active}
                        onCheckedChange={(checked) => updateVariant(index, "active", checked)}
                      />
                    </div>
                  </div>

                  {/* حذف الصنف */}
                  <div className="space-y-2">
                    <Label>&nbsp;</Label>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeVariant(index)}
                      className="w-full"
                    >
                      <Trash2 className="h-4 w-4 ml-2" />
                      حذف
                    </Button>
                  </div>

                  {/* صورة الصنف */}
                  <div className="col-span-full">
                    <Label>صورة الصنف</Label>
                    <DragDropImage
                      value={variant.image_url || null}
                      onChange={(url) => updateVariant(index, "image_url", url || "")}
                      bucketName="products"
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ماسح الباركود */}
        <BarcodeScanner
          isOpen={scannerOpen}
          onScan={handleBarcodeScanned}
          onClose={() => {
            setScannerOpen(false);
            setScannerTargetIndex(null);
          }}
        />
      </CardContent>
    </Card>
  );
}