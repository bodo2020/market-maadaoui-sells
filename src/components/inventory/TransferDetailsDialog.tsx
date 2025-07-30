import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ArrowRightLeft, CheckCircle, XCircle, Clock, User, Calendar } from 'lucide-react';
import { type InventoryTransfer } from '@/services/supabase/inventoryTransferService';
import { format } from 'date-fns';

interface TransferDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transfer: InventoryTransfer;
  onProcessTransfer: (transferId: string, action: 'confirm' | 'complete' | 'cancel') => void;
  isProcessing: boolean;
}

export function TransferDetailsDialog({
  open,
  onOpenChange,
  transfer,
  onProcessTransfer,
  isProcessing,
}: TransferDetailsDialogProps) {
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { label: 'في الانتظار', variant: 'secondary' as const, icon: Clock },
      confirmed: { label: 'مؤكد', variant: 'default' as const, icon: CheckCircle },
      completed: { label: 'مكتمل', variant: 'default' as const, icon: CheckCircle },
      cancelled: { label: 'ملغي', variant: 'destructive' as const, icon: XCircle },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const canConfirm = transfer.status === 'pending';
  const canComplete = transfer.status === 'confirmed';
  const canCancel = transfer.status === 'pending' || transfer.status === 'confirmed';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            تفاصيل طلب النقل
            {getStatusBadge(transfer.status)}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* معلومات المنتج */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                {transfer.product?.image_urls && transfer.product.image_urls[0] && (
                  <img
                    src={transfer.product.image_urls[0]}
                    alt={transfer.product.name}
                    className="h-16 w-16 object-cover rounded-lg"
                  />
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{transfer.product?.name}</h3>
                  {transfer.product?.barcode && (
                    <p className="text-sm text-muted-foreground">
                      الباركود: {transfer.product.barcode}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-2xl font-bold text-primary">
                      {transfer.quantity}
                    </span>
                    <span className="text-muted-foreground">قطعة</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* تفاصيل النقل */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold">تفاصيل النقل</h4>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{format(new Date(transfer.request_date), 'dd/MM/yyyy HH:mm')}</span>
                </div>
              </div>
              
              <div className="flex items-center justify-center gap-4 py-4">
                <div className="text-center">
                  <div className="font-semibold">{transfer.from_branch?.name}</div>
                  <div className="text-sm text-muted-foreground">الفرع المرسل</div>
                </div>
                <ArrowRightLeft className="h-6 w-6 text-primary" />
                <div className="text-center">
                  <div className="font-semibold">{transfer.to_branch?.name}</div>
                  <div className="text-sm text-muted-foreground">الفرع المستقبل</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* تفاصيل إضافية */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  طلب بواسطة: {transfer.requested_user?.name || 'غير محدد'}
                </span>
              </div>

              {transfer.confirmed_date && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm">
                    تم التأكيد في: {format(new Date(transfer.confirmed_date), 'dd/MM/yyyy HH:mm')}
                  </span>
                </div>
              )}

              {transfer.completed_date && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  <span className="text-sm">
                    تم الإكمال في: {format(new Date(transfer.completed_date), 'dd/MM/yyyy HH:mm')}
                  </span>
                </div>
              )}

              {transfer.notes && (
                <>
                  <Separator />
                  <div>
                    <h5 className="font-medium mb-2">الملاحظات:</h5>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                      {transfer.notes}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* أزرار العمليات */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إغلاق
            </Button>
            
            {canCancel && (
              <Button
                variant="destructive"
                onClick={() => onProcessTransfer(transfer.id, 'cancel')}
                disabled={isProcessing}
              >
                إلغاء النقل
              </Button>
            )}
            
            {canConfirm && (
              <Button
                onClick={() => onProcessTransfer(transfer.id, 'confirm')}
                disabled={isProcessing}
              >
                تأكيد النقل
              </Button>
            )}
            
            {canComplete && (
              <Button
                onClick={() => onProcessTransfer(transfer.id, 'complete')}
                disabled={isProcessing}
              >
                إكمال النقل
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}