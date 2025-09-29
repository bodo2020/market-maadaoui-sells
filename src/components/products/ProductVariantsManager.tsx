import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Scan } from "lucide-react";
import { ProductVariant } from "@/types";
import BarcodeScanner from "@/components/POS/BarcodeScanner";

interface ProductVariantsManagerProps {
  variants: ProductVariant[];
  onVariantsChange: (variants: ProductVariant[]) => void;
  parentProductId?: string;
}

export function ProductVariantsManager({
  variants,
  onVariantsChange,
  parentProductId,
}: ProductVariantsManagerProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [currentVariantIndex, setCurrentVariantIndex] = useState<number | null>(null);

  // Calculate variant purchase price based on conversion factor and base purchase price
  const calculateVariantPurchasePrice = (conversionFactor: number, basePurchasePrice: number) => {
    return conversionFactor * basePurchasePrice;
  };

  const addVariant = () => {
    const newVariant: ProductVariant = {
      id: `temp-${Date.now()}`,
      parent_product_id: parentProductId || "",
      name: "",
      variant_type: "",
      price: 0,
      purchase_price: 0,
      conversion_factor: 1,
      barcode: "",
      bulk_barcode: "",
      image_url: "",
      active: true,
      position: variants.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    onVariantsChange([...variants, newVariant]);
    setEditingIndex(variants.length);
  };

  const updateVariant = (index: number, field: keyof ProductVariant, value: any) => {
    const updatedVariants = [...variants];
    updatedVariants[index] = { ...updatedVariants[index], [field]: value };
    
    // Auto-calculate purchase price when conversion factor changes
    if (field === 'conversion_factor') {
      const basePurchasePrice = parseFloat(document.querySelector<HTMLInputElement>('input[name="purchase_price"]')?.value || '0');
      if (basePurchasePrice > 0) {
        updatedVariants[index].purchase_price = calculateVariantPurchasePrice(value, basePurchasePrice);
      }
    }
    
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
    if (currentVariantIndex !== null) {
      updateVariant(currentVariantIndex, 'barcode', barcode);
    }
    setShowBarcodeScanner(false);
    setCurrentVariantIndex(null);
  };

  const openBarcodeScanner = (index: number) => {
    setCurrentVariantIndex(index);
    setShowBarcodeScanner(true);
  };

  // Update all variants purchase prices when base purchase price changes
  const updateAllVariantsPurchasePrice = (basePurchasePrice: number) => {
    const updatedVariants = variants.map(variant => ({
      ...variant,
      purchase_price: calculateVariantPurchasePrice(variant.conversion_factor, basePurchasePrice)
    }));
    onVariantsChange(updatedVariants);
  };

  // Listen for base purchase price changes
  React.useEffect(() => {
    const purchasePriceInput = document.querySelector<HTMLInputElement>('input[name="purchase_price"]');
    if (purchasePriceInput) {
      const handlePurchasePriceChange = () => {
        const basePurchasePrice = parseFloat(purchasePriceInput.value || '0');
        if (basePurchasePrice > 0) {
          updateAllVariantsPurchasePrice(basePurchasePrice);
        }
      };
      
      purchasePriceInput.addEventListener('input', handlePurchasePriceChange);
      return () => purchasePriceInput.removeEventListener('input', handlePurchasePriceChange);
    }
  }, [variants]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          أصناف المنتج
          <Button onClick={addVariant} size="sm">
            <Plus className="h-4 w-4 ml-2" />
            إضافة صنف
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {variants.map((variant, index) => (
          <div key={variant.id || index} className="border rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label htmlFor={`variant-name-${index}`}>اسم الصنف</Label>
                <Input
                  id={`variant-name-${index}`}
                  value={variant.name}
                  onChange={(e) => updateVariant(index, 'name', e.target.value)}
                  placeholder="مثال: كرتونة، علبة"
                />
              </div>

              <div>
                <Label htmlFor={`variant-type-${index}`}>نوع الصنف</Label>
                <Input
                  id={`variant-type-${index}`}
                  value={variant.variant_type}
                  onChange={(e) => updateVariant(index, 'variant_type', e.target.value)}
                  placeholder="مثال: جملة، تجزئة"
                />
              </div>

              <div>
                <Label htmlFor={`variant-conversion-${index}`}>معامل التحويل</Label>
                <Input
                  id={`variant-conversion-${index}`}
                  type="number"
                  value={variant.conversion_factor}
                  onChange={(e) => updateVariant(index, 'conversion_factor', parseFloat(e.target.value) || 1)}
                  placeholder="عدد القطع"
                  min="1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  عدد القطع في هذا الصنف (مثال: 40 قطعة في الكرتونة)
                </p>
              </div>

              <div>
                <Label htmlFor={`variant-price-${index}`}>سعر البيع</Label>
                <Input
                  id={`variant-price-${index}`}
                  type="number"
                  value={variant.price}
                  onChange={(e) => updateVariant(index, 'price', parseFloat(e.target.value) || 0)}
                  placeholder="سعر البيع"
                  step="0.01"
                  min="0"
                />
              </div>

              <div>
                <Label htmlFor={`variant-purchase-price-${index}`}>سعر الشراء (محسوب تلقائياً)</Label>
                <Input
                  id={`variant-purchase-price-${index}`}
                  type="number"
                  value={variant.purchase_price}
                  onChange={(e) => updateVariant(index, 'purchase_price', parseFloat(e.target.value) || 0)}
                  step="0.01"
                  min="0"
                  className="bg-muted"
                  readOnly
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {variant.conversion_factor} × سعر الشراء الأساسي
                </p>
              </div>

              <div>
                <Label htmlFor={`variant-barcode-${index}`}>الباركود</Label>
                <div className="flex gap-2">
                  <Input
                    id={`variant-barcode-${index}`}
                    value={variant.barcode}
                    onChange={(e) => updateVariant(index, 'barcode', e.target.value)}
                    placeholder="باركود الصنف"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openBarcodeScanner(index)}
                  >
                    <Scan className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id={`variant-active-${index}`}
                  checked={variant.active}
                  onCheckedChange={(checked) => updateVariant(index, 'active', checked)}
                />
                <Label htmlFor={`variant-active-${index}`}>نشط</Label>
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => removeVariant(index)}
              >
                <Trash2 className="h-4 w-4 ml-2" />
                حذف الصنف
              </Button>
            </div>
          </div>
        ))}

        {variants.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            لا توجد أصناف مضافة بعد
          </div>
        )}

        <BarcodeScanner
          isOpen={showBarcodeScanner}
          onScan={handleBarcodeScanned}
          onClose={() => {
            setShowBarcodeScanner(false);
            setCurrentVariantIndex(null);
          }}
        />
      </CardContent>
    </Card>
  );
}