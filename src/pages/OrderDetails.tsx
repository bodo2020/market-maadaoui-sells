import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Printer, Check, X, Package, DollarSign, Truck, Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrderDetails } from "@/hooks/orders/useOrderDetails";
import { OrderItemsList } from "@/components/orders/OrderItemsList";
import { CustomerInfoCards } from "@/components/orders/CustomerInfoCards";
import { PaymentConfirmationDialog } from "@/components/orders/PaymentConfirmationDialog";
import { PaymentMethodBadge } from "@/components/orders/PaymentMethodBadge";
import { OrderTimeline } from "@/components/orders/OrderTimeline";
import { PaymentStatusBadge } from "@/components/orders/PaymentStatusBadge";
import { Order } from "@/types";
import { useState } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { findOrCreateCustomer } from "@/services/supabase/customerService";
import { updateProduct } from "@/services/supabase/productService";
import { RegisterType } from "@/services/supabase/cashTrackingService";
import { recordCashTransaction } from "@/services/supabase/cashTrackingService";

export default function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const {
    order,
    isLoading,
    fetchOrder
  } = useOrderDetails(id as string);

  const getNextStatus = () => {
    const statusOrder = ['pending', 'confirmed', 'preparing', 'ready', 'shipped', 'delivered'];
    const currentIndex = statusOrder.indexOf(order?.status || 'pending');
    return currentIndex < statusOrder.length - 1 ? statusOrder[currentIndex + 1] : null;
  };

  const getNextStatusLabel = () => {
    const nextStatus = getNextStatus();
    const statusLabels = {
      confirmed: 'تأكيد الطلب',
      preparing: 'بدء التجهيز',
      ready: 'جاهز للشحن',
      shipped: 'شحن الطلب',
      delivered: 'تم التسليم'
    };
    return nextStatus ? statusLabels[nextStatus as keyof typeof statusLabels] : '';
  };

  const handleNextStatus = async () => {
    const nextStatus = getNextStatus();
    if (!order || !nextStatus || isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      if (nextStatus === 'delivered' && order.status !== 'delivered') {
        if (order.customer_name || order.customer_phone) {
          const customerInfo = {
            name: order.customer_name || 'عميل غير معروف',
            phone: order.customer_phone || undefined
          };
          
          const customer = await findOrCreateCustomer(customerInfo);
          if (customer && !order.customer_id) {
            await supabase
              .from('online_orders')
              .update({ customer_id: customer.id })
              .eq('id', order.id);
          }
        }
        
        const orderItems = order.items || [];
        
        for (const item of orderItems) {
          const { data: product, error: productError } = await supabase
            .from('products')
            .select('*')
            .eq('id', item.product_id)
            .single();
            
          if (productError) continue;
          
          let quantityToDeduct = item.quantity;
          
          if (product.bulk_enabled && item.barcode === product.bulk_barcode) {
            quantityToDeduct = item.quantity * (product.bulk_quantity || 1);
          }
          
          let newQuantity: number;
          
          if (item.is_weight_based || product.barcode_type === 'scale') {
            const currentQuantity = Math.floor(product.quantity || 0);
            newQuantity = Math.max(0, currentQuantity - Math.floor(quantityToDeduct));
          } else {
            newQuantity = Math.max(0, (product.quantity || 0) - quantityToDeduct);
          }
          
          await updateProduct(product.id, {
            quantity: newQuantity
          });
        }
        
        if (order.payment_status === 'paid') {
          try {
            await recordCashTransaction(
              order.total, 
              'deposit', 
              RegisterType.ONLINE, 
              `أمر الدفع من الطلب الإلكتروني #${order.id.slice(0, 8)}`, 
              ''
            );
          } catch (cashError) {
            console.error("Error recording cash transaction:", cashError);
            toast.error("تم تحديث المخزون لكن حدث خطأ في تسجيل المعاملة المالية");
          }
        }
      }
      
      const { error } = await supabase
        .from('online_orders')
        .update({ 
          status: nextStatus as Order['status'],
          updated_at: new Date().toISOString() 
        })
        .eq('id', order.id);
      
      if (error) throw error;
      
      toast.success(`تم تحديث حالة الطلب إلى ${getNextStatusLabel()}`);
      fetchOrder();
      
    } catch (error) {
      console.error('Error processing order:', error);
      toast.error("حدث خطأ أثناء معالجة الطلب");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order || isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString() 
        })
        .eq('id', order.id);
      
      if (error) throw error;
      
      toast.success('تم إلغاء الطلب بنجاح');
      fetchOrder();
      
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error("حدث خطأ أثناء إلغاء الطلب");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentStatusChange = async (newStatus: Order['payment_status']) => {
    if (!order || isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({
          payment_status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);
      
      if (error) throw error;
      
      toast.success(`تم تحديث حالة الدفع`);
      
      if (newStatus === 'paid' && order.status === 'delivered') {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          await recordCashTransaction(
            order.total, 
            'deposit', 
            RegisterType.ONLINE, 
            `أمر الدفع من الطلب الإلكتروني #${order.id.slice(0, 8)}`, 
            user?.id || ''
          );
        } catch (cashError) {
          console.error("Error recording cash transaction:", cashError);
        }
      }
      
      fetchOrder();
      setPaymentConfirmOpen(false);
    } catch (error) {
      console.error('Error updating payment status:', error);
      toast.error('حدث خطأ أثناء تحديث حالة الدفع');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleItemDeleted = () => {
    fetchOrder();
  };

  const handleItemUpdated = () => {
    fetchOrder();
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="flex justify-center items-center h-[70vh]">
          جاري التحميل...
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="flex justify-center items-center h-[70vh]">
          لم يتم العثور على الطلب
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 pb-24 md:pb-6">
      {/* Header Section - Enhanced */}
      <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-primary/20 animate-fade-in">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/online-orders")}
                className="hover:bg-primary/10"
              >
                <ArrowRight className="h-5 w-5" />
              </Button>
              <div>
                <CardTitle className="text-2xl md:text-3xl font-bold">
                  طلب #{order.id.slice(0, 8)}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {format(new Date(order.created_at), "dd MMMM yyyy - HH:mm", { locale: ar })}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 flex-wrap">
              <PaymentStatusBadge 
                status={order.payment_status}
                editable={false}
              />
              <PaymentMethodBadge paymentMethod={order.payment_method} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="gap-2"
              >
                <Printer className="h-4 w-4" />
                طباعة
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Financial Summary - 4 Cards */}
      <div className="grid gap-4 md:grid-cols-4 animate-fade-in">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Package className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">إجمالي المنتجات</p>
                <p className="text-2xl font-bold">
                  {((order?.total || 0) - (order?.shipping_cost || 0)).toFixed(2)} جنيه
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-green-500/10">
                <Truck className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">رسوم الشحن</p>
                <p className="text-2xl font-bold">
                  {order?.shipping_cost?.toFixed(2) || '0.00'} جنيه
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-purple-500/10">
                <DollarSign className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">طريقة الدفع</p>
                <div className="mt-1">
                  <PaymentMethodBadge paymentMethod={order?.payment_method} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-primary/10">
                <Receipt className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">الإجمالي الكلي</p>
                <p className="text-2xl font-bold text-primary">
                  {order?.total.toFixed(2)} جنيه
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column - Timeline */}
        <div className="space-y-6 md:col-span-1">
          <OrderTimeline 
            status={order.status}
            createdAt={order.created_at}
            updatedAt={order.created_at}
          />
        </div>

        {/* Right Column - Products */}
        <div className="md:col-span-2 space-y-6">
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle className="text-lg">المنتجات ({order?.items?.length || 0} صنف)</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderItemsList
                items={order.items}
                orderId={order.id}
                onItemDeleted={handleItemDeleted}
                onItemUpdated={handleItemUpdated}
                readOnly={false}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Customer Information - Full Width */}
      <div className="animate-fade-in">
        <h3 className="text-lg font-semibold mb-4">معلومات العميل</h3>
        <CustomerInfoCards
          customerName={order.customer_name}
          customerEmail={order.customer_email}
          customerPhone={order.customer_phone}
          shippingAddress={order.shipping_address}
          notes={order.notes}
          governorate={order.governorate}
          city={order.city}
          area={order.area}
          neighborhood={order.neighborhood}
        />
      </div>

      {/* Floating Action Bar - Mobile */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t md:hidden z-50">
        <div className="flex gap-2">
          <Button
            onClick={handleNextStatus}
            disabled={isProcessing || order.status === 'delivered' || order.status === 'cancelled'}
            className="flex-1 gap-2"
          >
            <Check className="h-4 w-4" />
            {getNextStatusLabel()}
          </Button>
          
          {order.status !== 'cancelled' && order.status !== 'delivered' && (
            <Button
              variant="destructive"
              onClick={handleCancelOrder}
              disabled={isProcessing}
              size="icon"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Action Buttons - Desktop */}
      <div className="hidden md:flex gap-4 justify-end animate-fade-in">
        {order.status !== 'cancelled' && order.status !== 'delivered' && (
          <>
            <Button
              onClick={handleNextStatus}
              disabled={isProcessing}
              size="lg"
              className="gap-2"
            >
              <Check className="h-5 w-5" />
              {getNextStatusLabel()}
            </Button>
            
            <Button
              variant="outline"
              onClick={() => setPaymentConfirmOpen(true)}
              disabled={isProcessing}
              size="lg"
              className="gap-2"
            >
              <DollarSign className="h-5 w-5" />
              تأكيد الدفع
            </Button>
            
            <Button
              variant="destructive"
              onClick={handleCancelOrder}
              disabled={isProcessing}
              size="lg"
              className="gap-2"
            >
              <X className="h-5 w-5" />
              إلغاء الطلب
            </Button>
          </>
        )}
      </div>

      {/* Payment Confirmation Dialog */}
      <PaymentConfirmationDialog
        open={paymentConfirmOpen}
        onOpenChange={setPaymentConfirmOpen}
        orderId={order.id}
        onConfirm={fetchOrder}
      />
    </div>
  );
}
