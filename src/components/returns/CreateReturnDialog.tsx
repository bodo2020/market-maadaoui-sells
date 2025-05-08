
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchProductByBarcode } from "@/services/supabase/productService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Plus, BarcodeScan, Trash2 } from "lucide-react";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { MultiSelect } from "@/components/ui/multi-select";
import { Textarea } from "@/components/ui/textarea";
import { Product } from "@/types";
import { siteConfig } from "@/config/site";

interface ReturnItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  total: number;
  reason?: string;
}

interface CreateReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateReturnDialog({
  open,
  onOpenChange,
  onSuccess
}: CreateReturnDialogProps) {
  const [barcode, setBarcode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [productOptions, setProductOptions] = useState<{label: string, value: string}[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState<number>(1);
  const [itemReason, setItemReason] = useState<string>('');
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalReason, setGeneralReason] = useState('');
  const [orderId, setOrderId] = useState('');
  const [customerName, setCustomerName] = useState('');

  const form = useForm({
    defaultValues: {
      productId: "",
      quantity: 1,
      reason: ""
    }
  });

  const formatCurrency = (amount: number): string => {
    return `${siteConfig.currency} ${amount.toLocaleString('ar-EG', {
      maximumFractionDigits: 2
    })}`;
  };
  
  const handleSearchProducts = async (query: string) => {
    setSearchQuery(query);
    
    if (query.length < 2) {
      setProductOptions([]);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price')
        .ilike('name', `%${query}%`)
        .limit(10);
      
      if (error) throw error;
      
      const options = data.map(product => ({
        label: product.name,
        value: product.id
      }));
      
      setProductOptions(options);
    } catch (error) {
      console.error('Error searching products:', error);
    }
  };

  const handleBarcodeSearch = async () => {
    if (!barcode || barcode.trim() === '') {
      toast.error('الرجاء إدخال الباركود');
      return;
    }
    
    try {
      const product = await fetchProductByBarcode(barcode);
      
      if (!product) {
        toast.error('لم يتم العثور على منتج بهذا الباركود');
        return;
      }
      
      handleAddProduct({
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        price: product.price,
        total: product.price
      });
      
      setBarcode('');
    } catch (error) {
      console.error('Error fetching product by barcode:', error);
      toast.error('حدث خطأ أثناء البحث عن المنتج');
    }
  };

  const handleSelectProduct = async () => {
    if (selectedProductIds.length === 0) {
      toast.error('الرجاء اختيار منتج');
      return;
    }

    try {
      // Fetch product details
      const { data: product, error } = await supabase
        .from('products')
        .select('id, name, price')
        .eq('id', selectedProductIds[0])
        .single();
        
      if (error) throw error;

      handleAddProduct({
        product_id: product.id,
        product_name: product.name,
        quantity: quantity,
        price: product.price,
        total: product.price * quantity,
        reason: itemReason
      });
      
      // Reset selection
      setSelectedProductIds([]);
      setQuantity(1);
      setItemReason('');
      
    } catch (error) {
      console.error('Error adding selected product:', error);
      toast.error('حدث خطأ أثناء إضافة المنتج المحدد');
    }
  };

  const handleAddProduct = (item: ReturnItem) => {
    // Check if product already exists
    const existingItemIndex = returnItems.findIndex(i => i.product_id === item.product_id);
    
    if (existingItemIndex >= 0) {
      // Update existing item
      const updatedItems = [...returnItems];
      updatedItems[existingItemIndex].quantity += item.quantity;
      updatedItems[existingItemIndex].total = updatedItems[existingItemIndex].price * updatedItems[existingItemIndex].quantity;
      
      setReturnItems(updatedItems);
      toast.success('تم تحديث كمية المنتج');
    } else {
      // Add new item
      setReturnItems([...returnItems, item]);
      toast.success('تمت إضافة المنتج');
    }
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...returnItems];
    newItems.splice(index, 1);
    setReturnItems(newItems);
  };

  const calculateTotal = () => {
    return returnItems.reduce((total, item) => total + item.total, 0);
  };

  const handleSubmit = async () => {
    if (returnItems.length === 0) {
      toast.error('الرجاء إضافة منتج واحد على الأقل');
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Create the return record
      const { data: newReturn, error: returnError } = await supabase
        .from('returns')
        .insert({
          order_id: orderId || null,
          customer_name: customerName || null,
          reason: generalReason || null,
          status: 'pending',
          total_amount: calculateTotal()
        })
        .select()
        .single();
      
      if (returnError) throw returnError;
      
      // Add return items
      const returnItemsToInsert = returnItems.map(item => ({
        return_id: newReturn.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        reason: item.reason
      }));
      
      const { error: itemsError } = await supabase
        .from('return_items')
        .insert(returnItemsToInsert);
      
      if (itemsError) throw itemsError;
      
      toast.success('تم إنشاء المرتجع بنجاح');
      
      // Reset form
      setReturnItems([]);
      setGeneralReason('');
      setOrderId('');
      setCustomerName('');
      
      // Close dialog
      onOpenChange(false);
      
      // Refresh parent component
      if (onSuccess) onSuccess();
      
    } catch (error) {
      console.error('Error creating return:', error);
      toast.error('حدث خطأ أثناء إنشاء المرتجع');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl dir-rtl">
        <DialogHeader>
          <DialogTitle className="text-xl">إنشاء مرتجع جديد</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="orderId">رقم الطلب (اختياري)</Label>
              <Input 
                id="orderId"
                value={orderId} 
                onChange={(e) => setOrderId(e.target.value)} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerName">اسم العميل (اختياري)</Label>
              <Input 
                id="customerName"
                value={customerName} 
                onChange={(e) => setCustomerName(e.target.value)} 
              />
            </div>
          </div>
          
          <div className="border-t pt-4">
            <h3 className="font-medium mb-4">إضافة منتجات للمرتجع</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <Label>البحث بالباركود</Label>
                <div className="flex gap-2">
                  <Input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="أدخل الباركود"
                    className="flex-1"
                  />
                  <Button variant="default" onClick={handleBarcodeSearch}>
                    <BarcodeScan className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="space-y-3">
                <Label>البحث بالاسم</Label>
                <MultiSelect
                  options={productOptions}
                  value={selectedProductIds}
                  onChange={setSelectedProductIds}
                  placeholder="البحث عن منتج"
                  className="w-full"
                />
              </div>
              
              <div className="space-y-2">
                <Label>الكمية</Label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                />
              </div>
              
              <div className="space-y-2">
                <Label>سبب الإرجاع (للمنتج)</Label>
                <Input
                  placeholder="سبب إرجاع المنتج"
                  value={itemReason}
                  onChange={(e) => setItemReason(e.target.value)}
                />
              </div>
            </div>
            
            <Button 
              className="mt-4 w-full" 
              onClick={handleSelectProduct}
              disabled={selectedProductIds.length === 0}
            >
              <Plus className="h-4 w-4 ml-2" />
              إضافة المنتج
            </Button>
          </div>
          
          {returnItems.length > 0 && (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-right">المنتج</th>
                    <th className="p-2 text-center">الكمية</th>
                    <th className="p-2 text-center">السعر</th>
                    <th className="p-2 text-center">المجموع</th>
                    <th className="p-2 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {returnItems.map((item, index) => (
                    <tr key={index} className="border-t">
                      <td className="p-2 text-right">{item.product_name}</td>
                      <td className="p-2 text-center">{item.quantity}</td>
                      <td className="p-2 text-center">{formatCurrency(item.price)}</td>
                      <td className="p-2 text-center">{formatCurrency(item.total)}</td>
                      <td className="p-2 text-center">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRemoveItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t bg-muted">
                    <td className="p-2 text-right font-medium" colSpan={3}>الإجمالي</td>
                    <td className="p-2 text-center font-medium">{formatCurrency(calculateTotal())}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="generalReason">سبب الإرجاع العام (اختياري)</Label>
            <Textarea
              id="generalReason"
              placeholder="سبب الإرجاع العام"
              value={generalReason}
              onChange={(e) => setGeneralReason(e.target.value)}
              rows={3}
            />
          </div>
          
          <DialogFooter className="flex justify-end gap-2 dir-rtl">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button 
              variant="default"
              onClick={handleSubmit}
              disabled={isSubmitting || returnItems.length === 0}
            >
              حفظ المرتجع
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
