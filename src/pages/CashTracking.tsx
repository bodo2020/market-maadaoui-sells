import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
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
import { RegisterType, getLatestCashBalance } from "@/services/supabase/cashTrackingService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Wallet, Plus, Minus, Download } from "lucide-react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

interface CashRecord {
  id: string;
  date: string;
  opening_balance: number;
  closing_balance: number;
  difference: number | null;
  notes: string | null;
  created_by: string;
  verified_by: string | null;
  register_type: RegisterType;
}

interface CashTransaction {
  id: string;
  transaction_date: string;
  amount: number;
  balance_after: number;
  transaction_type: 'deposit' | 'withdrawal';
  register_type: RegisterType;
  notes?: string;
  created_by?: string;
  created_by_name?: string;
  created_at?: string;
}

export default function CashTracking() {
  const { user } = useAuth();
  const [records, setRecords] = useState<CashRecord[]>([]);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [isAddCashOpen, setIsAddCashOpen] = useState(false);
  const [isWithdrawCashOpen, setIsWithdrawCashOpen] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [processingTransaction, setProcessingTransaction] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      
      console.log("Fetching cash records for register:", RegisterType.STORE);

      // Directly fetch the current balance using our improved function
      const balance = await getLatestCashBalance(RegisterType.STORE);
      console.log("Got current balance:", balance);
      setCurrentBalance(balance);
      
      // Fetch cash transactions
      const { data: transactionData, error: transactionError } = await supabase
        .from('cash_transactions')
        .select('*')
        .eq('register_type', RegisterType.STORE)
        .order('transaction_date', { ascending: false });
      
      if (transactionError) {
        console.error('Error fetching cash transactions:', transactionError);
        throw transactionError;
      }
      
      console.log("Cash transactions fetched:", transactionData);
      const tx = (transactionData as CashTransaction[]) || [];

      // Fetch user names for creators
      const creatorIds = Array.from(
        new Set(
          tx.map((t) => t.created_by).filter((id): id is string => Boolean(id))
        )
      );

      if (creatorIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id,name,username')
          .in('id', creatorIds);

        if (usersError) {
          console.error('Error fetching users for transactions:', usersError);
          setTransactions(tx);
        } else {
          const nameMap = new Map<string, string>(
            usersData?.map((u: any) => [u.id, u.name || u.username || 'غير معروف']) || []
          );
          setTransactions(
            tx.map((t) => ({
              ...t,
              created_by_name: t.created_by ? (nameMap.get(t.created_by) || 'غير معروف') : '-'
            }))
          );
        }
      } else {
        setTransactions(tx);
      }
      
      // Also fetch the cash tracking records
      const { data: cashData, error: cashError } = await supabase
        .from('cash_tracking')
        .select('*')
        .eq('register_type', RegisterType.STORE)
        .order('date', { ascending: false });
      
      if (cashError) {
        console.error('Error fetching cash records:', cashError);
        throw cashError;
      }
      
      console.log("Cash records fetched:", cashData);
      setRecords(cashData as unknown as CashRecord[]);
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
        register_type: RegisterType.STORE,
        notes: notes || "إيداع نقدي"
      });
      
      const branchId = typeof window !== 'undefined' ? localStorage.getItem('currentBranchId') : null;
      const { data, error } = await supabase.functions.invoke('add-cash-transaction', {
        body: {
          amount: parseFloat(amount),
          transaction_type: 'deposit',
          register_type: RegisterType.STORE,
          notes: notes || "إيداع نقدي",
          created_by: user?.id || undefined,
          branch_id: branchId || undefined
        }
      });

      if (error) {
        console.error("Error response from Edge Function:", error);
        throw error;
      }
      
      console.log("Edge Function response:", data);
      
      toast.success("تم إضافة المبلغ بنجاح");
      setIsAddCashOpen(false);
      setAmount("");
      setNotes("");
      fetchRecords();
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

    if (parseFloat(amount) > currentBalance) {
      toast.error("المبلغ المطلوب سحبه أكبر من الرصيد المتاح");
      return;
    }

    try {
      setProcessingTransaction(true);
      
      console.log("Withdrawing cash:", {
        amount: parseFloat(amount),
        transaction_type: 'withdrawal',
        register_type: RegisterType.STORE,
        notes: notes || "سحب نقدي"
      });
      
      const branchId = typeof window !== 'undefined' ? localStorage.getItem('currentBranchId') : null;
      const { data, error } = await supabase.functions.invoke('add-cash-transaction', {
        body: {
          amount: parseFloat(amount),
          transaction_type: 'withdrawal',
          register_type: RegisterType.STORE,
          notes: notes || "سحب نقدي",
          created_by: user?.id || undefined,
          branch_id: branchId || undefined
        }
      });

      if (error) {
        console.error("Error response from Edge Function:", error);
        throw error;
      }
      
      console.log("Edge Function response:", data);
      
      toast.success("تم سحب المبلغ بنجاح");
      setIsWithdrawCashOpen(false);
      setAmount("");
      setNotes("");
      fetchRecords();
    } catch (error) {
      console.error('Error withdrawing cash:', error);
      toast.error("حدث خطأ أثناء سحب المبلغ");
    } finally {
      setProcessingTransaction(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('المعاملات');

      worksheet.columns = [
        { header: 'التاريخ', key: 'date', width: 22 },
        { header: 'النوع', key: 'type', width: 12 },
        { header: 'المبلغ', key: 'amount', width: 14 },
        { header: 'الرصيد بعد العملية', key: 'balance_after', width: 20 },
        { header: 'المستخدم', key: 'user', width: 22 },
        { header: 'ملاحظات', key: 'notes', width: 30 },
      ];

      transactions.forEach((t) => {
        worksheet.addRow({
          date: new Date(t.transaction_date).toLocaleString('ar'),
          type: t.transaction_type === 'deposit' ? 'إيداع' : 'سحب',
          amount: Number(t.amount).toFixed(2),
          balance_after: Number(t.balance_after).toFixed(2),
          user: t.created_by_name || '-',
          notes: t.notes || '',
        });
      });

      worksheet.getRow(1).font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `سجل-المعاملات-النقدية-${new Date().toISOString().slice(0,10)}.xlsx`
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
          <h1 className="text-2xl font-bold">متابعة النقدية</h1>
          <div className="flex space-x-2 space-x-reverse">
            <Button variant="outline" onClick={handleExportExcel} disabled={exporting}>
              <Download className="ml-2 h-4 w-4" />
              تصدير Excel
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
              <CardTitle className="text-sm font-medium text-muted-foreground">الرصيد الحالي</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <Wallet className="ml-2 h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{currentBalance.toFixed(2)}</span>
                <span className="mr-1 text-sm text-muted-foreground">جنيه</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden mb-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>التاريخ</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>الرصيد بعد العملية</TableHead>
                <TableHead>المستخدم</TableHead>
                <TableHead>الملاحظات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    جاري التحميل...
                  </TableCell>
                </TableRow>
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    لا توجد معاملات نقدية حتى الآن
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{new Date(t.transaction_date).toLocaleString('ar')}</TableCell>
                    <TableCell>{t.transaction_type === 'deposit' ? 'إيداع' : 'سحب'}</TableCell>
                    <TableCell>{t.amount.toFixed(2)}</TableCell>
                    <TableCell>{t.balance_after.toFixed(2)}</TableCell>
                    <TableCell>{t.created_by_name || '-'}</TableCell>
                    <TableCell>{t.notes || '-'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>التاريخ</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الرصيد الافتتاحي</TableHead>
                <TableHead>الرصيد الختامي</TableHead>
                <TableHead>الفرق</TableHead>
                <TableHead>الملاحظات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    جاري التحميل...
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
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
                    <TableCell>{record.opening_balance.toFixed(2)}</TableCell>
                    <TableCell>{record.closing_balance.toFixed(2)}</TableCell>
                    <TableCell className={record.difference && record.difference > 0 ? 'text-green-600' : 'text-red-500'}>
                      {record.difference ? Math.abs(record.difference).toFixed(2) : '-'}
                    </TableCell>
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="amount" className="text-right">
                  المبلغ
                </Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="notes" className="text-right">
                  ملاحظات
                </Label>
                <Input
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="col-span-3"
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="withdraw-amount" className="text-right">
                  المبلغ
                </Label>
                <Input
                  id="withdraw-amount"
                  type="number"
                  min="0"
                  max={currentBalance}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="withdraw-notes" className="text-right">
                  ملاحظات
                </Label>
                <Input
                  id="withdraw-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="col-span-3"
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
      </div>
    </MainLayout>
  );
}
