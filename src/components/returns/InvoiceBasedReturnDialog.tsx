import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Trash2, RotateCcw } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { siteConfig } from "@/config/site";
import { useIsMobile } from "@/hooks/use-mobile";
import { Checkbox } from "@/components/ui/checkbox";

interface InvoiceItem {
  product_id: string;
  product_name: string;
  quantity: number;
  original_price: number; // السعر الأصلي في الفاتورة (مع أو بدون عرض)
  selling_price: number; // سعر البيع الحالي للمنتج
  purchase_price: number;
  total_paid: number; // المبلغ المدفوع في الفاتورة
  has_offer: boolean; // هل كان المنتج في عرض عند البيع
}

interface ReturnItem extends InvoiceItem {
  return_quantity: number;
  return_amount: number;
  reason?: string;
  selected: boolean;
}

interface InvoiceBasedReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function InvoiceBasedReturnDialog({
  open,
  onOpenChange,
  onSuccess
}: InvoiceBasedReturnDialogProps) {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [generalReason, setGeneralReason] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const isMobile = useIsMobile();

  const formatCurrency = (amount: number): string => {
    return `${siteConfig.currency} ${amount.toLocaleString('ar-EG', {
      maximumFractionDigits: 2
    })}`;
  };

  const searchInvoice = async () => {
    if (!invoiceNumber.trim()) {
      toast.error('الرجاء إدخال رقم الفاتورة');
      return;
    }

    setIsSearching(true);
    try {
      // البحث في جدول المبيعات بالفاتورة
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .select('*')
        .eq('invoice_number', invoiceNumber)
        .single();

      if (saleError || !saleData) {
        toast.error('لم يتم العثور على فاتورة بهذا الرقم');
        return;
      }

      setInvoiceData(saleData);
      setCustomerName(saleData.customer_name || '');

      // تحليل عناصر الفاتورة من JSON
      const items = Array.isArray(saleData.items) ? saleData.items : [];
      
      if (items.length === 0) {
        toast.error('هذه الفاتورة لا تحتوي على منتجات');
        return;
      }

      // جلب تفاصيل المنتجات
      const productIds = items
        .map((item: any) => item.product_id)
        .filter(id => id && id !== 'undefined'); // فلترة المعرفات الفارغة أو غير المحددة
      
      if (productIds.length === 0) {
        toast.error('لا توجد منتجات صالحة في هذه الفاتورة');
        return;
      }

      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, name, price, purchase_price, offer_price, is_offer')
        .in('id', productIds);

      if (productsError) {
        console.error('Error fetching products:', productsError);
        toast.error('حدث خطأ في جلب بيانات المنتجات');
        return;
      }

      // تكوين قائمة المنتجات مع الأسعار الصحيحة
      const invoiceItemsData: InvoiceItem[] = items.map((item: any) => {
        const product = productsData?.find(p => p.id === item.product_id);
        
        if (!product) {
          return null;
        }

        // السعر المدفوع في الفاتورة (قد يكون بعرض)
        const paidPrice = item.price || item.selling_price || product.price;
        
        // تحديد ما إذا كان المنتج تم شراؤه بعرض
        const wasOnOffer = item.offer_price && item.offer_price < product.price;
        
        return {
          product_id: product.id,
          product_name: product.name,
          quantity: item.quantity,
          original_price: paidPrice, // السعر المدفوع فعلياً
          selling_price: product.price, // السعر الحالي
          purchase_price: product.purchase_price || 0,
          total_paid: paidPrice * item.quantity,
          has_offer: wasOnOffer || false
        };
      }).filter(Boolean) as InvoiceItem[];

      setInvoiceItems(invoiceItemsData);

      // تحويل إلى عناصر إرجاع مع التحديد الافتراضي
      const returnItemsData: ReturnItem[] = invoiceItemsData.map(item => ({
        ...item,
        return_quantity: item.quantity, // الكمية الافتراضية للإرجاع
        return_amount: item.total_paid, // المبلغ المرتجع (السعر المدفوع)
        selected: false,
        reason: ''
      }));

      setReturnItems(returnItemsData);
      toast.success(`تم العثور على ${invoiceItemsData.length} منتج في الفاتورة`);

    } catch (error) {
      console.error('Error searching invoice:', error);
      toast.error('حدث خطأ أثناء البحث عن الفاتورة');
    } finally {
      setIsSearching(false);
    }
  };

  const handleQuantityChange = (index: number, newQuantity: number) => {
    const updatedItems = [...returnItems];
    const item = updatedItems[index];
    
    // التأكد من أن الكمية لا تتجاوز الكمية الأصلية
    const validQuantity = Math.min(Math.max(0, newQuantity), item.quantity);
    
    item.return_quantity = validQuantity;
    item.return_amount = item.original_price * validQuantity;
    
    setReturnItems(updatedItems);
  };

  const handleItemSelection = (index: number, selected: boolean) => {
    const updatedItems = [...returnItems];
    updatedItems[index].selected = selected;
    setReturnItems(updatedItems);
  };

  const handleItemReasonChange = (index: number, reason: string) => {
    const updatedItems = [...returnItems];
    updatedItems[index].reason = reason;
    setReturnItems(updatedItems);
  };

  const calculateTotalReturn = () => {
    return returnItems
      .filter(item => item.selected && item.return_quantity > 0)
      .reduce((total, item) => total + item.return_amount, 0);
  };

  const getSelectedItems = () => {
    return returnItems.filter(item => item.selected && item.return_quantity > 0);
  };

  const handleSubmit = async () => {
    const selectedItems = getSelectedItems();
    
    if (selectedItems.length === 0) {
      toast.error('الرجاء اختيار منتج واحد على الأقل للإرجاع');
      return;
    }

    try {
      setIsSubmitting(true);
      
      const returnData = {
        order_id: null, // يمكن ربطه بالطلب إذا كان متوفراً
        customer_id: null,
        customer_name: customerName || null,
        reason: generalReason || null,
        status: 'pending',
        total_amount: calculateTotalReturn()
      };
      
      // إنشاء سجل الإرجاع
      const { data: newReturn, error: returnError } = await supabase
        .from('returns')
        .insert(returnData)
        .select()
        .single();
      
      if (returnError) throw returnError;
      
      // إضافة عناصر الإرجاع
      const returnItemsToInsert = selectedItems.map(item => ({
        return_id: newReturn.id,
        product_id: item.product_id,
        quantity: item.return_quantity,
        price: item.original_price, // السعر المدفوع فعلياً
        purchase_price: item.purchase_price,
        profit_loss: (item.original_price - item.purchase_price) * item.return_quantity,
        total: item.return_amount,
        reason: item.reason || generalReason || null
      }));
      
      const { error: itemsError } = await supabase
        .from('return_items')
        .insert(returnItemsToInsert);
      
      if (itemsError) throw itemsError;

      toast.success('تم إنشاء المرتجع بنجاح');
      
      // إعادة تعيين النموذج
      setInvoiceNumber('');
      setInvoiceItems([]);
      setReturnItems([]);
      setGeneralReason('');
      setCustomerName('');
      setInvoiceData(null);
      
      onOpenChange(false);
      if (onSuccess) onSuccess();
      
    } catch (error: any) {
      console.error('Error creating return:', error);
      toast.error('حدث خطأ أثناء إنشاء المرتجع: ' + (error.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setInvoiceNumber('');
    setInvoiceItems([]);
    setReturnItems([]);
    setGeneralReason('');
    setCustomerName('');
    setInvoiceData(null);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetForm();
      onOpenChange(open);
    }}>
      <DialogContent className={`${isMobile ? 'max-w-full p-3' : 'max-w-4xl'} dir-rtl`}>
        <DialogHeader>
          <DialogTitle className="text-xl">إرجاع بناءً على رقم الفاتورة</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* البحث بالفاتورة */}
          <div className="space-y-4 border-b pb-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="invoiceNumber">رقم الفاتورة</Label>
                <Input
                  id="invoiceNumber"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="أدخل رقم الفاتورة"
                  onKeyPress={(e) => e.key === 'Enter' && searchInvoice()}
                />
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={searchInvoice} 
                  disabled={isSearching}
                  className="min-w-[100px]"
                >
                  {isSearching ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <Search className="h-4 w-4 ml-1" />
                      بحث
                    </>
                  )}
                </Button>
              </div>
            </div>

            {invoiceData && (
              <div className="bg-muted p-3 rounded-md">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                  <div>رقم الفاتورة: <span className="font-medium">{invoiceData.invoice_number}</span></div>
                  <div>التاريخ: <span className="font-medium">{new Date(invoiceData.date).toLocaleDateString('ar-EG')}</span></div>
                  <div>إجمالي الفاتورة: <span className="font-medium">{formatCurrency(invoiceData.total)}</span></div>
                  {invoiceData.customer_name && (
                    <div>اسم العميل: <span className="font-medium">{invoiceData.customer_name}</span></div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* قائمة المنتجات للإرجاع */}
          {returnItems.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">منتجات الفاتورة - اختر ما تريد إرجاعه</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const updatedItems = returnItems.map(item => ({
                      ...item,
                      selected: !returnItems.every(i => i.selected)
                    }));
                    setReturnItems(updatedItems);
                  }}
                >
                  {returnItems.every(item => item.selected) ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                </Button>
              </div>

              <div className="border rounded-md overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-center w-12">اختيار</th>
                      <th className="p-2 text-right">المنتج</th>
                      <th className="p-2 text-center">الكمية الأصلية</th>
                      <th className="p-2 text-center">كمية الإرجاع</th>
                      <th className="p-2 text-center">السعر المدفوع</th>
                      <th className="p-2 text-center">المبلغ المرتجع</th>
                      <th className="p-2 text-center">سبب الإرجاع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnItems.map((item, index) => (
                      <tr key={item.product_id} className="border-t">
                        <td className="p-2 text-center">
                          <Checkbox
                            checked={item.selected}
                            onCheckedChange={(checked) => handleItemSelection(index, checked as boolean)}
                          />
                        </td>
                        <td className="p-2 text-right">
                          <div>
                            <div className="font-medium">{item.product_name}</div>
                            {item.has_offer && (
                              <div className="text-xs text-green-600">تم شراؤه بعرض خاص</div>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-center">{item.quantity}</td>
                        <td className="p-2 text-center">
                          <Input
                            type="number"
                            min="0"
                            max={item.quantity}
                            value={item.return_quantity}
                            onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 0)}
                            className="w-20 text-center"
                            disabled={!item.selected}
                          />
                        </td>
                        <td className="p-2 text-center">
                          <div className="text-sm">
                            {formatCurrency(item.original_price)}
                            {item.has_offer && (
                              <div className="text-xs text-muted-foreground line-through">
                                {formatCurrency(item.selling_price)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-center font-medium text-red-600">
                          {formatCurrency(item.return_amount)}
                        </td>
                        <td className="p-2">
                          <Input
                            placeholder="سبب الإرجاع"
                            value={item.reason}
                            onChange={(e) => handleItemReasonChange(index, e.target.value)}
                            className="w-32 text-sm"
                            disabled={!item.selected}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted">
                    <tr>
                      <td colSpan={5} className="p-2 text-right font-medium">
                        إجمالي المبلغ المرتجع:
                      </td>
                      <td className="p-2 text-center font-bold text-red-600">
                        {formatCurrency(calculateTotalReturn())}
                      </td>
                      <td className="p-2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="space-y-2">
                <Label htmlFor="generalReason">سبب الإرجاع العام (اختياري)</Label>
                <Textarea
                  id="generalReason"
                  value={generalReason}
                  onChange={(e) => setGeneralReason(e.target.value)}
                  placeholder="اكتب سبب الإرجاع العام..."
                  rows={3}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          {returnItems.length > 0 && (
            <Button 
              onClick={handleSubmit} 
              disabled={isSubmitting || getSelectedItems().length === 0}
              className="min-w-[120px]"
            >
              {isSubmitting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 ml-1" />
                  إنشاء المرتجع ({getSelectedItems().length} منتج)
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}