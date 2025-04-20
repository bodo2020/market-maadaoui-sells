
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, XCircle, Eye, Check, X } from "lucide-react";
import { ReturnOrder, approveReturnOrder, rejectReturnOrder } from "@/services/supabase/returnOrderService";
import { toast } from "sonner";

interface ReturnOrdersTableProps {
  returnOrders: ReturnOrder[];
  onOrderUpdated: () => void;
}

export default function ReturnOrdersTable({ returnOrders, onOrderUpdated }: ReturnOrdersTableProps) {
  const [viewOrder, setViewOrder] = useState<ReturnOrder | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleViewDetails = (order: ReturnOrder) => {
    setViewOrder(order);
  };

  const handleApprove = async (orderId: string) => {
    try {
      setIsApproving(true);
      const success = await approveReturnOrder(orderId, "current-admin"); // Replace with actual admin ID
      
      if (success) {
        toast.success("تمت الموافقة على طلب الإرجاع بنجاح");
        onOrderUpdated();
        setViewOrder(null);
      } else {
        toast.error("حدث خطأ أثناء الموافقة على طلب الإرجاع");
      }
    } catch (error) {
      console.error("Error approving return order:", error);
      toast.error("حدث خطأ أثناء الموافقة على طلب الإرجاع");
    } finally {
      setIsApproving(false);
    }
  };

  const openRejectionDialog = (orderId: string) => {
    setSelectedOrderId(orderId);
    setRejectionReason("");
    setShowRejectionDialog(true);
  };

  const handleReject = async () => {
    if (!selectedOrderId) return;
    
    try {
      setIsRejecting(true);
      const success = await rejectReturnOrder(selectedOrderId, rejectionReason);
      
      if (success) {
        toast.success("تم رفض طلب الإرجاع");
        onOrderUpdated();
        setShowRejectionDialog(false);
        setViewOrder(null);
      } else {
        toast.error("حدث خطأ أثناء رفض طلب الإرجاع");
      }
    } catch (error) {
      console.error("Error rejecting return order:", error);
      toast.error("حدث خطأ أثناء رفض طلب الإرجاع");
    } finally {
      setIsRejecting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">قيد الانتظار</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">تمت الموافقة</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">مرفوض</Badge>;
      default:
        return <Badge variant="outline">غير معروف</Badge>;
    }
  };

  const getOrderTypeBadge = (type: string) => {
    switch (type) {
      case 'online':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">طلب أونلاين</Badge>;
      case 'pos':
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">نقطة بيع</Badge>;
      default:
        return <Badge variant="outline">غير معروف</Badge>;
    }
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">رقم الطلب</TableHead>
              <TableHead className="text-right">النوع</TableHead>
              <TableHead className="text-right">المرجع</TableHead>
              <TableHead className="text-right">تاريخ الطلب</TableHead>
              <TableHead className="text-right">المبلغ</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {returnOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  لا توجد طلبات إرجاع
                </TableCell>
              </TableRow>
            ) : (
              returnOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>{order.id.slice(0, 8)}</TableCell>
                  <TableCell>{getOrderTypeBadge(order.order_type)}</TableCell>
                  <TableCell>
                    {order.order_type === 'online' 
                      ? `طلب #${order.order_id?.slice(0, 8) || '-'}` 
                      : `فاتورة #${order.invoice_number || '-'}`}
                  </TableCell>
                  <TableCell>{formatDate(order.created_at)}</TableCell>
                  <TableCell>{order.total.toFixed(2)}</TableCell>
                  <TableCell>{getStatusBadge(order.status)}</TableCell>
                  <TableCell>
                    <div className="flex space-x-2 space-x-reverse">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleViewDetails(order)}
                      >
                        <Eye className="h-4 w-4 ml-1" />
                        عرض
                      </Button>
                      
                      {order.status === 'pending' && (
                        <>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-green-600"
                            onClick={() => handleApprove(order.id)}
                          >
                            <Check className="h-4 w-4 ml-1" />
                            موافقة
                          </Button>
                          
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-red-600"
                            onClick={() => openRejectionDialog(order.id)}
                          >
                            <X className="h-4 w-4 ml-1" />
                            رفض
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* View Order Details Dialog */}
      <Dialog open={!!viewOrder} onOpenChange={(open) => !open && setViewOrder(null)}>
        <DialogContent className="max-w-md sm:max-w-lg md:max-w-2xl dir-rtl">
          <DialogHeader>
            <DialogTitle>تفاصيل طلب الإرجاع #{viewOrder?.id.slice(0, 8)}</DialogTitle>
          </DialogHeader>
          
          {viewOrder && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">نوع الطلب</p>
                  <p>{viewOrder.order_type === 'online' ? 'طلب أونلاين' : 'نقطة بيع'}</p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">الحالة</p>
                  <p>{getStatusBadge(viewOrder.status)}</p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">المرجع</p>
                  <p>
                    {viewOrder.order_type === 'online' 
                      ? `طلب #${viewOrder.order_id?.slice(0, 8) || '-'}` 
                      : `فاتورة #${viewOrder.invoice_number || '-'}`}
                  </p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">تاريخ الطلب</p>
                  <p>{formatDate(viewOrder.created_at)}</p>
                </div>
                
                {(viewOrder.customer_name || viewOrder.customer_phone) && (
                  <div className="space-y-1 col-span-2">
                    <p className="text-sm font-medium text-muted-foreground">العميل</p>
                    <p>
                      {viewOrder.customer_name} 
                      {viewOrder.customer_phone && ` - ${viewOrder.customer_phone}`}
                    </p>
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">سبب الإرجاع</p>
                <div className="p-3 rounded-md bg-muted">
                  {viewOrder.reason}
                </div>
              </div>
              
              {viewOrder.status === 'rejected' && viewOrder.rejection_reason && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">سبب الرفض</p>
                  <div className="p-3 rounded-md bg-red-50 text-red-800">
                    {viewOrder.rejection_reason}
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">المنتجات</p>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">المنتج</TableHead>
                        <TableHead className="text-right">الكمية</TableHead>
                        <TableHead className="text-right">السعر</TableHead>
                        <TableHead className="text-right">الإجمالي</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewOrder.items.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>{item.product_name}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.price.toFixed(2)}</TableCell>
                          <TableCell>{item.total.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={3} className="text-left font-bold">الإجمالي</TableCell>
                        <TableCell className="font-bold">{viewOrder.total.toFixed(2)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
              
              {viewOrder.status === 'pending' && (
                <div className="flex justify-between pt-4 border-t">
                  <Button 
                    variant="outline" 
                    className="text-red-600 border-red-300 hover:bg-red-50"
                    onClick={() => openRejectionDialog(viewOrder.id)}
                  >
                    <X className="mr-1 h-4 w-4" />
                    رفض
                  </Button>
                  
                  <Button 
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleApprove(viewOrder.id)}
                    disabled={isApproving}
                  >
                    {isApproving ? (
                      <>جاري المعالجة...</>
                    ) : (
                      <>
                        <Check className="mr-1 h-4 w-4" />
                        موافقة
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rejection Reason Dialog */}
      <Dialog open={showRejectionDialog} onOpenChange={setShowRejectionDialog}>
        <DialogContent className="max-w-md dir-rtl">
          <DialogHeader>
            <DialogTitle>سبب رفض طلب الإرجاع</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                يرجى كتابة سبب رفض طلب الإرجاع
              </label>
              <Textarea
                placeholder="سبب الرفض..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              type="button" 
              onClick={handleReject} 
              disabled={isRejecting || !rejectionReason.trim()}
            >
              {isRejecting ? "جاري المعالجة..." : "تأكيد الرفض"}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setShowRejectionDialog(false)}
              disabled={isRejecting}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
