
import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, RotateCcw, FilterIcon, FileDown, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { siteConfig } from "@/config/site";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ReturnDetailsDialog } from "@/components/returns/ReturnDetailsDialog";
import { CreateReturnDialog } from "@/components/returns/CreateReturnDialog";

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
  customers?: { name: string };
  total_amount: number;
  reason: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  items?: ReturnItem[];
}

export default function Returns() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedReturn, setSelectedReturn] = useState<Return | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [returnsRefreshKey, setReturnsRefreshKey] = useState(0);

  // Fetch returns data
  const { data: returns, isLoading } = useQuery({
    queryKey: ['returns', returnsRefreshKey],
    queryFn: async () => {
      try {
        const { data: returnsData, error: returnsError } = await supabase
          .from('returns')
          .select(`
            *,
            customers (name),
            return_items (
              id,
              product_id,
              quantity,
              price,
              total,
              reason
            )
          `)
          .order('created_at', { ascending: false });
        
        if (returnsError) throw returnsError;
        
        // Fetch product names for each return item
        const returnsWithProductNames = await Promise.all(
          (returnsData || []).map(async (returnItem: any) => {
            const items = await Promise.all(
              (returnItem.return_items || []).map(async (item: any) => {
                const { data: productData } = await supabase
                  .from('products')
                  .select('name')
                  .eq('id', item.product_id)
                  .single();
                
                return {
                  ...item,
                  product_name: productData?.name || 'منتج غير معروف'
                };
              })
            );
            
            // Add customer_name property derived from customers.name, direct customer_name field, or default value
            const customer_name = returnItem.customer_name || returnItem.customers?.name || 'غير معروف';
            
            return {
              ...returnItem,
              customer_name,
              items
            };
          })
        );
        
        return returnsWithProductNames;
      } catch (error) {
        console.error("Error fetching returns:", error);
        toast.error("حدث خطأ أثناء تحميل بيانات المرتجعات");
        return [];
      }
    }
  });
  
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
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount: number): string => {
    return `${siteConfig.currency} ${amount.toLocaleString('ar-EG', {
      maximumFractionDigits: 2
    })}`;
  };
  
  const handleViewDetails = (returnData: Return) => {
    // Ensure returnData has customer_name property
    const enhancedReturnData = {
      ...returnData,
      customer_name: returnData.customers?.name || 'غير معروف' 
    };
    
    setSelectedReturn(enhancedReturnData);
    setDetailsDialogOpen(true);
  };
  
  const handleApproveReturn = async (returnId: string) => {
    try {
      // جلب بيانات المرتجع وعناصره
      const { data: returnData, error: returnFetchError } = await supabase
        .from('returns')
        .select(`
          *,
          return_items (
            product_id,
            quantity
          )
        `)
        .eq('id', returnId)
        .single();
        
      if (returnFetchError) throw returnFetchError;
      
      // تحديث حالة المرتجع إلى مقبول
      const { error } = await supabase
        .from('returns')
        .update({ status: 'approved' })
        .eq('id', returnId);
        
      if (error) throw error;
      
      // تحديث المخزون - الحصول على أول فرع متاح
      const { data: branchData, error: branchFetchError } = await supabase
        .from('branches')
        .select('id')
        .eq('active', true)
        .limit(1)
        .single();

      if (branchFetchError || !branchData?.id) {
        console.error('Error fetching branch:', branchFetchError);
        toast.success('تم قبول المرتجع (لا يوجد فرع متاح لتحديث المخزون)');
        setReturnsRefreshKey(prev => prev + 1);
        return;
      }

      const branchId = branchData.id;
      
      // تحديث المخزون لكل منتج مرتجع
      for (const item of returnData.return_items) {
        try {
          // جلب الكمية الحالية
          const { data: currentInventory } = await supabase
            .from('branch_inventory')
            .select('quantity')
            .eq('product_id', item.product_id)
            .eq('branch_id', branchId)
            .maybeSingle();

          const currentQuantity = currentInventory?.quantity || 0;
          const newQuantity = currentQuantity + item.quantity;

          // استخدام upsert لتجنب مشاكل التكرار
          const { error: inventoryError } = await supabase
            .from('branch_inventory')
            .upsert({
              product_id: item.product_id,
              branch_id: branchId,
              quantity: newQuantity,
              min_stock_level: 5,
              max_stock_level: 100,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'product_id,branch_id',
              ignoreDuplicates: false
            });
            
          if (inventoryError) {
            console.error(`فشل في تحديث مخزون المنتج ${item.product_id}:`, inventoryError);
            continue;
          }
          
          console.log(`تم تحديث مخزون المنتج ${item.product_id} بنجاح`);
        } catch (error) {
          console.error(`فشل في تحديث مخزون المنتج ${item.product_id}:`, error);
          continue;
        }
      }
      
      // إضافة معاملة نقدية لخصم مبلغ الإرجاع من الخزنة
      try {
        const { error: cashError } = await supabase.rpc('add_cash_transaction', {
          p_amount: returnData.total_amount,
          p_transaction_type: 'withdrawal',
          p_register_type: 'store',
          p_notes: `إرجاع طلب رقم ${returnData.id}`
        });

        if (cashError) {
          console.error('Error adding cash transaction:', cashError);
          toast.error('تم قبول الإرجاع وتحديث المخزون لكن فشل تسجيل المعاملة النقدية');
        }
      } catch (error) {
        console.error('Error processing cash transaction:', error);
        toast.error('تم قبول الإرجاع وتحديث المخزون لكن فشل تسجيل المعاملة النقدية');
      }
      
      setReturnsRefreshKey(prev => prev + 1);
      toast.success("تم قبول طلب الإرجاع وتحديث المخزون وخصم المبلغ من الخزنة بنجاح");
    } catch (error) {
      console.error("Error approving return:", error);
      toast.error("حدث خطأ أثناء قبول طلب الإرجاع");
    }
  };
  
  const handleRejectReturn = async (returnId: string) => {
    try {
      const { error } = await supabase
        .from('returns')
        .update({ status: 'rejected' })
        .eq('id', returnId);
        
      if (error) throw error;
      
      setReturnsRefreshKey(prev => prev + 1);
      toast.success("تم رفض طلب الإرجاع");
    } catch (error) {
      console.error("Error rejecting return:", error);
      toast.error("حدث خطأ أثناء رفض طلب الإرجاع");
    }
  };
  
  // Filter returns by search query and status
  const filteredReturns = returns?.filter(returnItem => {
    const matchesSearch = 
      searchQuery === "" || 
      returnItem.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (returnItem.order_id?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      (returnItem.customer_name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      (returnItem.reason?.toLowerCase() || "").includes(searchQuery.toLowerCase());
      
    const matchesStatus = 
      statusFilter === "all" || 
      returnItem.status === statusFilter;
      
    return matchesSearch && matchesStatus;
  });

  return (
    <MainLayout>
      <div className="container mx-auto p-6 dir-rtl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">إدارة المرتجعات</h1>
          <div className="flex gap-2">
            <Button variant="default" size="sm" className="flex items-center gap-1" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              إضافة مرتجع جديد
            </Button>
            <Button variant="outline" size="sm" className="flex items-center gap-1">
              <FileDown className="h-4 w-4" />
              تصدير التقرير
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">إجمالي المرتجعات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(returns?.reduce((sum, item) => sum + (item.total_amount || 0), 0) || 0)}
              </div>
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                <RotateCcw className="h-3 w-3 ml-1" />
                <span>قيمة كل المرتجعات</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">عدد المرتجعات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {returns?.length || 0}
              </div>
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                <RotateCcw className="h-3 w-3 ml-1" />
                <span>عدد عمليات الإرجاع</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">متوسط قيمة المرتجع</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(
                  returns && returns.length > 0
                    ? returns.reduce((sum, item) => sum + (item.total_amount || 0), 0) / returns.length
                    : 0
                )}
              </div>
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                <RotateCcw className="h-3 w-3 ml-1" />
                <span>متوسط قيمة عمليات الإرجاع</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-4 items-start md:items-center">
          <div className="relative w-full md:w-auto flex-1">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="البحث في المرتجعات..."
              className="pl-10 pr-10"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <FilterIcon className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="فلتر الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="pending">في الانتظار</SelectItem>
                <SelectItem value="approved">مقبول</SelectItem>
                <SelectItem value="rejected">مرفوض</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle>قائمة المرتجعات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : filteredReturns?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                لا توجد مرتجعات لعرضها
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>رقم المرتجع</TableHead>
                      <TableHead>الطلب</TableHead>
                      <TableHead>العميل</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>المبلغ</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReturns?.map((returnItem) => (
                      <TableRow key={returnItem.id}>
                        <TableCell className="font-medium">{returnItem.id.slice(0, 8)}</TableCell>
                        <TableCell>{returnItem.order_id ? returnItem.order_id.slice(0, 8) : '-'}</TableCell>
                        <TableCell>{returnItem.customer_name || returnItem.customers?.name || 'غير معروف'}</TableCell>
                        <TableCell dir="ltr" className="text-right">{formatDate(returnItem.created_at)}</TableCell>
                        <TableCell>{formatCurrency(returnItem.total_amount)}</TableCell>
                        <TableCell>
                          <Badge className={getStatusBadgeColor(returnItem.status)} variant="outline">
                            {returnItem.status === 'pending' && 'في الانتظار'}
                            {returnItem.status === 'approved' && 'تم القبول'}
                            {returnItem.status === 'rejected' && 'مرفوض'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleViewDetails(returnItem)}
                            >
                              التفاصيل
                            </Button>
                            {returnItem.status === 'pending' && (
                              <>
                                <Button 
                                  variant="default" 
                                  size="sm"
                                  onClick={() => handleApproveReturn(returnItem.id)}
                                >
                                  قبول
                                </Button>
                                <Button 
                                  variant="destructive" 
                                  size="sm"
                                  onClick={() => handleRejectReturn(returnItem.id)}
                                >
                                  رفض
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
          </CardContent>
        </Card>
        
        {selectedReturn && (
          <ReturnDetailsDialog
            returnData={selectedReturn}
            open={detailsDialogOpen}
            onOpenChange={setDetailsDialogOpen}
            onStatusChange={(returnId, newStatus) => {
              if (newStatus === 'approved') {
                handleApproveReturn(returnId);
              } else if (newStatus === 'rejected') {
                handleRejectReturn(returnId);
              }
              setDetailsDialogOpen(false);
            }}
          />
        )}
        
        <CreateReturnDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSuccess={() => {
            setReturnsRefreshKey(prev => prev + 1);
          }}
        />
      </div>
    </MainLayout>
  );
}
