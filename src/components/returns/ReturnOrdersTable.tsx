
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Eye, Calendar, Loader2 } from "lucide-react";
import { ReturnOrder, approveReturnOrder, rejectReturnOrder } from "@/services/supabase/returnOrderService";
import { formatDistanceToNow } from "date-fns";
import { arEG } from "date-fns/locale";
import { toast } from "sonner";

interface ReturnOrdersTableProps {
  returnOrders: ReturnOrder[];
  onOrderUpdated?: () => void;
}

export default function ReturnOrdersTable({ returnOrders, onOrderUpdated }: ReturnOrdersTableProps) {
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ReturnOrder | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleViewDetails = (order: ReturnOrder) => {
    setSelectedOrder(order);
    setViewDialogOpen(true);
  };

  const handleApproveOrder = async (orderId: string) => {
    try {
      setIsProcessing(true);
      await approveReturnOrder(orderId, "current-user", true);
      if (onOrderUpdated) onOrderUpdated();
    } catch (error) {
      console.error("Error approving return order:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenRejectDialog = (order: ReturnOrder) => {
    setSelectedOrder(order);
    setRejectionReason("");
    setRejectDialogOpen(true);
  };

  const handleRejectOrder = async () => {
    if (!selectedOrder || !rejectionReason.trim()) {
      toast.error("يرجى كتابة سبب الرفض");
      return;
    }

    try {
      setIsProcessing(true);
      await rejectReturnOrder(selectedOrder.id, "current-user", rejectionReason);
      setRejectDialogOpen(false);
      if (onOrderUpdated) onOrderUpdated();
    } catch (error) {
      console.error("Error rejecting return order:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: ReturnOrder["status"]) => {
    switch (status) {
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800 border-none">قيد الانتظار</Badge>;
      case "approved":
        return <Badge className="bg-green-100 text-green-800 border-none">تمت الموافقة</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800 border-none">مرفوض</Badge>;
      default:
        return <Badge>غير معروف</Badge>;
    }
  };

  const getOrderTypeLabel = (type: 'online' | 'pos') => {
    return type === 'online' ? 'طلب أونلاين' : 'نقطة بيع';
  };

  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { 
        addSuffix: true,
        locale: arEG
      });
    } catch (error) {
      return dateString;
    }
  };

  return (
    <>
      {returnOrders.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          لا توجد طلبات مرتجعات
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الرقم</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>نوع الطلب</TableHead>
                <TableHead>رقم الفاتورة</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returnOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-1 space-x-reverse">
                      <Calendar className="h-4 w-4 ml-1" />
                      {formatDate(order.created_at)}
                    </div>
                  </TableCell>
                  <TableCell>{getOrderTypeLabel(order.order_type)}</TableCell>
                  <TableCell>{order.invoice_number || "—"}</TableCell>
                  <TableCell>{order.customer_name || "غير معروف"}</TableCell>
                  <TableCell>{order.total.toFixed(2)}</TableCell>
                  <TableCell>{getStatusBadge(order.status)}</TableCell>
                  <TableCell>
                    <div className="flex space-x-2 space-x-reverse">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDetails(order)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      
                      {order.status === "pending" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => handleApproveOrder(order.id)}
                            disabled={isProcessing}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleOpenRejectDialog(order)}
                            disabled={isProcessing}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* View Details Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل طلب الإرجاع</DialogTitle>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="font-medium">رقم الطلب:</p>
                  <p>{selectedOrder.id}</p>
                </div>
                
                <div className="space-y-2">
                  <p className="font-medium">التاريخ:</p>
                  <p>{new Date(selectedOrder.created_at).toLocaleDateString('ar-EG')}</p>
                </div>
                
                <div className="space-y-2">
                  <p className="font-medium">نوع الطلب:</p>
                  <p>{getOrderTypeLabel(selectedOrder.order_type)}</p>
                </div>
                
                <div className="space-y-2">
                  <p className="font-medium">رقم الفاتورة:</p>
                  <p>{selectedOrder.invoice_number || "—"}</p>
                </div>
                
                <div className="space-y-2">
                  <p className="font-medium">العميل:</p>
                  <p>{selectedOrder.customer_name || "غير معروف"}</p>
                </div>
                
                <div className="space-y-2">
                  <p className="font-medium">رقم الهاتف:</p>
                  <p>{selectedOrder.customer_phone || "—"}</p>
                </div>
                
                <div className="space-y-2">
                  <p className="font-medium">المبلغ:</p>
                  <p>{selectedOrder.total.toFixed(2)}</p>
                </div>
                
                <div className="space-y-2">
                  <p className="font-medium">الحالة:</p>
                  <div>{getStatusBadge(selectedOrder.status)}</div>
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="font-medium">سبب الإرجاع:</p>
                <div className="bg-muted p-3 rounded-md">{selectedOrder.reason}</div>
              </div>
              
              {selectedOrder.status === "rejected" && selectedOrder.rejection_reason && (
                <div className="space-y-2">
                  <p className="font-medium">سبب الرفض:</p>
                  <div className="bg-red-50 p-3 rounded-md text-red-700">
                    {selectedOrder.rejection_reason}
                  </div>
                </div>
              )}
              
              <div className="space-y-3">
                <p className="font-medium">المنتجات:</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>اسم المنتج</TableHead>
                      <TableHead>السعر</TableHead>
                      <TableHead>الكمية</TableHead>
                      <TableHead>الإجمالي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.product_name}</TableCell>
                        <TableCell>{item.price.toFixed(2)}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{item.total.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفض طلب الإرجاع</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rejectionReason">سبب الرفض</Label>
              <Textarea
                id="rejectionReason"
                placeholder="يرجى كتابة سبب رفض طلب الإرجاع..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="destructive" 
              onClick={handleRejectOrder}
              disabled={isProcessing || !rejectionReason.trim()}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري المعالجة...
                </>
              ) : (
                'رفض الطلب'
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setRejectDialogOpen(false)}
              disabled={isProcessing}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
