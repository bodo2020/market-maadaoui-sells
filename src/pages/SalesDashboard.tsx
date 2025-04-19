import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import MainLayout from "@/components/layout/MainLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { Sale, CartItem } from "@/types";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Banknote, TrendingUp, ShoppingCart, ShoppingBag, ArrowDown, ArrowUp, ArrowLeftRight } from "lucide-react";
import { 
  RegisterType, 
  fetchCashRecords, 
  getLatestCashBalance, 
  transferBetweenRegisters,
  recordCashTransaction
} from "@/services/supabase/cashTrackingService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

export default function SalesDashboard() {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [withdrawalAmount, setWithdrawalAmount] = useState<string>("");
  const [withdrawalNote, setWithdrawalNote] = useState<string>("");
  const [withdrawalRegister, setWithdrawalRegister] = useState<RegisterType>(RegisterType.STORE);
  const [isWithdrawalDialogOpen, setIsWithdrawalDialogOpen] = useState(false);
  
  const [depositAmount, setDepositAmount] = useState<string>("");
  const [depositNote, setDepositNote] = useState<string>("");
  const [depositRegister, setDepositRegister] = useState<RegisterType>(RegisterType.STORE);
  const [isDepositDialogOpen, setIsDepositDialogOpen] = useState(false);
  
  const [transferAmount, setTransferAmount] = useState<string>("");
  const [transferNote, setTransferNote] = useState<string>("");
  const [fromRegister, setFromRegister] = useState<RegisterType>(RegisterType.STORE);
  const [toRegister, setToRegister] = useState<RegisterType>(RegisterType.ONLINE);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  
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
      
      // Transform the data to match the Sale type
      return (data || []).map(sale => ({
        ...sale,
        // Ensure payment_method is one of the allowed values in the Sale type
        payment_method: (sale.payment_method === 'cash' || 
                        sale.payment_method === 'card' || 
                        sale.payment_method === 'mixed') 
                        ? sale.payment_method as 'cash' | 'card' | 'mixed'
                        : 'cash', // Default to 'cash' if invalid value
        // Parse items properly
        items: Array.isArray(sale.items) 
          ? sale.items as unknown as CartItem[]  // If already an array
          : JSON.parse(typeof sale.items === 'string' ? sale.items : JSON.stringify(sale.items)) as CartItem[]
      })) as Sale[];
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
  
  // Fetch cash tracking for store register
  const { data: storeRecords = [], isLoading: isStoreRecordsLoading, refetch: refetchStoreRecords } = useQuery({
    queryKey: ['cashRecords', RegisterType.STORE, dateRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_tracking')
        .select('*')
        .eq('register_type', RegisterType.STORE)
        .gte('date', dateRange.from.toISOString().split('T')[0])
        .lte('date', dateRange.to.toISOString().split('T')[0])
        .order('date', { ascending: false });
        
      if (error) throw error;
      return data;
    }
  });
  
  // Fetch cash tracking for online register
  const { data: onlineRecords = [], isLoading: isOnlineRecordsLoading, refetch: refetchOnlineRecords } = useQuery({
    queryKey: ['cashRecords', RegisterType.ONLINE, dateRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_tracking')
        .select('*')
        .eq('register_type', RegisterType.ONLINE)
        .gte('date', dateRange.from.toISOString().split('T')[0])
        .lte('date', dateRange.to.toISOString().split('T')[0])
        .order('date', { ascending: false });
        
      if (error) throw error;
      return data;
    }
  });
  
  // Fetch transfers between registers
  const { data: transfers = [], isLoading: isTransfersLoading, refetch: refetchTransfers } = useQuery({
    queryKey: ['registerTransfers', dateRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('register_transfers')
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
  
  // Calculate total cash in each register
  const storeBalance = storeRecords.length > 0 
    ? Number(storeRecords[0].closing_balance) || Number(storeRecords[0].opening_balance) 
    : 0;
    
  const onlineBalance = onlineRecords.length > 0 
    ? Number(onlineRecords[0].closing_balance) || Number(onlineRecords[0].opening_balance) 
    : 0;
  
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
    
    try {
      await recordCashTransaction(
        Number(withdrawalAmount),
        'withdrawal',
        withdrawalRegister,
        withdrawalNote,
        user?.id || ''
      );
      
      toast.success(`تم سحب ${withdrawalAmount} بنجاح من خزنة ${withdrawalRegister === RegisterType.STORE ? 'المحل' : 'الأونلاين'}`);
      setWithdrawalAmount("");
      setWithdrawalNote("");
      setIsWithdrawalDialogOpen(false);
      
      // Refetch data
      if (withdrawalRegister === RegisterType.STORE) {
        refetchStoreRecords();
      } else {
        refetchOnlineRecords();
      }
    } catch (error: any) {
      console.error("Error processing withdrawal:", error);
      toast.error(error.message || "حدث خطأ أثناء عملية السحب");
    }
  };
  
  // Handle cash deposit
  const handleDeposit = async () => {
    if (!depositAmount || isNaN(Number(depositAmount)) || Number(depositAmount) <= 0) {
      toast.error("الرجاء إدخال مبلغ صحيح");
      return;
    }
    
    try {
      await recordCashTransaction(
        Number(depositAmount),
        'deposit',
        depositRegister,
        depositNote,
        user?.id || ''
      );
      
      toast.success(`تم إيداع ${depositAmount} بنجاح إلى خزنة ${depositRegister === RegisterType.STORE ? 'المحل' : 'الأونلاين'}`);
      setDepositAmount("");
      setDepositNote("");
      setIsDepositDialogOpen(false);
      
      // Refetch data
      if (depositRegister === RegisterType.STORE) {
        refetchStoreRecords();
      } else {
        refetchOnlineRecords();
      }
    } catch (error: any) {
      console.error("Error processing deposit:", error);
      toast.error(error.message || "حدث خطأ أثناء عملية الإيداع");
    }
  };
  
  // Handle transfer between registers
  const handleTransfer = async () => {
    if (!transferAmount || isNaN(Number(transferAmount)) || Number(transferAmount) <= 0) {
      toast.error("الرجاء إدخال مبلغ صحيح");
      return;
    }
    
    if (fromRegister === toRegister) {
      toast.error("لا يمكن التحويل إلى نفس الخزنة");
      return;
    }
    
    try {
      await transferBetweenRegisters(
        Number(transferAmount),
        fromRegister,
        toRegister,
        transferNote,
        user?.id || ''
      );
      
      toast.success(`تم تحويل ${transferAmount} بنجاح من خزنة ${fromRegister === RegisterType.STORE ? 'المحل' : 'الأونلاين'} إلى خزنة ${toRegister === RegisterType.STORE ? 'المحل' : 'الأونلاين'}`);
      setTransferAmount("");
      setTransferNote("");
      setIsTransferDialogOpen(false);
      
      // Refetch all data
      refetchStoreRecords();
      refetchOnlineRecords();
      refetchTransfers();
    } catch (error: any) {
      console.error("Error processing transfer:", error);
      toast.error(error.message || "حدث خطأ أثناء عملية التحويل");
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
              <CardTitle className="text-sm font-medium text-muted-foreground">عمليات بين الخزنات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <ArrowLeftRight className="h-5 w-5 text-amber-500 mr-2" />
                <div className="text-2xl font-bold">{transfers.length}</div>
              </div>
              <div className="mt-2">
                <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full">تحويل بين الخزنات</Button>
                  </DialogTrigger>
                  <DialogContent className="dir-rtl">
                    <DialogHeader>
                      <DialogTitle>تحويل مبلغ بين الخزنات</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="fromRegister">من خزنة</Label>
                        <Select 
                          value={fromRegister} 
                          onValueChange={(value) => setFromRegister(value as RegisterType)}
                        >
                          <SelectTrigger id="fromRegister">
                            <SelectValue placeholder="اختر الخزنة" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={RegisterType.STORE}>خزنة المحل ({storeBalance.toLocaleString('ar-EG')} ج.م)</SelectItem>
                            <SelectItem value={RegisterType.ONLINE}>خزنة الأونلاين ({onlineBalance.toLocaleString('ar-EG')} ج.م)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="toRegister">إلى خزنة</Label>
                        <Select 
                          value={toRegister} 
                          onValueChange={(value) => setToRegister(value as RegisterType)}
                        >
                          <SelectTrigger id="toRegister">
                            <SelectValue placeholder="اختر الخزنة" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={RegisterType.STORE}>خزنة المحل ({storeBalance.toLocaleString('ar-EG')} ج.م)</SelectItem>
                            <SelectItem value={RegisterType.ONLINE}>خزنة الأونلاين ({onlineBalance.toLocaleString('ar-EG')} ج.م)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="amount">المبلغ</Label>
                        <Input
                          id="amount"
                          type="number"
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          placeholder="أدخل المبلغ"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="note">ملاحظات</Label>
                        <Textarea
                          id="note"
                          value={transferNote}
                          onChange={(e) => setTransferNote(e.target.value)}
                          placeholder="سبب التحويل أو ملاحظات إضافية"
                        />
                      </div>
                      <Button onClick={handleTransfer} className="w-full">تأكيد التحويل</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Cash Register Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex justify-between items-center">
                <span>خزنة المحل</span>
                <span className="text-xl">{storeBalance.toLocaleString('ar-EG')} ج.م</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-2">
                <Dialog open={isWithdrawalDialogOpen && withdrawalRegister === RegisterType.STORE} 
                        onOpenChange={(open) => {
                          setIsWithdrawalDialogOpen(open);
                          if (open) setWithdrawalRegister(RegisterType.STORE);
                        }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="flex-1">سحب نقدي</Button>
                  </DialogTrigger>
                  <DialogContent className="dir-rtl">
                    <DialogHeader>
                      <DialogTitle>سحب نقدي من خزنة المحل</DialogTitle>
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
                
                <Dialog open={isDepositDialogOpen && depositRegister === RegisterType.STORE} 
                        onOpenChange={(open) => {
                          setIsDepositDialogOpen(open);
                          if (open) setDepositRegister(RegisterType.STORE);
                        }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="flex-1">إيداع نقدي</Button>
                  </DialogTrigger>
                  <DialogContent className="dir-rtl">
                    <DialogHeader>
                      <DialogTitle>إيداع نقدي في خزنة المحل</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="amount">المبلغ</Label>
                        <Input
                          id="amount"
                          type="number"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder="أدخل المبلغ"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="note">ملاحظات</Label>
                        <Textarea
                          id="note"
                          value={depositNote}
                          onChange={(e) => setDepositNote(e.target.value)}
                          placeholder="مصدر الإيداع أو ملاحظات إضافية"
                        />
                      </div>
                      <Button onClick={handleDeposit} className="w-full">تأكيد الإيداع</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex justify-between items-center">
                <span>خزنة الأونلاين</span>
                <span className="text-xl">{onlineBalance.toLocaleString('ar-EG')} ج.م</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-2">
                <Dialog open={isWithdrawalDialogOpen && withdrawalRegister === RegisterType.ONLINE} 
                        onOpenChange={(open) => {
                          setIsWithdrawalDialogOpen(open);
                          if (open) setWithdrawalRegister(RegisterType.ONLINE);
                        }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="flex-1">سحب نقدي</Button>
                  </DialogTrigger>
                  <DialogContent className="dir-rtl">
                    <DialogHeader>
                      <DialogTitle>سحب نقدي من خزنة الأونلاين</DialogTitle>
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
                
                <Dialog open={isDepositDialogOpen && depositRegister === RegisterType.ONLINE} 
                        onOpenChange={(open) => {
                          setIsDepositDialogOpen(open);
                          if (open) setDepositRegister(RegisterType.ONLINE);
                        }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="flex-1">إيداع نقدي</Button>
                  </DialogTrigger>
                  <DialogContent className="dir-rtl">
                    <DialogHeader>
                      <DialogTitle>إيداع نقدي في خزنة الأونلاين</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="amount">المبلغ</Label>
                        <Input
                          id="amount"
                          type="number"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder="أدخل المبلغ"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="note">ملاحظات</Label>
                        <Textarea
                          id="note"
                          value={depositNote}
                          onChange={(e) => setDepositNote(e.target.value)}
                          placeholder="مصدر الإيداع أو ملاحظات إضافية"
                        />
                      </div>
                      <Button onClick={handleDeposit} className="w-full">تأكيد الإيداع</Button>
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
          <TabsList className="grid grid-cols-4 mb-4">
            <TabsTrigger value="storeSales">مبيعات المتجر</TabsTrigger>
            <TabsTrigger value="onlineSales">المبيعات عبر الإنترنت</TabsTrigger>
            <TabsTrigger value="storeRegister">خزنة المحل</TabsTrigger>
            <TabsTrigger value="onlineRegister">خزنة الأونلاين</TabsTrigger>
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
                          <TableCell>{order.customer_id ? 'عميل' : 'غير محدد'}</TableCell>
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
          
          {/* Store Register Tab */}
          <TabsContent value="storeRegister">
            <Card>
              <CardHeader>
                <CardTitle>خزنة المحل</CardTitle>
                <CardDescription>سجل حركات النقدية لخزنة المحل خلال الفترة المحددة</CardDescription>
              </CardHeader>
              <CardContent>
                {isStoreRecordsLoading ? (
                  <div className="text-center p-4">جاري التحميل...</div>
                ) : storeRecords.length === 0 ? (
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
                      {storeRecords.map((record) => {
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
          
          {/* Online Register Tab */}
          <TabsContent value="onlineRegister">
            <Card>
              <CardHeader>
                <CardTitle>خزنة الأونلاين</CardTitle>
                <CardDescription>سجل حركات النقدية لخزنة الأونلاين خلال الفترة المحددة</CardDescription>
              </CardHeader>
              <CardContent>
                {isOnlineRecordsLoading ? (
                  <div className="text-center p-4">جاري التحميل...</div>
                ) : onlineRecords.length === 0 ? (
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
                      {onlineRecords.map((record) => {
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
