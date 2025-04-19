
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
import { RegisterType, fetchCashRecords, getLatestCashBalance } from "@/services/supabase/cashTrackingService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Wallet, Plus, Minus } from "lucide-react";

interface CashRecord {
  id: string;
  date: string;
  opening_balance: number;
  closing_balance: number | null;
  difference: number | null;
  notes: string | null;
  created_by: string;
  verified_by: string | null;
  register_type: RegisterType;
}

export default function CashTracking() {
  const { user } = useAuth();
  const [records, setRecords] = useState<CashRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [isAddCashOpen, setIsAddCashOpen] = useState(false);
  const [isWithdrawCashOpen, setIsWithdrawCashOpen] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [processingTransaction, setProcessingTransaction] = useState(false);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const data = await fetchCashRecords(RegisterType.STORE);
      setRecords(data || []);
      
      // Fetch current balance
      const balance = await getLatestCashBalance(RegisterType.STORE);
      setCurrentBalance(balance);
    } catch (error) {
      console.error('Error fetching cash records:', error);
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
      
      // Use the recordCashTransaction function from cashTrackingService
      const response = await supabase.rpc('add_cash_transaction', {
        p_amount: parseFloat(amount),
        p_transaction_type: 'deposit',
        p_register_type: RegisterType.STORE,
        p_notes: notes || "إيداع نقدي"
      });

      if (response.error) throw response.error;
      
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
      
      // Use the supabase RPC function
      const response = await supabase.rpc('add_cash_transaction', {
        p_amount: parseFloat(amount),
        p_transaction_type: 'withdrawal',
        p_register_type: RegisterType.STORE,
        p_notes: notes || "سحب نقدي"
      });

      if (response.error) throw response.error;
      
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

  return (
    <MainLayout>
      <div className="container mx-auto p-6" dir="rtl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">متابعة النقدية</h1>
          <div className="flex space-x-2 space-x-reverse">
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
                    <TableCell>{record.closing_balance ? record.closing_balance.toFixed(2) : '-'}</TableCell>
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
        
        {/* Add Cash Dialog */}
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
        
        {/* Withdraw Cash Dialog */}
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
