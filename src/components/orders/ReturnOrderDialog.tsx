import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, PackageCheck } from "lucide-react";
import { createReturnOrder, checkExistingReturn, ReturnOrderItem } from "@/services/supabase/returnOrderService";
import { toast } from "sonner";
import { Order } from "@/types";

interface ReturnOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
  items: any[];
  orderId?: string;
  saleId?: string;
  orderType: 'online' | 'pos';
  customerName?: string;
  customerPhone?: string;
  invoiceNumber?: string;
  total: number;
}

export function ReturnOrderDialog({
  open,
  onOpenChange,
  onComplete,
  items,
  orderId,
  saleId,
  orderType,
  customerName,
  customerPhone,
  invoiceNumber,
  total
}: ReturnOrderDialogProps) {
  const [selectedItems, setSelectedItems] = useState<ReturnOrderItem[]>([]);
  const [reason, setReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [returnAll, setReturnAll] = useState(true);
  const [customQuantities, setCustomQuantities] = useState<{[key: string]: number}>({});
  const [step, setStep] = useState<'items' | 'reason' | 'confirmation' | 'success'>('items');
  
  const resetState = () => {
    setSelectedItems([]);
    setReason("");
    setIsProcessing(false);
    setReturnAll(true);
    setCustomQuantities({});
    setStep('items');
  };
  
  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };
  
  const toggleItemSelection = (item: any) => {
    if (!returnAll) {
      const existingItem = selectedItems.find(i => 
        orderType === 'online' 
          ? i.product_id === item.product_id 
          : i.product_id === item.product.id
      );
      
      if (existingItem) {
        setSelectedItems(selectedItems.filter(i => 
          orderType === 'online' 
            ? i.product_id !== item.product_id 
            : i.product_id !== item.product.id
        ));
      } else {
        const newItem: ReturnOrderItem = orderType === 'online' 
          ? {
              product_id: item.product_id,
              product_name: item.product_name,
              quantity: item.quantity,
              price: item.price,
              total: item.total
            }
          : {
              product_id: item.product.id,
              product_name: item.product.name,
              quantity: item.quantity,
              price: item.price,
              total: item.total
            };
            
        setSelectedItems([...selectedItems, newItem]);
      }
    }
  };
  
  const isItemSelected = (item: any) => {
    return returnAll || selectedItems.some(i => 
      orderType === 'online' 
        ? i.product_id === item.product_id 
        : i.product_id === item.product.id
    );
  };
  
  const handleQuantityChange = (item: any, quantity: number) => {
    const itemId = orderType === 'online' ? item.product_id : item.product.id;
    
    if (isNaN(quantity) || quantity < 1) {
      quantity = 1;
    }
    
    const maxQuantity = orderType === 'online' ? item.quantity : item.quantity;
    if (quantity > maxQuantity) {
      quantity = maxQuantity;
    }
    
    setCustomQuantities({
      ...customQuantities,
      [itemId]: quantity
    });
    
    const existingItemIndex = selectedItems.findIndex(i => i.product_id === itemId);
    
    if (existingItemIndex > -1) {
      const updatedItems = [...selectedItems];
      const unitPrice = updatedItems[existingItemIndex].price;
      
      updatedItems[existingItemIndex] = {
        ...updatedItems[existingItemIndex],
        quantity,
        total: unitPrice * quantity
      };
      
      setSelectedItems(updatedItems);
    } else {
      const newItem: ReturnOrderItem = orderType === 'online' 
        ? {
            product_id: item.product_id,
            product_name: item.product_name,
            quantity,
            price: item.price,
            total: item.price * quantity
          }
        : {
            product_id: item.product.id,
            product_name: item.product.name,
            quantity,
            price: item.price,
            total: item.price * quantity
          };
          
      setSelectedItems([...selectedItems, newItem]);
    }
  };
  
  const getItemQuantity = (item: any) => {
    const itemId = orderType === 'online' ? item.product_id : item.product.id;
    return customQuantities[itemId] || (orderType === 'online' ? item.quantity : item.quantity);
  };
  
  const handleToggleReturnAll = () => {
    setReturnAll(!returnAll);
    if (!returnAll) {
      const allItems = items.map(item => {
        const quantity = customQuantities[orderType === 'online' ? item.product_id : item.product.id] 
          || (orderType === 'online' ? item.quantity : item.quantity);
          
        return {
          product_id: orderType === 'online' ? item.product_id : item.product.id,
          product_name: orderType === 'online' ? item.product_name : item.product.name,
          quantity,
          price: orderType === 'online' ? item.price : item.price,
          total: (orderType === 'online' ? item.price : item.price) * quantity
        };
      });
      
      setSelectedItems(allItems);
    } else {
      setSelectedItems([]);
    }
  };
  
  const calculateReturnTotal = () => {
    if (returnAll) {
      return total;
    } else {
      return selectedItems.reduce((sum, item) => sum + item.total, 0);
    }
  };
  
  const prepareItemsForReturn = () => {
    if (returnAll) {
      return items.map(item => {
        const itemId = orderType === 'online' ? item.product_id : item.product.id;
        const quantity = customQuantities[itemId] 
          || (orderType === 'online' ? item.quantity : item.quantity);
        
        return {
          product_id: orderType === 'online' ? item.product_id : item.product.id,
          product_name: orderType === 'online' ? item.product_name : item.product.name,
          quantity,
          price: orderType === 'online' ? item.price : item.price,
          total: (orderType === 'online' ? item.price : item.price) * quantity
        };
      });
    } else {
      return selectedItems;
    }
  };
  
  const handleNextStep = () => {
    if (step === 'items') {
      if (prepareItemsForReturn().length === 0) {
        toast.error("يرجى اختيار منتج واحد على الأقل للإرجاع");
        return;
      }
      setStep('reason');
    } else if (step === 'reason') {
      if (!reason.trim()) {
        toast.error("يرجى كتابة سبب الإرجاع");
        return;
      }
      setStep('confirmation');
    } else if (step === 'confirmation') {
      handleSubmitReturn();
    }
  };
  
  const handlePreviousStep = () => {
    if (step === 'reason') {
      setStep('items');
    } else if (step === 'confirmation') {
      setStep('reason');
    }
  };
  
  const handleSubmitReturn = async () => {
    try {
      setIsProcessing(true);
      
      if (orderId) {
        const existingReturn = await checkExistingReturn(orderId);
        if (existingReturn) {
          toast.error("يوجد بالفعل طلب إرجاع معلق لهذا الطلب");
          setIsProcessing(false);
          return;
        }
      }
      
      const returnItems = prepareItemsForReturn();
      const returnTotal = calculateReturnTotal();
      
      const returnOrderData = {
        order_id: orderId,
        sale_id: saleId,
        items: returnItems,
        reason,
        total: returnTotal,
        requested_by: "current-user",
        order_type: orderType,
        customer_name: customerName,
        customer_phone: customerPhone,
        invoice_number: invoiceNumber
      };
      
      const result = await createReturnOrder(returnOrderData);
      
      if (result) {
        toast.success("تم إنشاء طلب الإرجاع بنجاح");
        setStep('success');
        if (onComplete) {
          onComplete();
        }
      } else {
        toast.error("حدث خطأ أثناء إنشاء طلب الإرجاع");
      }
    } catch (error) {
      console.error("Error creating return order:", error);
      toast.error("حدث خطأ أثناء إنشاء طلب الإرجاع");
    } finally {
      setIsProcessing(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md sm:max-w-lg md:max-w-xl dir-rtl">
        <DialogHeader>
          <DialogTitle>
            إنشاء طلب إرجاع {orderType === 'online' ? 'للطلب' : 'للفاتورة'} 
            {invoiceNumber ? ` #${invoiceNumber}` : ''}
          </DialogTitle>
        </DialogHeader>
        
        {step === 'items' && (
          <>
            <div className="space-y-4">
              <div className="flex items-center space-x-2 space-x-reverse">
                <input
                  type="checkbox"
                  id="returnAll"
                  checked={returnAll}
                  onChange={handleToggleReturnAll}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="returnAll">إرجاع جميع المنتجات</Label>
              </div>
              
              <div className="max-h-[300px] overflow-y-auto space-y-2 border rounded-md p-3">
                {items.map((item, index) => {
                  const itemId = orderType === 'online' ? item.product_id : item.product.id;
                  const itemName = orderType === 'online' ? item.product_name : item.product.name;
                  const itemQuantity = orderType === 'online' ? item.quantity : item.quantity;
                  const itemPrice = orderType === 'online' ? item.price : item.price;
                  
                  return (
                    <div key={index} className="flex items-center justify-between p-2 border-b last:border-b-0">
                      {!returnAll && (
                        <input
                          type="checkbox"
                          checked={isItemSelected(item)}
                          onChange={() => toggleItemSelection(item)}
                          className="h-4 w-4 rounded border-gray-300 ml-2"
                        />
                      )}
                      
                      <div className={`flex-1 ${!returnAll && !isItemSelected(item) ? 'opacity-50' : ''}`}>
                        <p className="font-medium">{itemName}</p>
                        <p className="text-sm text-muted-foreground">
                          {itemPrice} × {itemQuantity} = {itemPrice * itemQuantity}
                        </p>
                      </div>
                      
                      {(returnAll || isItemSelected(item)) && (
                        <div className="flex items-center">
                          <Label htmlFor={`quantity-${itemId}`} className="ml-2">الكمية:</Label>
                          <Input
                            id={`quantity-${itemId}`}
                            type="number"
                            min={1}
                            max={itemQuantity}
                            value={getItemQuantity(item)}
                            onChange={(e) => handleQuantityChange(item, parseInt(e.target.value))}
                            className="w-16 text-center"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div className="flex justify-between font-medium">
                <span>إجمالي المبلغ المسترد:</span>
                <span>{calculateReturnTotal().toFixed(2)}</span>
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                type="button" 
                onClick={handleNextStep} 
                disabled={prepareItemsForReturn().length === 0}
              >
                التالي
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleClose}
              >
                إلغاء
              </Button>
            </DialogFooter>
          </>
        )}
        
        {step === 'reason' && (
          <>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="returnReason">سبب الإرجاع</Label>
                <Textarea
                  id="returnReason"
                  placeholder="يرجى كتابة سبب الإرجاع بالتفصيل..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={5}
                  className="resize-none"
                />
              </div>
            </div>
            
            <DialogFooter className="flex justify-between space-x-2 space-x-reverse">
              <div>
                <Button 
                  type="button" 
                  onClick={handlePreviousStep}
                  variant="outline"
                >
                  السابق
                </Button>
              </div>
              <div>
                <Button 
                  type="button" 
                  onClick={handleNextStep} 
                  disabled={!reason.trim()}
                >
                  التالي
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleClose}
                  className="mr-2"
                >
                  إلغاء
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
        
        {step === 'confirmation' && (
          <>
            <div className="space-y-4">
              <div className="rounded-lg border p-4 bg-muted/30">
                <h3 className="font-semibold mb-2">تأكيد طلب الإرجاع</h3>
                <p className="text-sm mb-4">
                  سيتم إرسال طلب الإرجاع هذا إلى المدير للمراجعة والموافقة. 
                  هل أنت متأكد من أنك تريد المتابعة؟
                </p>
                
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">المنتجات: </span>
                    {prepareItemsForReturn().map(item => item.product_name).join(', ')}
                  </div>
                  <div>
                    <span className="font-medium">سبب الإرجاع: </span>
                    {reason}
                  </div>
                  <div>
                    <span className="font-medium">إجمالي المبلغ المسترد: </span>
                    {calculateReturnTotal().toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
            
            <DialogFooter className="flex justify-between space-x-2 space-x-reverse">
              <div>
                <Button 
                  type="button" 
                  onClick={handlePreviousStep}
                  variant="outline"
                >
                  السابق
                </Button>
              </div>
              <div>
                <Button 
                  type="button" 
                  onClick={handleSubmitReturn} 
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      جاري الإرسال...
                    </>
                  ) : (
                    'إرسال طلب الإرجاع'
                  )}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleClose}
                  className="mr-2"
                  disabled={isProcessing}
                >
                  إلغاء
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
        
        {step === 'success' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <PackageCheck className="h-8 w-8 text-green-600" />
            </div>
            
            <h3 className="text-xl font-semibold">تم إرسال طلب الإرجاع بنجاح</h3>
            
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              تم إرسال طلب الإرجاع إلى المدير للمراجعة. سيتم إخطارك بمجرد مراجعة الطلب.
            </p>
            
            <Button 
              type="button" 
              onClick={handleClose}
              className="mt-4"
            >
              إغلاق
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
