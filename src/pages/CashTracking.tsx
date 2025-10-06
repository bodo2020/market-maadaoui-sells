import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import MainLayout from "@/components/layout/MainLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RegisterType, getLatestCashBalance, recordCashTransaction, fetchCashRecords, CashRecord, recordCashTransfer } from "@/services/supabase/cashTrackingService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Wallet, Plus, Minus, Download, ArrowLeftRight, Store, Globe } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

export default function CashTracking() {
  const { user } = useAuth();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [records, setRecords] = useState<CashRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeBalance, setStoreBalance] = useState<number>(0);
  const [onlineBalance, setOnlineBalance] = useState<number>(0);
  const [isAddCashOpen, setIsAddCashOpen] = useState(false);
  const [isWithdrawCashOpen, setIsWithdrawCashOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [registerType, setRegisterType] = useState<'store' | 'online'>('store');
  const [fromRegister, setFromRegister] = useState<'store' | 'online'>('store');
  const [toRegister, setToRegister] = useState<'store' | 'online'>('online');
  const [processingTransaction, setProcessingTransaction] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      
      console.log("Fetching cash records for branch:", currentBranchId);

      // Fetch all cash tracking records
      const allRecords = await fetchCashRecords();
      
      // Filter by current branch
      const branchRecords = currentBranchId 
        ? allRecords.filter(r => r.branch_id === currentBranchId)
        : allRecords;
      
      // Fetch user names for creators
      const creatorIds = Array.from(
        new Set(
          branchRecords.map((r) => r.created_by).filter((id): id is string => Boolean(id))
        )
      );

      if (creatorIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id,name,username')
          .in('id', creatorIds);

        if (usersError) {
          console.error('Error fetching users for records:', usersError);
          setRecords(branchRecords);
        } else {
          const nameMap = new Map<string, string>(
            usersData?.map((u: any) => [u.id, u.name || u.username || 'غير معروف']) || []
          );
          setRecords(
            branchRecords.map((r) => ({
              ...r,
              created_by_name: r.created_by ? (nameMap.get(r.created_by) || 'غير معروف') : '-'
            }))
          );
        }
      } else {
        setRecords(branchRecords);
      }
      
      // Get latest balances for current branch (separate for store and online)
      const storeBal = await getLatestCashBalance(RegisterType.STORE, currentBranchId || undefined);
      const onlineBal = await getLatestCashBalance(RegisterType.ONLINE, currentBranchId || undefined);
      
      console.log("Store balance:", storeBal, "Online balance:", onlineBal);
      
      setStoreBalance(storeBal);
      setOnlineBalance(onlineBal);
      
    } catch (error) {
      console.error('Error in fetchRecords:', error);
      toast.error("حدث خطأ أثناء تحميل سجلات النقدية");
    } finally {
      setLoading(false);
    }
  };

  const handleAddCash = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("يرجى إدخال مبلغ صحيح");
      return;
    }

    try {
      setProcessingTransaction(true);
      
      console.log("Adding cash:", {
        amount: parseFloat(amount),
        transaction_type: 'deposit',
        register_type: registerType,
        notes: notes || "إيداع نقدي",
        branch_id: currentBranchId
      });
      
      if (!currentBranchId) {
        toast.error("يرجى تحديد الفرع أولاً");
        return;
      }
      
      await recordCashTransaction(
        parseFloat(amount),
        'deposit',
        registerType as RegisterType,
        notes || "إيداع نقدي",
        user?.id || '',
        currentBranchId
      );
      
      console.log("Cash transaction recorded successfully");
      
      toast.success("تم إضافة المبلغ بنجاح");
      setIsAddCashOpen(false);
      setAmount("");
      setNotes("");
      
      // Update balance and fetch all records again
      await fetchRecords();
    } catch (error) {
      console.error('Error adding cash:', error);
      toast.error("حدث خطأ أثناء إضافة المبلغ");
    } finally {
      setProcessingTransaction(false);
    }
  };

  const handleWithdrawCash = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("يرجى إدخال مبلغ صحيح");
      return;
    }

    const selectedBalance = registerType === 'store' ? storeBalance : onlineBalance;
    
    if (parseFloat(amount) > selectedBalance) {
      toast.error(`المبلغ المطلوب سحبه أكبر من الرصيد المتاح في خزنة ${registerType === 'store' ? 'المحل' : 'الأونلاين'}`);
      return;
    }

    try {
      setProcessingTransaction(true);
      
      console.log("Withdrawing cash:", {
        amount: parseFloat(amount),
        transaction_type: 'withdrawal',
        register_type: registerType,
        notes: notes || "سحب نقدي",
        branch_id: currentBranchId
      });
      
      if (!currentBranchId) {
        toast.error("يرجى تحديد الفرع أولاً");
        return;
      }
      
      await recordCashTransaction(
        parseFloat(amount),
        'withdrawal',
        registerType as RegisterType,
        notes || "سحب نقدي",
        user?.id || '',
        currentBranchId
      );
      
      console.log("Cash transaction recorded successfully");
      
      toast.success("تم سحب المبلغ بنجاح");
      setIsWithdrawCashOpen(false);
      setAmount("");
      setNotes("");
      
      // Update balance and fetch all records again
      await fetchRecords();
    } catch (error) {
      console.error('Error withdrawing cash:', error);
      toast.error("حدث خطأ أثناء سحب المبلغ");
    } finally {
      setProcessingTransaction(false);
    }
  };

  const handleTransfer = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("يرجى إدخال مبلغ صحيح");
      return;
    }

    if (fromRegister === toRegister) {
      toast.error("لا يمكن التحويل إلى نفس الخزنة");
      return;
    }

    const sourceBalance = fromRegister === 'store' ? storeBalance : onlineBalance;
    if (parseFloat(amount) > sourceBalance) {
      toast.error(`الرصيد غير كافٍ في خزنة ${fromRegister === 'store' ? 'المحل' : 'الأونلاين'}`);
      return;
    }

    try {
      setProcessingTransaction(true);
      
      if (!currentBranchId) {
        toast.error("يرجى تحديد الفرع أولاً");
        return;
      }
      
      await recordCashTransfer(
        parseFloat(amount),
        fromRegister as RegisterType,
        toRegister as RegisterType,
        notes || '',
        user?.id || '',
        currentBranchId
      );

      toast.success("تم التحويل بنجاح");
      setIsTransferOpen(false);
      setAmount("");
      setNotes("");
      setFromRegister('store');
      setToRegister('online');
      
      await fetchRecords();
    } catch (error: any) {
      console.error('Error transferring cash:', error);
      toast.error(error.message || "حدث خطأ أثناء التحويل");
    } finally {
      setProcessingTransaction(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [currentBranchId]);

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('المعاملات');

      worksheet.columns = [
        { header: 'التاريخ', key: 'date', width: 22 },
        { header: 'النوع', key: 'type', width: 12 },
        { header: 'نوع الخزنة', key: 'register_type', width: 15 },
        { header: 'الرصيد الافتتاحي', key: 'opening_balance', width: 20 },
        { header: 'الرصيد الختامي', key: 'closing_balance', width: 20 },
        { header: 'الفرق', key: 'difference', width: 14 },
        { header: 'المستخدم', key: 'user', width: 22 },
        { header: 'ملاحظات', key: 'notes', width: 30 },
      ];

      records.forEach((r) => {
        worksheet.addRow({
          date: new Date(r.date).toLocaleDateString('ar'),
          type: r.difference && r.difference > 0 ? 'إيداع' : 'سحب',
          register_type: r.register_type === 'store' ? 'المحل' : r.register_type === 'online' ? 'الأونلاين' : 'مدمج',
          opening_balance: Number(r.opening_balance).toFixed(2),
          closing_balance: Number(r.closing_balance).toFixed(2),
          difference: r.difference ? Math.abs(r.difference).toFixed(2) : '-',
          user: (r as any).created_by_name || '-',
          notes: r.notes || '',
        });
      });

      worksheet.getRow(1).font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `سجل-المعاملات-النقدية-${currentBranchName || 'جميع الفروع'}-${new Date().toISOString().slice(0,10)}.xlsx`
      );
      toast.success('تم تصدير المعاملات إلى Excel');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('تعذر تصدير الملف');
    } finally {
      setExporting(false);
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6" dir="rtl">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">متابعة النقدية</h1>
            {currentBranchName && (
              <p className="text-sm text-muted-foreground mt-1">الفرع: {currentBranchName}</p>
            )}
          </div>
          <div className="flex space-x-2 space-x-reverse">
            <Button variant="outline" onClick={handleExportExcel} disabled={exporting}>
              <Download className="ml-2 h-4 w-4" />
              تصدير Excel
            </Button>
            <Button 
              variant="outline" 
              className="mr-2" 
              onClick={() => setIsTransferOpen(true)}
            >
              <ArrowLeftRight className="ml-2 h-4 w-4" />
              تحويل بين الخزن
            </Button>
            <Button 
              variant="outline" 
              className="mr-2" 
              onClick={() => setIsWithdrawCashOpen(true)}
            >
              <Minus className="ml-2 h-4 w-4" />
              سحب نقدية
            </Button>
            <Button onClick={() => setIsAddCashOpen(true)}>
              <Plus className="ml-2 h-4 w-4" />
              إضافة نقدية
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Store className="h-4 w-4" />
                خزنة المحل
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <span className="text-2xl font-bold">{storeBalance.toFixed(2)}</span>
                <span className="mr-1 text-sm text-muted-foreground">جنيه</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                مبيعات نقطة البيع
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Globe className="h-4 w-4" />
                خزنة الأونلاين
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <span className="text-2xl font-bold">{onlineBalance.toFixed(2)}</span>
                <span className="mr-1 text-sm text-muted-foreground">جنيه</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                الطلبات الإلكترونية
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                الإجمالي
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <span className="text-2xl font-bold text-primary">{(storeBalance + onlineBalance).toFixed(2)}</span>
                <span className="mr-1 text-sm text-muted-foreground">جنيه</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                إجمالي الأرصدة
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>التاريخ</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الخزنة</TableHead>
                <TableHead>الرصيد الافتتاحي</TableHead>
                <TableHead>الرصيد الختامي</TableHead>
                <TableHead>الفرق</TableHead>
                <TableHead>المستخدم</TableHead>
                <TableHead>الملاحظات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    جاري التحميل...
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    لا توجد سجلات للنقدية حتى الآن
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{new Date(record.date).toLocaleDateString('ar')}</TableCell>
                    <TableCell>
                      {record.difference && record.difference > 0 ? 'إيداع' : 'سحب'}
                    </TableCell>
                    <TableCell>
                      {record.register_type === 'store' ? 'المحل' : 
                       record.register_type === 'online' ? 'الأونلاين' : 'مدمج'}
                    </TableCell>
                    <TableCell>{record.opening_balance.toFixed(2)}</TableCell>
                    <TableCell>{record.closing_balance.toFixed(2)}</TableCell>
                    <TableCell className={record.difference && record.difference > 0 ? 'text-green-600' : 'text-red-500'}>
                      {record.difference ? Math.abs(record.difference).toFixed(2) : '-'}
                    </TableCell>
                    <TableCell>{(record as any).created_by_name || '-'}</TableCell>
                    <TableCell>{record.notes || '-'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
        
        <Dialog open={isAddCashOpen} onOpenChange={setIsAddCashOpen}>
          <DialogContent className="sm:max-w-[425px]" dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة نقدية</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="register-type">نوع الخزنة</Label>
                <Select value={registerType} onValueChange={(value: 'store' | 'online') => setRegisterType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">خزنة المحل</SelectItem>
                    <SelectItem value="online">خزنة الأونلاين</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="amount">المبلغ</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">ملاحظات</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddCashOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" onClick={handleAddCash} disabled={processingTransaction}>
                {processingTransaction ? "جاري المعالجة..." : "إضافة"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        <Dialog open={isWithdrawCashOpen} onOpenChange={setIsWithdrawCashOpen}>
          <DialogContent className="sm:max-w-[425px]" dir="rtl">
            <DialogHeader>
              <DialogTitle>سحب نقدية</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="withdraw-register-type">نوع الخزنة</Label>
                <Select value={registerType} onValueChange={(value: 'store' | 'online') => setRegisterType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">
                      خزنة المحل (الرصيد: {storeBalance.toFixed(2)} جنيه)
                    </SelectItem>
                    <SelectItem value="online">
                      خزنة الأونلاين (الرصيد: {onlineBalance.toFixed(2)} جنيه)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="withdraw-amount">المبلغ</Label>
                <Input
                  id="withdraw-amount"
                  type="number"
                  min="0"
                  max={registerType === 'store' ? storeBalance : onlineBalance}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="withdraw-notes">ملاحظات</Label>
                <Textarea
                  id="withdraw-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsWithdrawCashOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" onClick={handleWithdrawCash} disabled={processingTransaction}>
                {processingTransaction ? "جاري المعالجة..." : "سحب"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
          <DialogContent className="sm:max-w-[500px]" dir="rtl">
            <DialogHeader>
              <DialogTitle>تحويل بين الخزن</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="from-register">من خزنة</Label>
                <Select value={fromRegister} onValueChange={(value: 'store' | 'online') => setFromRegister(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">
                      خزنة المحل (الرصيد: {storeBalance.toFixed(2)} جنيه)
                    </SelectItem>
                    <SelectItem value="online">
                      خزنة الأونلاين (الرصيد: {onlineBalance.toFixed(2)} جنيه)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="to-register">إلى خزنة</Label>
                <Select value={toRegister} onValueChange={(value: 'store' | 'online') => setToRegister(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">خزنة المحل</SelectItem>
                    <SelectItem value="online">خزنة الأونلاين</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="transfer-amount">المبلغ</Label>
                <Input
                  id="transfer-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="transfer-notes">ملاحظات</Label>
                <Textarea
                  id="transfer-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsTransferOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" onClick={handleTransfer} disabled={processingTransaction}>
                {processingTransaction ? "جاري المعالجة..." : "تحويل"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
