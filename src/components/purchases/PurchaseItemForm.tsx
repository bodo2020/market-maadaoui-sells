import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CalendarIcon, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Product } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { fetchProducts } from "@/services/supabase/productService";
import { fetchProductBatches } from "@/services/supabase/productBatchService";
import { supabase } from "@/integrations/supabase/client";

interface PurchaseItem {
  product_id: string;
  quantity: number;
  price: number;
  expiry_date?: string;
  batch_number?: string;
  shelf_location?: string;
  notes?: string;
}

interface PurchaseItemFormProps {
  items: PurchaseItem[];
  onItemsChange: (items: PurchaseItem[]) => void;
}

export default function PurchaseItemForm({ items, onItemsChange }: PurchaseItemFormProps) {
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts
  });

  const { data: productBatches = [] } = useQuery({
    queryKey: ["product-batches"],
    queryFn: () => fetchProductBatches()
  });

  const addItem = () => {
    const newItem: PurchaseItem = {
      product_id: "",
      quantity: 1,
      price: 0,
    };
    onItemsChange([...items, newItem]);
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    onItemsChange(newItems);
  };

  const updateItem = (index: number, field: keyof PurchaseItem, value: any) => {
    const newItems = items.map((item, i) => {
      if (i === index) {
        return { ...item, [field]: value };
      }
      return item;
    });
    onItemsChange(newItems);
  };

  const getProductById = (id: string) => {
    return products.find(p => p.id === id);
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">تفاصيل المنتجات المشتراة</h3>
        <Button type="button" onClick={addItem} size="sm">
          <Plus className="ml-2 h-4 w-4" />
          إضافة منتج
        </Button>
      </div>

      {items.map((item, index) => {
        const selectedProduct = getProductById(item.product_id);
        return (
          <Card key={index}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-base">منتج #{index + 1}</CardTitle>
                {items.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeItem(index)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Product Selection */}
                <div className="space-y-2">
                  <Label>المنتج *</Label>
                  <Select
                    value={item.product_id}
                    onValueChange={(value) => updateItem(index, 'product_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر المنتج" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {/* Show existing batches for this product */}
                  {item.product_id && productBatches.filter(batch => batch.product_id === item.product_id).length > 0 && (
                    <div className="mt-2 p-2 bg-muted rounded text-sm">
                      <p className="font-medium mb-1">باتشات موجودة:</p>
                      {productBatches
                        .filter(batch => batch.product_id === item.product_id)
                        .slice(0, 3)
                        .map((batch, idx) => (
                          <div key={idx} className="text-xs text-muted-foreground">
                            {batch.batch_number} - {batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString('ar-EG') : 'بدون تاريخ'} - الكمية: {batch.quantity}
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Quantity */}
                <div className="space-y-2">
                  <Label>الكمية *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                    placeholder="الكمية"
                  />
                </div>

                {/* Price */}
                <div className="space-y-2">
                  <Label>سعر الشراء *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.price}
                    onChange={(e) => updateItem(index, 'price', Number(e.target.value))}
                    placeholder="سعر الوحدة"
                  />
                </div>

                {/* Batch Number */}
                <div className="space-y-2">
                  <Label>رقم الدفعة</Label>
                  <Input
                    value={item.batch_number || ""}
                    onChange={(e) => updateItem(index, 'batch_number', e.target.value)}
                    placeholder="رقم الدفعة (اختياري)"
                  />
                </div>

                {/* Expiry Date */}
                <div className="space-y-2">
                  <Label>تاريخ انتهاء الصلاحية {selectedProduct?.track_expiry && <span className="text-destructive">*</span>}</Label>
                  <Input
                    type="date"
                    value={item.expiry_date || ""}
                    onChange={(e) => {
                      const dateValue = e.target.value;
                      updateItem(index, 'expiry_date', dateValue);
                      
                      // Auto-enable expiry tracking when expiry date is added
                      if (dateValue && item.product_id) {
                        const updateProductTracking = async () => {
                          try {
                            await supabase
                              .from('products')
                              .update({ track_expiry: true })
                              .eq('id', item.product_id);
                          } catch (error) {
                            console.error('Error updating product expiry tracking:', error);
                          }
                        };
                        updateProductTracking();
                      }
                    }}
                    required={selectedProduct?.track_expiry}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>

                {/* Shelf Location */}
                <div className="space-y-2">
                  <Label>موقع الرف</Label>
                  <Input
                    value={item.shelf_location || ""}
                    onChange={(e) => updateItem(index, 'shelf_location', e.target.value)}
                    placeholder="مثل: A1, B2, C3"
                  />
                  {item.shelf_location && (
                    <p className="text-sm text-muted-foreground">
                      المكان: {item.shelf_location}
                    </p>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>ملاحظات</Label>
                <Textarea
                  value={item.notes || ""}
                  onChange={(e) => updateItem(index, 'notes', e.target.value)}
                  placeholder="ملاحظات حول هذا المنتج (اختياري)"
                  rows={2}
                />
              </div>

              {/* Item Total */}
              <div className="bg-muted p-3 rounded-md">
                <div className="flex justify-between items-center">
                  <span className="font-medium">إجمالي هذا المنتج:</span>
                  <span className="text-lg font-bold">
                    {(item.quantity * item.price).toFixed(2)} ج.م
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Total Summary */}
      {items.length > 0 && (
        <Card className="bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex justify-between items-center text-lg">
              <span className="font-medium">إجمالي الفاتورة:</span>
              <span className="text-xl font-bold text-primary">
                {calculateTotal().toFixed(2)} ج.م
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}