
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { siteConfig } from "@/config/site";
import { Input } from "@/components/ui/input";
import { fetchProductByBarcode } from "@/services/supabase/productService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Plus, Barcode } from "lucide-react";
import { Product } from "@/types";
import { Form, FormField, FormItem, FormControl } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { MultiSelect } from "@/components/ui/multi-select";
import { useIsMobile } from "@/hooks/use-mobile";

// Types
interface ReturnItem {
  product_id: string;
  product_name?: string;
  quantity: number;
  price: number;
  total: number;
  reason?: string;
}

interface Return {
  id: string;
  order_id: string | null;
  customer_id: string | null;
  customer_name?: string;
  total_amount: number;
  reason: string | null;
  status: string;
  created_at: string;
  items?: ReturnItem[];
}

interface ReturnDetailsDialogProps {
  returnData: Return;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange?: (returnId: string, newStatus: string) => void;
}

export function ReturnDetailsDialog({
  returnData,
  open,
  onOpenChange,
  onStatusChange
}: ReturnDetailsDialogProps) {
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [productOptions, setProductOptions] = useState<{label: string, value: string}[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
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
      
      setSearchResults(data as Product[]);
      
      const options = data.map(product => ({
        label: product.name,
        value: product.id
      }));
      
      setProductOptions(options);
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
      
      await addProductToReturn({
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        price: product.price,
        total: product.price,
        reason: ''
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

  // تنفيذ المسح التلقائي للباركود عندما يتم إدخاله بالكامل
  React.useEffect(() => {
    // إذا كان طول الباركود يساوي 13 (وهو طول قياسي للباركود)، قم بالبحث تلقائيًا
    if (barcode.length === 13) {
      handleBarcodeSearch();
    }
  }, [barcode]);

  const addProductToReturn = async (newItem: ReturnItem) => {
    try {
      setIsSubmitting(true);
      
      // First check if the product already exists in the return items
      const existingItem = returnData.items?.find(item => item.product_id === newItem.product_id);
      
      if (existingItem) {
        toast.error('هذا المنتج موجود بالفعل في المرتجع');
        setIsSubmitting(false);
        return;
      }

      // Insert new return item
      const { error: insertError } = await supabase
        .from('return_items')
        .insert({
          return_id: returnData.id,
          product_id: newItem.product_id,
          quantity: newItem.quantity,
          price: newItem.price,
          total: newItem.price * newItem.quantity,
          reason: newItem.reason
        });

      if (insertError) throw insertError;

      // Update return total amount
      const newTotal = (returnData.total_amount || 0) + (newItem.price * newItem.quantity);
      
      const { error: updateError } = await supabase
        .from('returns')
        .update({ 
          total_amount: newTotal
        })
        .eq('id', returnData.id);

      if (updateError) throw updateError;

      // Add the new item to the existing items array
      if (!returnData.items) {
        returnData.items = [];
      }
      returnData.items.push(newItem);
      returnData.total_amount = newTotal;

      toast.success('تمت إضافة المنتج إلى المرتجع بنجاح');
      
      // Reset form
      setSelectedProductIds([]);
      setQuantity(1);
      setReason('');
      setIsAddingProduct(false);
      setSearchQuery('');
      setSearchResults([]);
      
    } catch (error) {
      console.error('Error adding product to return:', error);
      toast.error('حدث خطأ أثناء إضافة المنتج للمرتجع');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectProduct = async () => {
    if (selectedProductIds.length === 0) {
      toast.error('الرجاء اختيار منتج');
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Fetch product details
      const { data: product, error } = await supabase
        .from('products')
        .select('id, name, price')
        .eq('id', selectedProductIds[0])
        .single();
        
      if (error) throw error;

      addProductToReturn({
        product_id: product.id,
        product_name: product.name,
        quantity: quantity,
        price: product.price,
        total: product.price * quantity,
        reason: reason
      });
      
    } catch (error) {
      console.error('Error adding selected product:', error);
      toast.error('حدث خطأ أثناء إضافة المنتج المحدد');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddSearchedProduct = async (product: Product) => {
    try {
      setIsSubmitting(true);
      
      await addProductToReturn({
        product_id: product.id,
        product_name: product.name,
        quantity: quantity,
        price: product.price,
        total: product.price * quantity,
        reason: reason
      });
      
    } catch (error) {
      console.error('Error adding product:', error);
      toast.error('حدث خطأ أثناء إضافة المنتج');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${isMobile ? 'max-w-full p-3' : 'max-w-3xl'} dir-rtl`}>
        <DialogHeader>
          <DialogTitle className="text-xl">تفاصيل المرتجع #{returnData.id.slice(0, 8)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 md:space-y-6 overflow-y-auto max-h-[calc(100vh-200px)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">رقم الطلب</p>
              <p className="font-medium">{returnData.order_id ? returnData.order_id.slice(0, 8) : '-'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">العميل</p>
              <p className="font-medium">{returnData.customer_name || 'غير معروف'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">تاريخ الإرجاع</p>
              <p className="font-medium" dir="ltr">{formatDate(returnData.created_at)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">حالة الإرجاع</p>
              <Badge className={getStatusBadgeColor(returnData.status)} variant="outline">
                {returnData.status === 'pending' && 'في الانتظار'}
                {returnData.status === 'approved' && 'تم القبول'}
                {returnData.status === 'rejected' && 'مرفوض'}
              </Badge>
            </div>
          </div>

          {returnData.reason && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">سبب الإرجاع</p>
              <p className="p-2 bg-muted rounded">{returnData.reason}</p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <p className="font-medium">المنتجات المرتجعة</p>
              
              {returnData.status === 'pending' && (
                <Button 
                  variant="outline" 
                  size={isMobile ? "sm" : "default"} 
                  className="gap-1"
                  onClick={() => setIsAddingProduct(!isAddingProduct)}
                >
                  <Plus className={`${isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
                  إضافة منتج
                </Button>
              )}
            </div>
            
            {isAddingProduct && (
              <div className="bg-muted p-3 md:p-4 rounded-md space-y-3 mb-3">
                <h3 className="font-medium">إضافة منتج للمرتجع</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <div className="space-y-2">
                    <p className="text-sm">البحث بالباركود</p>
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
                  
                  <div className="space-y-2">
                    <p className="text-sm">البحث بالاسم</p>
                    <div className="space-y-2">
                      <Input
                        value={searchQuery}
                        onChange={(e) => handleSearchProducts(e.target.value)}
                        placeholder="ابحث عن منتج"
                        className="w-full"
                        autoComplete="off"
                      />
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-sm">الكمية</label>
                          <Input
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm">السبب</label>
                          <Input
                            placeholder="سبب الإرجاع"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </div>
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
                              <div className="font-medium text-sm">{product.name}</div>
                              <div className="text-xs text-muted-foreground">{formatCurrency(product.price)}</div>
                            </div>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              className="text-primary hover:bg-primary/10"
                              onClick={() => handleAddSearchedProduct(product)}
                              disabled={isSubmitting}
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
            )}
            
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-right p-2">المنتج</th>
                    <th className="text-center p-2">الكمية</th>
                    <th className="text-center p-2">السعر</th>
                    <th className="text-center p-2">المجموع</th>
                  </tr>
                </thead>
                <tbody>
                  {returnData.items && returnData.items.length > 0 ? (
                    returnData.items.map((item, index) => (
                      <tr key={index} className="border-t">
                        <td className="text-right p-2">{item.product_name}</td>
                        <td className="text-center p-2">{item.quantity}</td>
                        <td className="text-center p-2">{formatCurrency(item.price)}</td>
                        <td className="text-center p-2">{formatCurrency(item.total)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="text-center p-4 text-muted-foreground">
                        لا توجد منتجات مرتجعة
                      </td>
                    </tr>
                  )}
                  <tr className="border-t bg-muted">
                    <td className="text-right p-2 font-medium" colSpan={3}>الإجمالي</td>
                    <td className="text-center p-2 font-medium">{formatCurrency(returnData.total_amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            {returnData.status === 'pending' && onStatusChange && (
              <>
                <Button 
                  variant="destructive" 
                  size={isMobile ? "sm" : "default"}
                  onClick={() => onStatusChange(returnData.id, 'rejected')}
                >
                  رفض الإرجاع
                </Button>
                <Button 
                  variant="default"
                  size={isMobile ? "sm" : "default"}
                  onClick={() => onStatusChange(returnData.id, 'approved')}
                >
                  قبول الإرجاع
                </Button>
              </>
            )}
            <Button 
              variant="outline" 
              size={isMobile ? "sm" : "default"}
              onClick={() => onOpenChange(false)}
            >
              إغلاق
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

