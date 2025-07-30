
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
  purchase_price: number;
  profit_loss: number; // الربح المخصوم (الفرق بين البيع والشراء)
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
        .select('id, name, price, purchase_price')
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
      
      const profitPerItem = product.price - (product.purchase_price || 0);
      handleAddProduct({
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        price: product.price,
        purchase_price: product.purchase_price || 0,
        profit_loss: profitPerItem,
        total: product.price, // المبلغ المرتجع هو قيمة البيع الكاملة
        reason: itemReason
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
        .select('id, name, price, purchase_price')
        .eq('id', selectedProductIds[0])
        .single();
        
      if (error) throw error;

      const profitPerItem = product.price - (product.purchase_price || 0);
      handleAddProduct({
        product_id: product.id,
        product_name: product.name,
        quantity: quantity,
        price: product.price,
        purchase_price: product.purchase_price || 0,
        profit_loss: profitPerItem * quantity,
        total: product.price * quantity, // المبلغ المرتجع هو قيمة البيع الكاملة
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
    const profitPerItem = product.price - (product.purchase_price || 0);
    handleAddProduct({
      product_id: product.id,
      product_name: product.name,
      quantity: quantity,
      price: product.price,
      purchase_price: product.purchase_price || 0,
      profit_loss: profitPerItem * quantity,
      total: product.price * quantity, // المبلغ المرتجع هو قيمة البيع الكاملة
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
      const profitPerItem = updatedItems[existingItemIndex].price - updatedItems[existingItemIndex].purchase_price;
      updatedItems[existingItemIndex].profit_loss = profitPerItem * updatedItems[existingItemIndex].quantity;
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

  const validateOrderId = (value: string): boolean => {
    // If empty, it's valid (will be stored as null)
    if (!value || value.trim() === '') return true;
    
    // UUID validation regex pattern
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidPattern.test(value);
  };

  const handleSubmit = async () => {
    if (returnItems.length === 0) {
      toast.error('الرجاء إضافة منتج واحد على الأقل');
      return;
    }

    // Validate order_id if provided
    if (orderId && !validateOrderId(orderId)) {
      toast.error('رقم الطلب غير صحيح، يجب أن يكون قيمة معرف فريد (UUID)');
      return;
    }

    try {
      setIsSubmitting(true);
      
      const returnData = {
        order_id: orderId && orderId.trim() !== '' ? orderId : null,
        customer_id: null,
        customer_name: customerName && customerName.trim() !== '' ? customerName : null,
        reason: generalReason && generalReason.trim() !== '' ? generalReason : null,
        status: 'pending',
        total_amount: calculateTotal()
      };
      
      console.log("Creating return with data:", returnData);
      
      // Create the return record
      const { data: newReturn, error: returnError } = await supabase
        .from('returns')
        .insert(returnData)
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
        purchase_price: item.purchase_price,
        profit_loss: item.profit_loss,
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

      // تحديث مخزون المنتجات - إضافة الكمية المرتجعة
      console.log('تحديث مخزون المنتجات المرتجعة...');
      
      // الحصول على فرع المستخدم الحالي
      const { data: userData, error: userFetchError } = await supabase
        .from('users')
        .select('branch_id')
        .eq('id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (userFetchError) {
        console.error('Error fetching user branch:', userFetchError);
        throw userFetchError;
      }

      const branchId = userData.branch_id;
      console.log('User branch ID:', branchId);

      // تحديث المخزون لكل منتج مرتجع
      for (const item of returnItems) {
        console.log(`تحديث مخزون المنتج ${item.product_id} في الفرع ${branchId} بإضافة ${item.quantity}`);
        try {
          // الحصول على المخزون الحالي
          const { data: currentInventory, error: fetchError } = await supabase
            .from('branch_inventory')
            .select('quantity')
            .eq('product_id', item.product_id)
            .eq('branch_id', branchId)
            .single();
            
          if (fetchError) {
            console.error(`فشل في جلب مخزون المنتج ${item.product_id}:`, fetchError);
            throw fetchError;
          }
          
          const newQuantity = (currentInventory?.quantity || 0) + item.quantity;
          
          // تحديث المخزون
          const { error: inventoryError } = await supabase
            .from('branch_inventory')
            .update({ 
              quantity: newQuantity,
              updated_at: new Date().toISOString()
            })
            .eq('product_id', item.product_id)
            .eq('branch_id', branchId);
            
          if (inventoryError) {
            console.error(`فشل في تحديث مخزون المنتج ${item.product_id}:`, inventoryError);
            throw inventoryError;
          }
          
          console.log(`تم تحديث مخزون المنتج ${item.product_id} بنجاح`);
        } catch (error) {
          console.error(`فشل في تحديث مخزون المنتج ${item.product_id}:`, error);
          throw error;
        }
      }
      
      toast.success('تم إنشاء المرتجع وتحديث المخزون بنجاح');
      
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
                placeholder="اتركه فارغًا أو أدخل معرف الطلب"
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
                    <th className="p-2 text-center">سعر البيع</th>
                    <th className="p-2 text-center">المبلغ المرتجع</th>
                    <th className="p-2 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {returnItems.map((item, index) => (
                    <tr key={index} className="border-t">
                      <td className="p-2 text-right">{item.product_name}</td>
                      <td className="p-2 text-center">{item.quantity}</td>
                      <td className="p-2 text-center">{formatCurrency(item.price)}</td>
                      <td className="p-2 text-center text-red-600 font-medium">{formatCurrency(item.total)}</td>
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
                    <td className="p-2 text-right font-medium" colSpan={3}>إجمالي المبلغ المرتجع</td>
                    <td className="p-2 text-center font-medium text-red-600">{formatCurrency(calculateTotal())}</td>
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
