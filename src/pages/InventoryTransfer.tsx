import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, ArrowRightLeft, CheckCircle, XCircle, Clock } from 'lucide-react';
import { 
  fetchInventoryTransfers, 
  processInventoryTransfer, 
  getPendingTransfersByBranch,
  type InventoryTransfer 
} from '@/services/supabase/inventoryTransferService';
import { fetchBranches } from '@/services/supabase/branchService';
import { CreateTransferDialog } from '@/components/inventory/CreateTransferDialog';
import { TransferDetailsDialog } from '@/components/inventory/TransferDetailsDialog';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function InventoryTransfer() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTransfer, setSelectedTransfer] = useState<InventoryTransfer | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  const queryClient = useQueryClient();

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['inventory-transfers'],
    queryFn: () => fetchInventoryTransfers(),
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: fetchBranches,
  });

  const { data: pendingTransfers = [] } = useQuery({
    queryKey: ['pending-transfers'],
    queryFn: () => {
      // Get current user's branch and fetch pending transfers
      return getPendingTransfersByBranch('49c736ed-9983-4d11-9408-203e39365afb'); // Replace with dynamic branch
    },
  });

  const processTransferMutation = useMutation({
    mutationFn: ({ transferId, action }: { transferId: string; action: 'confirm' | 'complete' | 'cancel' }) =>
      processInventoryTransfer(transferId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['pending-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['branch-inventory'] });
      toast.success('تم تحديث حالة النقل بنجاح');
      setShowDetailsDialog(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'حدث خطأ أثناء تحديث حالة النقل');
    },
  });

  const handleProcessTransfer = (transferId: string, action: 'confirm' | 'complete' | 'cancel') => {
    processTransferMutation.mutate({ transferId, action });
  };

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

  const filteredTransfers = transfers.filter(transfer => {
    const matchesSearch = searchQuery === '' || 
      transfer.product?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      transfer.from_branch?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      transfer.to_branch?.name?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTab = activeTab === 'all' || transfer.status === activeTab;

    return matchesSearch && matchesTab;
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">نقل المخزون</h1>
          <p className="text-muted-foreground">إدارة نقل المنتجات بين الفروع</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          طلب نقل جديد
        </Button>
      </div>

      {/* بحث وتصفية */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="البحث في النقل..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* الطلبات المعلقة */}
      {pendingTransfers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              طلبات النقل المعلقة ({pendingTransfers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pendingTransfers.map((transfer) => (
                <Card key={transfer.id} className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => {
                        setSelectedTransfer(transfer);
                        setShowDetailsDialog(true);
                      }}>
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <h3 className="font-medium truncate">{transfer.product?.name}</h3>
                        {getStatusBadge(transfer.status)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span>{transfer.from_branch?.name}</span>
                          <ArrowRightLeft className="h-3 w-3" />
                          <span>{transfer.to_branch?.name}</span>
                        </div>
                        <div>الكمية: {transfer.quantity}</div>
                        <div>التاريخ: {format(new Date(transfer.request_date), 'dd/MM/yyyy')}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* قائمة النقل */}
      <Card>
        <CardHeader>
          <CardTitle>سجل النقل</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">الكل</TabsTrigger>
              <TabsTrigger value="pending">في الانتظار</TabsTrigger>
              <TabsTrigger value="confirmed">مؤكد</TabsTrigger>
              <TabsTrigger value="completed">مكتمل</TabsTrigger>
              <TabsTrigger value="cancelled">ملغي</TabsTrigger>
            </TabsList>
            
            <TabsContent value={activeTab} className="mt-6">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : filteredTransfers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  لا توجد عمليات نقل
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredTransfers.map((transfer) => (
                    <Card key={transfer.id} className="cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => {
                            setSelectedTransfer(transfer);
                            setShowDetailsDialog(true);
                          }}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-4">
                              <h3 className="font-medium">{transfer.product?.name}</h3>
                              {getStatusBadge(transfer.status)}
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">من:</span>
                                <span>{transfer.from_branch?.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">إلى:</span>
                                <span>{transfer.to_branch?.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">الكمية:</span>
                                <span>{transfer.quantity}</span>
                              </div>
                            </div>
                            
                            <div className="text-sm text-muted-foreground">
                              تاريخ الطلب: {format(new Date(transfer.request_date), 'dd/MM/yyyy HH:mm')}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* الحوارات */}
      <CreateTransferDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        branches={branches}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['inventory-transfers'] });
          setShowCreateDialog(false);
        }}
      />

      {selectedTransfer && (
        <TransferDetailsDialog
          open={showDetailsDialog}
          onOpenChange={setShowDetailsDialog}
          transfer={selectedTransfer}
          onProcessTransfer={handleProcessTransfer}
          isProcessing={processTransferMutation.isPending}
        />
      )}
    </div>
  );
}