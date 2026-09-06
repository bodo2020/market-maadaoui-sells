import { readCheckoutSnapshot } from "@/services/supabase/checkoutOrderService";
import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, Bell, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { useNotificationStore } from "@/stores/notificationStore";
import { Order, OrderItem } from "@/types";
import { useOrderManagement } from "@/hooks/orders/useOrderManagement";
import { OrderStats, matchesOrderFilter } from "@/components/orders/OrderStats";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { CustomerProfileDialog } from "@/components/orders/CustomerProfileDialog";
import { PaymentConfirmationDialog } from "@/components/orders/PaymentConfirmationDialog";
import { AssignDeliveryPersonDialog } from "@/components/orders/AssignDeliveryPersonDialog";
import { RegisterType, recordCashTransaction } from "@/services/supabase/cashTrackingService";
import { useBranchStore } from "@/stores/branchStore";
import { ReturnOrderDialog } from "@/components/orders/ReturnOrderDialog";
import { updateProductQuantity } from "@/services/supabase/productService";
import OnlineOrderInvoiceDialog from "@/components/orders/OnlineOrderInvoiceDialog";
export default function OnlineOrders() {
  const { currentBranchId } = useBranchStore();
  const [page, setPage] = useState(1);
  const [cancelTargets, setCancelTargets] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [assignDeliveryOpen, setAssignDeliveryOpen] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [returnOrderId, setReturnOrderId] = useState<string | null>(null);
  const [returnItems, setReturnItems] = useState<OrderItem[]>([]);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<Order | null>(null);
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const {
    orders,
    loading,
    handleOrderUpdate,
    error: ordersError,
    } = useOrderManagement("all");
  const {
    markOrdersAsRead
  } = useNotificationStore();
  const navigate = useNavigate();

  // Initialize audio notification
  useEffect(() => {
    // Create audio element for notification sound
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZQQ0PU6ni8bdjHwU2iNL00H0lBisz');
  }, []);

  // Listen for new orders using Realtime
  useEffect(() => {
    console.log('🔔 Setting up realtime subscription. Notification enabled:', notificationEnabled);
    
    if (!notificationEnabled) {
      console.log('⚠️ Notifications disabled, skipping realtime setup');
      return;
    }

    const channel = supabase
      .channel('online-orders-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'online_orders'
        },
        async (payload) => {
          console.log('✅ New order received via realtime:', payload);
          const newOrder = payload.new as any;
          
          // Play notification sound
          if (audioRef.current) {
            console.log('🔊 Playing notification sound');
            audioRef.current.play().catch(error => {
              console.error('❌ Error playing notification sound:', error);
            });
          }
          
          // Show toast notification with 5 minutes duration and action to navigate
          console.log('🔔 Showing toast notification');
          toast.success('طلب جديد وارد! 🔔', {
            description: `طلب رقم: ${newOrder.id.slice(0, 8)} - المبلغ: ${newOrder.total} ج.م`,
            duration: 300000, // 5 minutes = 300000 milliseconds
            action: {
              label: "عرض الطلب",
              onClick: () => {
                console.log('👆 User clicked on order notification');
                navigate(`/online-orders/${newOrder.id}`);
              },
            },
          });
          
          // Refresh orders list
          console.log('🔄 Refreshing orders list');
          handleOrderUpdate();
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status:', status);
      });

    console.log('✅ Realtime channel created and subscribed');

    return () => {
      console.log('🔌 Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [notificationEnabled, handleOrderUpdate, navigate]);
  const handleArchive = (order: Order) => {
    toast.success("تم أرشفة الطلب");
  };
  const handleProcess = (order: Order) => {
    navigate(`/online-orders/${order.id}`);
  };
  const handleComplete = async (order: Order) => {
    try {
      const {
        data: orderDetails,
        error: orderError
      } = await supabase.from('online_orders').select('*').eq('id', order.id).single();
      if (orderError) throw orderError;
      if (orderDetails.status === 'delivered' || orderDetails.status === 'cancelled') return;
      const orderItems = readCheckoutSnapshot(orderDetails).checkout_version === 1 ? [] : (Array.isArray(orderDetails.items) ? orderDetails.items : []);
      for (const item of orderItems) {
        const orderItem = item as unknown as OrderItem;
        if (!orderItem.product_id) {
          console.error("Invalid order item missing product_id:", item);
          continue;
        }
        try {
          await updateProductQuantity(orderItem.product_id, orderItem.quantity || 0, 'decrease');
          console.log(`Updated inventory for product ${orderItem.product_id}: decreased by ${orderItem.quantity}`);
        } catch (inventoryError) {
          console.error("Error updating inventory:", inventoryError);
          continue;
        }
      }
      if (orderDetails.payment_status === 'paid') {
        try {
          const branchId = orderDetails.branch_id || currentBranchId || undefined;
          await recordCashTransaction(orderDetails.total, 'deposit', RegisterType.ONLINE, `أمر الدفع من الطلب الإلكتروني #${order.id.slice(0, 8)}`, '', branchId);
          console.log(`Added ${orderDetails.total} to online cash register`);
        } catch (cashError) {
          console.error("Error recording cash transaction:", cashError);
          toast.error("تم تحديث المخزون لكن حدث خطأ في تسجيل المعاملة المالية");
        }
      }
      const {
        error
      } = await supabase.from('online_orders').update({
        status: 'delivered',
        updated_at: new Date().toISOString()
      }).eq('id', order.id);
      if (error) throw error;
      handleOrderUpdate();
      toast.success("تم اكتمال الطلب وتحديث المخزون");
    } catch (error) {
      console.error('Error completing order:', error);
      toast.error("حدث خطأ أثناء اكتمال الطلب");
    }
  };
  const handleCancel = async (order: Order) => {
    try {
      const notes = `${order.notes ? order.notes + ' - ' : ''}تم إلغاء هذا الطلب`;
      const {
        error
      } = await supabase.from('online_orders').update({
        status: 'cancelled',
        notes,
        updated_at: new Date().toISOString()
      }).eq('id', order.id);
      if (error) throw error;
      handleOrderUpdate();
      toast.success("تم إلغاء الطلب وإلغاء عملية الدفع");
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error("حدث خطأ أثناء إلغاء الطلب");
    }
  };
  const handlePaymentConfirm = (order: Order) => {
    setCurrentOrderId(order.id);
    setPaymentConfirmOpen(true);
  };
  const handleAssignDelivery = (order: Order) => {
    setCurrentOrderId(order.id);
    setAssignDeliveryOpen(true);
  };
  const showCustomerProfile = (order: Order) => {
    setSelectedCustomer({
      name: order.customer_name,
      email: order.customer_email,
      phone: order.customer_phone,
      address: order.shipping_address,
      governorate: order.governorate,
      city: order.city,
      area: order.area,
      neighborhood: order.neighborhood,
      order: order
    });
  };
  const handleReturn = async (order: Order) => {
    setReturnOrderId(order.id);
    setReturnItems(order.items);
    setReturnDialogOpen(true);
  };

  const handlePrintInvoice = (order: Order) => {
    setSelectedOrderForInvoice(order);
    setInvoiceDialogOpen(true);
  };

  const normalise = (value: string) => value.toLowerCase().replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).trim();
  const filteredOrders = useMemo(() => orders.filter(order => matchesOrderFilter(order,activeTab) && normalise([order.id,order.tracking_number,order.customer_name,order.customer_phone].filter(Boolean).join(' ')).includes(normalise(searchQuery))),[orders,activeTab,searchQuery]);
  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / 25));
  const visibleOrders = filteredOrders.slice((Math.min(page,pageCount)-1)*25,Math.min(page,pageCount)*25);
  const eligible = visibleOrders.filter(order => !['shipped','delivered','cancelled'].includes(order.status));
  useEffect(() => { setPage(1); setSelectedOrders([]); }, [activeTab,searchQuery,currentBranchId]);
  const handleSelectAll = () => setSelectedOrders(eligible.every(order => selectedOrders.includes(order.id)) ? [] : eligible.map(order => order.id));
  const handleSelectOrder = (id: string) => setSelectedOrders(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous,id]);
  const handleBulkCancel = async () => {
    const ids = [...cancelTargets];
    if (!ids.length) return;
    setBulkActionLoading(true);
    try {
      const { data, error } = await supabase.from('online_orders').update({status:'cancelled',updated_at:new Date().toISOString()}).in('id',ids).in('status',['pending','confirmed','preparing','ready']).select('id');
      if (error) throw error;
      if ((data?.length || 0) !== ids.length) toast.info('بعض الطلبات اتغيّرت حالتها. راجع القائمة المحدّثة.');
      else toast.success('تم إلغاء الطلبات المحددة');
      setSelectedOrders([]); setCancelTargets([]); handleOrderUpdate();
    } catch { toast.error('تعذّر إلغاء الطلبات. حاول مرة أخرى.'); }
    finally { setBulkActionLoading(false); }
  };
  return <MainLayout>
      <div className="pos-orders">
        <header className="pos-orders-heading"><div><h1>الطلبات الإلكترونية</h1><p>تابع الطلب من أول التأكيد لحد التسليم.</p></div><div className="flex gap-2"><Button variant="outline" onClick={handleOrderUpdate} disabled={loading} aria-label="تحديث الطلبات"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></Button><Button variant="outline" aria-pressed={notificationEnabled} onClick={() => setNotificationEnabled(!notificationEnabled)}><Bell size={18} />{notificationEnabled ? 'الصوت مفعّل' : 'الصوت متوقف'}</Button></div></header>
        <OrderStats orders={orders} activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="pos-orders-toolbar"><div className="pos-orders-search"><Search size={18} /><Input aria-label="البحث في الطلبات" placeholder="اسم العميل، رقم الموبايل أو الطلب" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} /></div><p className="text-sm text-muted-foreground">{filteredOrders.length} طلب</p></div>
        {selectedOrders.length > 0 && <div className="pos-orders-selection"><span>تم تحديد {selectedOrders.length} طلب</span><Button variant="destructive" disabled={bulkActionLoading} onClick={() => setCancelTargets(selectedOrders)}>إلغاء المحدد</Button><Button variant="ghost" onClick={() => setSelectedOrders([])}>إلغاء التحديد</Button></div>}
        {ordersError ? <div role="alert" className="pos-orders-empty"><h2>تعذّر تحميل الطلبات</h2><p>البيانات الظاهرة قد تكون قديمة. جرّب التحديث.</p><Button onClick={handleOrderUpdate}>حاول تاني</Button></div> : loading && !orders.length ? <div role="status" className="pos-orders-empty">جاري تحميل الطلبات…</div> : <OrdersTable orders={visibleOrders} onShowCustomer={showCustomerProfile} onArchive={handleArchive} onCancel={order => setCancelTargets([order.id])} onProcess={handleProcess} onComplete={handleComplete} onPaymentConfirm={handlePaymentConfirm} onAssignDelivery={handleAssignDelivery} onOrderUpdate={handleOrderUpdate} onReturn={handleReturn} onPrintInvoice={handlePrintInvoice} selectedOrders={selectedOrders} onSelectOrder={handleSelectOrder} onSelectAll={handleSelectAll} />}
        {pageCount > 1 && <nav className="pos-orders-pagination" aria-label="صفحات الطلبات"><Button variant="outline" disabled={page <= 1} onClick={() => {setPage(value => value-1);setSelectedOrders([]);}}>السابق</Button><span>{Math.min(page,pageCount)} من {pageCount}</span><Button variant="outline" disabled={page >= pageCount} onClick={() => {setPage(value => value+1);setSelectedOrders([]);}}>التالي</Button></nav>}
        <AlertDialog open={cancelTargets.length > 0} onOpenChange={open => {if (!open && !bulkActionLoading) setCancelTargets([]);}}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>إلغاء {cancelTargets.length} طلب؟</AlertDialogTitle><AlertDialogDescription>الإلغاء متاح قبل الشحن. لو الطلب مدفوع، رد المبلغ يحتاج مراجعة منفصلة.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={bulkActionLoading}>رجوع</AlertDialogCancel><AlertDialogAction disabled={bulkActionLoading} onClick={event => {event.preventDefault();void handleBulkCancel();}}>{bulkActionLoading ? 'جاري الإلغاء…' : 'تأكيد الإلغاء'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        <CustomerProfileDialog customer={selectedCustomer} open={!!selectedCustomer} onOpenChange={open => !open && setSelectedCustomer(null)} />

        {currentOrderId && <>
            <PaymentConfirmationDialog open={paymentConfirmOpen} onOpenChange={setPaymentConfirmOpen} orderId={currentOrderId} onConfirm={handleOrderUpdate} />
            
            <AssignDeliveryPersonDialog open={assignDeliveryOpen} onOpenChange={setAssignDeliveryOpen} orderId={currentOrderId} onConfirm={handleOrderUpdate} />
          </>}

        {returnOrderId && returnItems.length > 0 && <ReturnOrderDialog orderId={returnOrderId} items={returnItems} open={returnDialogOpen} onOpenChange={setReturnDialogOpen} onConfirm={handleOrderUpdate} />}

        <OnlineOrderInvoiceDialog
          isOpen={invoiceDialogOpen}
          onClose={() => {
            setInvoiceDialogOpen(false);
            setSelectedOrderForInvoice(null);
          }}
          order={selectedOrderForInvoice}
        />
      </div>
    </MainLayout>;
}
