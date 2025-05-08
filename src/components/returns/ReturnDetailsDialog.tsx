
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { siteConfig } from "@/config/site";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl dir-rtl">
        <DialogHeader>
          <DialogTitle className="text-xl">تفاصيل المرتجع #{returnData.id.slice(0, 8)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
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
            <p className="font-medium">المنتجات المرتجعة</p>
            <div className="border rounded-md">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-right p-2">المنتج</th>
                    <th className="text-center p-2">الكمية</th>
                    <th className="text-center p-2">السعر</th>
                    <th className="text-center p-2">المجموع</th>
                  </tr>
                </thead>
                <tbody>
                  {returnData.items?.map((item, index) => (
                    <tr key={index} className="border-t">
                      <td className="text-right p-2">{item.product_name}</td>
                      <td className="text-center p-2">{item.quantity}</td>
                      <td className="text-center p-2">{formatCurrency(item.price)}</td>
                      <td className="text-center p-2">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
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
                  onClick={() => onStatusChange(returnData.id, 'rejected')}
                >
                  رفض الإرجاع
                </Button>
                <Button 
                  variant="default"
                  onClick={() => onStatusChange(returnData.id, 'approved')}
                >
                  قبول الإرجاع
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إغلاق
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
