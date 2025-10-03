import { useParams, useNavigate } from "react-router-dom";
import { Order } from "@/types";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderItemsList } from "@/components/orders/OrderItemsList";
import { CustomerInfoCards } from "@/components/orders/CustomerInfoCards";
import { OrderStatusSelection } from "@/components/orders/OrderStatusSelection";
import { PaymentConfirmationDialog } from "@/components/orders/PaymentConfirmationDialog";
import { PaymentStatusBadge } from "@/components/orders/PaymentStatusBadge";
import { OrderStatusProgress } from "@/components/orders/OrderStatusProgress";
import { useOrderDetails } from "@/hooks/orders/useOrderDetails";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { findOrCreateCustomer } from "@/services/supabase/customerService";
import { updateProduct } from "@/services/supabase/productService";
import { RegisterType } from "@/services/supabase/cashTrackingService";
import { recordCashTransaction } from "@/services/supabase/cashTrackingService";
import { 
  ArrowLeft, 
  Package, 
  CreditCard, 
  CheckCircle2, 
  XCircle, 
  Clock,
  TrendingUp
} from "lucide-react";

export default function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);

  const {
    order,
    isLoading,
    isUpdatingStatus,
    selectedStatus,
    setSelectedStatus,
    handleStatusChange: originalHandleStatusChange,
    fetchOrder
  } = useOrderDetails(id as string);

  const handlePaymentStatusUpdate = () => {
    if (!order || order.payment_status === 'paid') return;
    setPaymentConfirmOpen(true);
  };

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
    if (!order || !nextStatus || isProcessingOrder) return;
    
    try {
      setIsProcessingOrder(true);
      
      if (nextStatus === 'delivered' && order.status !== 'delivered') {
        if (order.customer_name || order.customer_phone) {
          const customerInfo = {
            name: order.customer_name || 'عميل غير معروف',
            phone: order.customer_phone || undefined
          };
          
          const customer = await findOrCreateCustomer(customerInfo);
          if (customer) {
            console.log("Customer linked to order:", customer);
            if (!order.customer_id) {
              await supabase
                .from('online_orders')
                .update({ customer_id: customer.id })
                .eq('id', order.id);
            }
          }
        }
        
        const orderItems = order.items || [];
        console.log("Processing inventory for items:", orderItems);
        
        for (const item of orderItems) {
          const { data: product, error: productError } = await supabase
            .from('products')
            .select('*')
            .eq('id', item.product_id)
            .single();
            
          if (productError) {
            console.error("Error fetching product:", productError);
            continue;
          }
          
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
          
          console.log(`Updated inventory for product ${product.name}: ${product.quantity} -> ${newQuantity}`);
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
            console.log(`Added ${order.total} to online cash register`);
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
      setIsProcessingOrder(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order || isProcessingOrder) return;
    
    try {
      setIsProcessingOrder(true);
      
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
      setIsProcessingOrder(false);
    }
  };

  const handlePaymentStatusChange = async (newStatus: Order['payment_status']) => {
    if (!order || isUpdatingPayment) return;
    
    try {
      setIsUpdatingPayment(true);
      
      const { error } = await supabase
        .from('online_orders')
        .update({
          payment_status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);
      
      if (error) throw error;
      
      toast.success(`تم تحديث حالة الدفع إلى ${
        newStatus === 'paid' ? 'مدفوع' : 
        newStatus === 'pending' ? 'في انتظار الدفع' : 
        newStatus === 'failed' ? 'فشل الدفع' : 'تم الاسترجاع'
      }`);
      
      if (newStatus === 'paid' && order.status === 'delivered') {
        try {
          // Get current user ID (may be null if not authenticated)
          const { data: { user } } = await supabase.auth.getUser();
          const userId = user?.id ?? null;
          
          await recordCashTransaction(
            order.total, 
            'deposit', 
            RegisterType.ONLINE, 
            `أمر الدفع من الطلب الإلكتروني #${order.id.slice(0, 8)}`, 
            userId
          );
          console.log(`Added ${order.total} to online cash register`);
        } catch (cashError) {
          console.error("Error recording cash transaction:", cashError);
          toast.error("تم تحديث حالة الدفع لكن حدث خطأ في تسجيل المعاملة المالية");
        }
      }
      
      fetchOrder();
    } catch (error) {
      console.error('Error updating payment status:', error);
      toast.error('حدث خطأ أثناء تحديث حالة الدفع');
    } finally {
      setIsUpdatingPayment(false);
    }
  };

  const onPaymentConfirmed = () => {
    fetchOrder();
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="container mx-auto p-6">
          <div className="flex justify-center items-center h-[70vh]">
            جاري التحميل...
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!order) {
    return (
      <MainLayout>
        <div className="container mx-auto p-6">
          <div className="flex justify-center items-center h-[70vh]">
            لم يتم العثور على الطلب
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto p-6 dir-rtl">
        {/* Header with Gradient Background */}
        <Card className="mb-6 overflow-hidden">
          <div className="bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-foreground">
            <div className="flex justify-between items-start">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Package className="h-8 w-8" />
                  <div>
                    <h1 className="text-3xl font-bold">طلب #{order?.id.slice(0, 8)}</h1>
                    <p className="text-primary-foreground/80 text-sm mt-1">
                      {new Date(order?.created_at || '').toLocaleDateString('ar-EG', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
                
                {order && (
                  <div className="flex items-center gap-2">
                    <PaymentStatusBadge 
                      status={order.payment_status} 
                      onStatusChange={handlePaymentStatusChange} 
                      editable 
                    />
                  </div>
                )}
              </div>

              <Button 
                variant="secondary" 
                onClick={() => navigate('/online-orders')}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                عودة
              </Button>
            </div>

            {/* Order Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
              <Card className="bg-white/10 backdrop-blur border-white/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-primary-foreground/70 text-xs">إجمالي المنتجات</p>
                      <p className="text-2xl font-bold mt-1">
                        {((order?.total || 0) - (order?.shipping_cost || 0)).toFixed(2)} ج.م
                      </p>
                    </div>
                    <Package className="h-8 w-8 text-primary-foreground/50" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/10 backdrop-blur border-white/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-primary-foreground/70 text-xs">رسوم الشحن</p>
                      <p className="text-2xl font-bold mt-1">{order?.shipping_cost?.toFixed(2) || '0.00'} ج.م</p>
                    </div>
                    <CreditCard className="h-8 w-8 text-primary-foreground/50" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/10 backdrop-blur border-white/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-primary-foreground/70 text-xs">عدد المنتجات</p>
                      <p className="text-2xl font-bold mt-1">{order?.items?.length || 0}</p>
                    </div>
                    <Package className="h-8 w-8 text-primary-foreground/50" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-500/20 to-green-600/20 backdrop-blur border-green-400/30">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-primary-foreground/90 text-xs font-semibold">المجموع الكلي</p>
                      <p className="text-2xl font-bold mt-1 text-green-100">{order?.total.toFixed(2)} ج.م</p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-green-200/70" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </Card>

        {/* Order Progress Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <CardTitle>مراحل الطلب</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <OrderStatusProgress status={order?.status || 'pending'} />
            
            {/* Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
              {order?.status !== 'delivered' && order?.status !== 'cancelled' && (
                <>
                  <Button 
                    onClick={handleNextStatus}
                    disabled={isUpdatingStatus || isProcessingOrder}
                    className="w-full gap-2"
                    size="lg"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    {isUpdatingStatus || isProcessingOrder ? 'جاري المعالجة...' : getNextStatusLabel()}
                  </Button>

                  <Button 
                    onClick={handleCancelOrder}
                    disabled={isUpdatingStatus || isProcessingOrder}
                    variant="destructive"
                    className="w-full gap-2"
                    size="lg"
                  >
                    <XCircle className="h-5 w-5" />
                    {isUpdatingStatus || isProcessingOrder ? 'جاري الإلغاء...' : 'إلغاء الطلب'}
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Products Section */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  <CardTitle>المنتجات المطلوبة</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <OrderItemsList 
                  items={order?.items || []} 
                  orderId={order?.id}
                  onItemDeleted={fetchOrder}
                  onItemUpdated={fetchOrder}
                />

                <div className="mt-6 pt-6 border-t">
                  <Button 
                    variant="outline" 
                    className="w-full gap-2" 
                    onClick={handlePaymentStatusUpdate}
                    disabled={order?.payment_status === 'paid' || isUpdatingStatus || isProcessingOrder}
                  >
                    <CreditCard className="h-4 w-4" />
                    {order?.payment_status === 'pending' ? 'تأكيد الدفع' : 'تم الدفع'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Customer Info Section */}
          <div className="lg:col-span-1">
            <CustomerInfoCards
              customerName={order?.customer_name}
              customerEmail={order?.customer_email}
              customerPhone={order?.customer_phone}
              shippingAddress={order?.shipping_address}
              notes={order?.notes}
              governorate={order?.governorate}
              city={order?.city}
              area={order?.area}
              neighborhood={order?.neighborhood}
            />
          </div>
        </div>

        <PaymentConfirmationDialog
          open={paymentConfirmOpen}
          onOpenChange={setPaymentConfirmOpen}
          orderId={order?.id || ''}
          onConfirm={onPaymentConfirmed}
        />
      </div>
    </MainLayout>
  );
}
