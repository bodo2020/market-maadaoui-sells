
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import MainLayout from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { toast } from "sonner";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Sale } from "@/types";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Banknote, TrendingUp, ShoppingCart, ShoppingBag, ArrowDown, ArrowUp } from "lucide-react";

export default function SalesDashboard() {
  const [dateRange, setDateRange] = useState({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [withdrawalAmount, setWithdrawalAmount] = useState<string>("");
  const [withdrawalNote, setWithdrawalNote] = useState<string>("");
  const [isWithdrawalDialogOpen, setIsWithdrawalDialogOpen] = useState(false);
  
  // Fetch store sales
  const { data: storeSales = [], isLoading: isStoreSalesLoading } = useQuery({
    queryKey: ['sales', dateRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .gte('date', dateRange.from.toISOString())
        .lte('date', dateRange.to.toISOString())
        .order('date', { ascending: false });
        
      if (error) throw error;
      return data as Sale[];
    }
  });
  
  // Fetch online orders
  const { data: onlineOrders = [], isLoading: isOnlineOrdersLoading } = useQuery({
    queryKey: ['onlineOrders', dateRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('online_orders')
        .select('*')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString())
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      return data;
    }
  });
  
  // Fetch cash tracking
  const { data: cashRecords = [], isLoading: isCashRecordsLoading, refetch: refetchCashRecords } = useQuery({
    queryKey: ['cashRecords', dateRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_tracking')
        .select('*')
        .gte('date', dateRange.from.toISOString().split('T')[0])
        .lte('date', dateRange.to.toISOString().split('T')[0])
        .order('date', { ascending: false });
        
      if (error) throw error;
      return data;
    }
  });

  // Calculate total sales
  const storeSalesTotal = storeSales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const onlineOrdersTotal = onlineOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const totalSales = storeSalesTotal + onlineOrdersTotal;
  
  // Calculate total cash in hand
  const latestCashRecord = cashRecords[0];
  const cashInHand = latestCashRecord ? Number(latestCashRecord.closing_balance) || Number(latestCashRecord.opening_balance) : 0;
  
  // Prepare chart data
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), i);
    return {
      date: format(date, 'MM/dd'),
      storeSales: storeSales
        .filter(sale => new Date(sale.date).toDateString() === date.toDateString())
        .reduce((sum, sale) => sum + Number(sale.total), 0),
      onlineSales: onlineOrders
        .filter(order => new Date(order.created_at).toDateString() === date.toDateString())
        .reduce((sum, order) => sum + Number(order.total), 0)
    };
  }).reverse();
  
  // Handle cash withdrawal
  const handleWithdrawal = async () => {
    if (!withdrawalAmount || isNaN(Number(withdrawalAmount)) || Number(withdrawalAmount) <= 0) {
      toast.error("الرجاء إدخال مبلغ صحيح");
      return;
    }
    
    if (Number(withdrawalAmount) > cashInHand) {
      toast.error("المبلغ المطلوب سحبه أكبر من المبلغ المتوفر");
      return;
    }
    
    try {
      const newBalance = cashInHand - Number(withdrawalAmount);
      
      // Create a new cash tracking record for the withdrawal
      const { error } = await supabase
        .from('cash_tracking')
        .insert([{
          date: new Date().toISOString().split('T')[0],
          opening_balance: cashInHand,
          closing_balance: newBalance,
          difference: -Number(withdrawalAmount),
          notes: `سحب نقدي: ${withdrawalNote}`,
          created_by: (await supabase.auth.getUser()).data.user?.id
        }]);
        
      if (error) throw error;
      
      toast.success(`تم سحب ${withdrawalAmount} بنجاح`);
      setWithdrawalAmount("");
      setWithdrawalNote("");
      setIsWithdrawalDialogOpen(false);
      refetchCashRecords();
    } catch (error) {
      console.error("Error processing withdrawal:", error);
      toast.error("حدث خطأ أثناء عملية السحب");
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6 dir-rtl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">لوحة المبيعات والخزينة</h1>
          <DateRangePicker
            from={dateRange.from}
            to={dateRange.to}
            onSelect={(range) => {
              if (range?.from && range?.to) {
                setDateRange({ from: range.from, to: range.to });
              }
            }}
          />
        </div>
        
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي المبيعات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <TrendingUp className="h-5 w-5 text-green-500 mr-2" />
                <div className="text-2xl font-bold">{totalSales.toLocaleString('ar-EG')} ج.م</div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">خلال الفترة المحددة</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">مبيعات المتجر</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <ShoppingCart className="h-5 w-5 text-blue-500 mr-2" />
                <div className="text-2xl font-bold">{storeSalesTotal.toLocaleString('ar-EG')} ج.م</div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{storeSales.length} طلب</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">مبيعات الإنترنت</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <ShoppingBag className="h-5 w-5 text-purple-500 mr-2" />
                <div className="text-2xl font-bold">{onlineOrdersTotal.toLocaleString('ar-EG')} ج.م</div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{onlineOrders.length} طلب</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">النقد في الخزينة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <Banknote className="h-5 w-5 text-amber-500 mr-2" />
                <div className="text-2xl font-bold">{cashInHand.toLocaleString('ar-EG')} ج.م</div>
              </div>
              <div className="mt-2">
                <Dialog open={isWithdrawalDialogOpen} onOpenChange={setIsWithdrawalDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full">سحب نقدي</Button>
                  </DialogTrigger>
                  <DialogContent className="dir-rtl">
                    <DialogHeader>
                      <DialogTitle>سحب نقدي من الخزينة</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="amount">المبلغ</Label>
                        <Input
                          id="amount"
                          type="number"
                          value={withdrawalAmount}
                          onChange={(e) => setWithdrawalAmount(e.target.value)}
                          placeholder="أدخل المبلغ"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="note">ملاحظات</Label>
                        <Textarea
                          id="note"
                          value={withdrawalNote}
                          onChange={(e) => setWithdrawalNote(e.target.value)}
                          placeholder="سبب السحب أو ملاحظات إضافية"
                        />
                      </div>
                      <Button onClick={handleWithdrawal} className="w-full">تأكيد السحب</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Sales Chart */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>تحليل المبيعات</CardTitle>
            <CardDescription>مقارنة بين مبيعات المتجر والمبيعات عبر الإنترنت خلال الأيام السابقة</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={last7Days}
                margin={{
                  top: 5,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="storeSales" name="مبيعات المتجر" fill="#3b82f6" />
                <Bar dataKey="onlineSales" name="مبيعات الإنترنت" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        {/* Sales and Cash Tracking Tabs */}
        <Tabs defaultValue="storeSales" className="w-full">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="storeSales">مبيعات المتجر</TabsTrigger>
            <TabsTrigger value="onlineSales">المبيعات عبر الإنترنت</TabsTrigger>
            <TabsTrigger value="cashTracking">متابعة النقدية</TabsTrigger>
          </TabsList>
          
          {/* Store Sales Tab */}
          <TabsContent value="storeSales">
            <Card>
              <CardHeader>
                <CardTitle>مبيعات المتجر</CardTitle>
                <CardDescription>قائمة المبيعات في المتجر خلال الفترة المحددة</CardDescription>
              </CardHeader>
              <CardContent>
                {isStoreSalesLoading ? (
                  <div className="text-center p-4">جاري التحميل...</div>
                ) : storeSales.length === 0 ? (
                  <div className="text-center p-4">لا توجد مبيعات في هذه الفترة</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الرقم</TableHead>
                        <TableHead>التاريخ</TableHead>
                        <TableHead>العميل</TableHead>
                        <TableHead>طريقة الدفع</TableHead>
                        <TableHead>المبلغ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {storeSales.map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell>{sale.invoice_number}</TableCell>
                          <TableCell>{new Date(sale.date).toLocaleDateString('ar-EG')}</TableCell>
                          <TableCell>{sale.customer_name || 'غير محدد'}</TableCell>
                          <TableCell>
                            {sale.payment_method === 'cash' ? 'نقدي' : 
                             sale.payment_method === 'card' ? 'بطاقة' : 'مختلط'}
                          </TableCell>
                          <TableCell>{Number(sale.total).toLocaleString('ar-EG')} ج.م</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Online Sales Tab */}
          <TabsContent value="onlineSales">
            <Card>
              <CardHeader>
                <CardTitle>المبيعات عبر الإنترنت</CardTitle>
                <CardDescription>قائمة المبيعات عبر الإنترنت خلال الفترة المحددة</CardDescription>
              </CardHeader>
              <CardContent>
                {isOnlineOrdersLoading ? (
                  <div className="text-center p-4">جاري التحميل...</div>
                ) : onlineOrders.length === 0 ? (
                  <div className="text-center p-4">لا توجد مبيعات في هذه الفترة</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الرقم</TableHead>
                        <TableHead>التاريخ</TableHead>
                        <TableHead>العميل</TableHead>
                        <TableHead>حالة الطلب</TableHead>
                        <TableHead>حالة الدفع</TableHead>
                        <TableHead>المبلغ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {onlineOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell>{order.id.substring(0, 8)}</TableCell>
                          <TableCell>{new Date(order.created_at).toLocaleDateString('ar-EG')}</TableCell>
                          <TableCell>{order.customer_name || 'غير محدد'}</TableCell>
                          <TableCell>
                            {order.status === 'waiting' ? 'في الانتظار' :
                             order.status === 'ready' ? 'جاهز' :
                             order.status === 'shipped' ? 'تم الشحن' : 'تم التسليم'}
                          </TableCell>
                          <TableCell>
                            {order.payment_status === 'paid' ? 'تم الدفع' :
                             order.payment_status === 'pending' ? 'في انتظار الدفع' :
                             order.payment_status === 'failed' ? 'فشل الدفع' : 'تم الاسترجاع'}
                          </TableCell>
                          <TableCell>{Number(order.total).toLocaleString('ar-EG')} ج.م</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Cash Tracking Tab */}
          <TabsContent value="cashTracking">
            <Card>
              <CardHeader>
                <CardTitle>متابعة النقدية</CardTitle>
                <CardDescription>سجل حركات النقدية خلال الفترة المحددة</CardDescription>
              </CardHeader>
              <CardContent>
                {isCashRecordsLoading ? (
                  <div className="text-center p-4">جاري التحميل...</div>
                ) : cashRecords.length === 0 ? (
                  <div className="text-center p-4">لا توجد حركات نقدية في هذه الفترة</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>التاريخ</TableHead>
                        <TableHead>الرصيد الافتتاحي</TableHead>
                        <TableHead>الرصيد الختامي</TableHead>
                        <TableHead>الفرق</TableHead>
                        <TableHead>ملاحظات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cashRecords.map((record) => {
                        const difference = record.difference || 0;
                        return (
                          <TableRow key={record.id}>
                            <TableCell>{new Date(record.date).toLocaleDateString('ar-EG')}</TableCell>
                            <TableCell>{Number(record.opening_balance).toLocaleString('ar-EG')} ج.م</TableCell>
                            <TableCell>{record.closing_balance ? 
                              Number(record.closing_balance).toLocaleString('ar-EG') + ' ج.م' : '-'}</TableCell>
                            <TableCell>
                              <div className={`flex items-center ${difference > 0 ? 'text-green-600' : difference < 0 ? 'text-red-600' : ''}`}>
                                {difference !== 0 && (difference > 0 ? 
                                  <ArrowUp className="w-4 h-4 mr-1" /> : 
                                  <ArrowDown className="w-4 h-4 mr-1" />)}
                                {Math.abs(Number(difference)).toLocaleString('ar-EG')} ج.م
                              </div>
                            </TableCell>
                            <TableCell>{record.notes || '-'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
