
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchProductByBarcode } from "@/services/supabase/productService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Plus, Barcode, Trash2 } from "lucide-react";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { MultiSelect } from "@/components/ui/multi-select";
import { Textarea } from "@/components/ui/textarea";
import { Product } from "@/types";
import { siteConfig } from "@/config/site";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const isMobile = useIsMobile();

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
      setSearchResults([]);
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
      setSearchResults(data as Product[]);
    } catch (error) {
      console.error('Error searching products:', error);
    }
  };

  const handleBarcodeSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
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

  // تنفيذ البحث بالباركود عند الضغط على زر Enter
  const handleBarcodeKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBarcodeSearch();
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

  const handleAddSearchedProduct = (product: Product) => {
    handleAddProduct({
      product_id: product.id,
      product_name: product.name,
      quantity: quantity,
      price: product.price,
      total: product.price * quantity,
      reason: itemReason
    });

    // Reset search
    setSearchQuery('');
    setSearchResults([]);
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
      
      console.log("Creating return with data:", {
        order_id: orderId || null,
        customer_id: null,
        customer_name: customerName || null,
        reason: generalReason || null,
        status: 'pending',
        total_amount: calculateTotal()
      });
      
      // Create the return record with customer_name included
      const { data: newReturn, error: returnError } = await supabase
        .from('returns')
        .insert({
          order_id: orderId || null,
          customer_id: null,
          customer_name: customerName || null,
          reason: generalReason || null,
          status: 'pending',
          total_amount: calculateTotal()
        })
        .select()
        .single();
      
      if (returnError) {
        console.error("Return creation error details:", returnError);
        throw returnError;
      }
      
      console.log("Return created successfully:", newReturn);
      
      // Add return items
      const returnItemsToInsert = returnItems.map(item => ({
        return_id: newReturn.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        reason: item.reason
      }));
      
      console.log("Inserting return items:", returnItemsToInsert);
      
      const { error: itemsError } = await supabase
        .from('return_items')
        .insert(returnItemsToInsert);
      
      if (itemsError) {
        console.error("Return items creation error:", itemsError);
        throw itemsError;
      }
      
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
      
    } catch (error: any) {
      console.error('Error creating return:', error);
      
      // Enhanced error message
      let errorMessage = 'حدث خطأ أثناء إنشاء المرتجع';
      
      // Try to extract more specific error details
      if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      
      toast.error(errorMessage, {
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // تنفيذ المسح التلقائي للباركود عندما يتم إدخاله بالكامل
  useEffect(() => {
    // إذا كان طول الباركود يساوي 13 (وهو طول قياسي للباركود)، قم بالبحث تلقائيًا
    if (barcode.length === 13) {
      handleBarcodeSearch();
    }
  }, [barcode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${isMobile ? 'max-w-full p-3' : 'max-w-3xl'} dir-rtl`}>
        <DialogHeader>
          <DialogTitle className="text-xl">إنشاء مرتجع جديد</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 md:space-y-6 overflow-y-auto max-h-[calc(100vh-200px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
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
            <h3 className="font-medium mb-3 md:mb-4">إضافة منتجات للمرتجع</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <div className="space-y-2 md:space-y-3">
                <Label>البحث بالباركود</Label>
                <form onSubmit={handleBarcodeSearch} className="flex gap-2">
                  <Input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyPress={handleBarcodeKeyPress}
                    placeholder="أدخل الباركود"
                    className="flex-1"
                    autoComplete="off"
                  />
                  <Button variant="default" type="submit" size={isMobile ? "sm" : "default"}>
                    <Barcode className={`${isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
                  </Button>
                </form>
              </div>
              
              <div className="space-y-2 md:space-y-3">
                <Label>البحث بالاسم</Label>
                <div className="space-y-2">
                  <Input
                    placeholder="ابحث عن منتج"
                    value={searchQuery}
                    onChange={(e) => handleSearchProducts(e.target.value)}
                    className="w-full"
                    autoComplete="off"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1 md:space-y-2">
                    <Label>الكمية</Label>
                    <Input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  
                  <div className="space-y-1 md:space-y-2">
                    <Label>سبب الإرجاع (للمنتج)</Label>
                    <Input
                      placeholder="سبب إرجاع المنتج"
                      value={itemReason}
                      onChange={(e) => setItemReason(e.target.value)}
                    />
                  </div>
                </div>

                {searchResults.length > 0 && (
                  <div className="bg-white border rounded-md max-h-40 md:max-h-60 overflow-y-auto mt-1">
                    {searchResults.map((product) => (
                      <div 
                        key={product.id} 
                        className="flex justify-between items-center p-2 hover:bg-gray-50 cursor-pointer border-b"
                      >
                        <div>
                          <div className="font-medium text-sm md:text-base">{product.name}</div>
                          <div className="text-xs text-muted-foreground">{formatCurrency(product.price)}</div>
                        </div>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          className="text-primary hover:bg-primary/10" 
                          onClick={() => handleAddSearchedProduct(product)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {returnItems.length > 0 && (
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full min-w-[500px]">
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
          
          <DialogFooter className="flex justify-end gap-2 dir-rtl pt-2">
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
