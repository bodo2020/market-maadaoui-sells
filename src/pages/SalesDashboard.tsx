
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import MainLayout from "@/components/layout/MainLayout";
import { 
  getCurrentCashBalance, 
  createCashTransaction, 
  fetchCashTransactions 
} from "@/services/supabase/cashTransactionService";
import { 
  createSpecialOffer, 
  fetchSpecialOffers 
} from "@/services/supabase/offersService";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Plus, RefreshCw } from "lucide-react";

export default function SalesDashboard() {
  const queryClient = useQueryClient();
  const [isAddCashDialogOpen, setIsAddCashDialogOpen] = useState(false);
  const [isAddOfferDialogOpen, setIsAddOfferDialogOpen] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const [offerData, setOfferData] = useState({
    name: "",
    code: "",
    discount_type: "percentage",
    discount_value: ""
  });

  // Fetch cash balance
  const { data: cashBalance, isLoading: balanceLoading } = useQuery({
    queryKey: ['cashBalance'],
    queryFn: () => getCurrentCashBalance('store')
  });

  // Fetch cash transactions
  const { data: cashTransactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['cashTransactions'],
    queryFn: () => fetchCashTransactions('store')
  });

  // Fetch special offers
  const { data: specialOffers, isLoading: offersLoading } = useQuery({
    queryKey: ['specialOffers'],
    queryFn: fetchSpecialOffers
  });

  // Mutation for adding cash transaction
  const addCashTransactionMutation = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(cashAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Invalid amount");
      }

      const currentBalance = cashBalance || 0;
      return createCashTransaction({
        amount,
        balance_after: currentBalance + amount,
        transaction_type: 'deposit',
        register_type: 'store',
        notes: "Cash deposit"
      });
    },
    onSuccess: () => {
      toast.success("تم إضافة المبلغ بنجاح");
      queryClient.invalidateQueries({ queryKey: ['cashBalance'] });
      queryClient.invalidateQueries({ queryKey: ['cashTransactions'] });
      setIsAddCashDialogOpen(false);
      setCashAmount("");
    },
    onError: (error: any) => {
      toast.error(error.message || "حدث خطأ أثناء إضافة المبلغ");
    }
  });

  // Mutation for adding special offer
  const addSpecialOfferMutation = useMutation({
    mutationFn: async () => {
      if (!offerData.name || !offerData.discount_value) {
        throw new Error("برجاء إدخال جميع البيانات المطلوبة");
      }

      return createSpecialOffer({
        name: offerData.name,
        code: offerData.code,
        offer_type: 'coupon',
        discount_type: offerData.discount_type as 'percentage' | 'fixed',
        discount_value: parseFloat(offerData.discount_value),
      });
    },
    onSuccess: () => {
      toast.success("تم إضافة العرض بنجاح");
      queryClient.invalidateQueries({ queryKey: ['specialOffers'] });
      setIsAddOfferDialogOpen(false);
      setOfferData({
        name: "",
        code: "",
        discount_type: "percentage",
        discount_value: ""
      });
    },
    onError: (error: any) => {
      toast.error(error.message || "حدث خطأ أثناء إضافة العرض");
    }
  });

  return (
    <MainLayout>
      <div className="container mx-auto p-6" dir="rtl">
        <h1 className="text-2xl font-bold mb-6">لوحة المبيعات والخزينة</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Cash Balance Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                الرصيد الحالي
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => setIsAddCashDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {balanceLoading ? 'جارٍ التحميل...' : `${cashBalance?.toFixed(2) || 0} ج.م`}
              </div>
            </CardContent>
          </Card>

          {/* Special Offers Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                العروض الخاصة
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => setIsAddOfferDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {offersLoading ? (
                <p>جارٍ التحميل...</p>
              ) : specialOffers && specialOffers.length > 0 ? (
                specialOffers.map(offer => (
                  <div key={offer.id} className="flex justify-between items-center mb-2">
                    <span>{offer.name}</span>
                    <span>{offer.discount_value} {offer.discount_type === 'percentage' ? '%' : 'ج.م'}</span>
                  </div>
                ))
              ) : (
                <p>لا توجد عروض حالياً</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Add Cash Dialog */}
        <Dialog open={isAddCashDialogOpen} onOpenChange={setIsAddCashDialogOpen}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة مبلغ للخزينة</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>المبلغ</Label>
                <Input 
                  type="number" 
                  value={cashAmount} 
                  onChange={(e) => setCashAmount(e.target.value)} 
                  placeholder="أدخل المبلغ" 
                />
              </div>
              <Button 
                onClick={() => addCashTransactionMutation.mutate()}
                disabled={addCashTransactionMutation.isPending}
              >
                {addCashTransactionMutation.isPending ? 'جارٍ الإضافة...' : 'إضافة'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Special Offer Dialog */}
        <Dialog open={isAddOfferDialogOpen} onOpenChange={setIsAddOfferDialogOpen}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة عرض جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>اسم العرض</Label>
                <Input 
                  value={offerData.name} 
                  onChange={(e) => setOfferData(prev => ({...prev, name: e.target.value}))} 
                  placeholder="أدخل اسم العرض" 
                />
              </div>
              <div>
                <Label>كود العرض (اختياري)</Label>
                <Input 
                  value={offerData.code} 
                  onChange={(e) => setOfferData(prev => ({...prev, code: e.target.value}))} 
                  placeholder="أدخل كود العرض" 
                />
              </div>
              <div>
                <Label>نوع الخصم</Label>
                <select 
                  value={offerData.discount_type} 
                  onChange={(e) => setOfferData(prev => ({...prev, discount_type: e.target.value}))}
                  className="w-full border rounded p-2"
                >
                  <option value="percentage">نسبة مئوية</option>
                  <option value="fixed">مبلغ ثابت</option>
                </select>
              </div>
              <div>
                <Label>قيمة الخصم</Label>
                <Input 
                  type="number" 
                  value={offerData.discount_value} 
                  onChange={(e) => setOfferData(prev => ({...prev, discount_value: e.target.value}))} 
                  placeholder="أدخل قيمة الخصم" 
                />
              </div>
              <Button 
                onClick={() => addSpecialOfferMutation.mutate()}
                disabled={addSpecialOfferMutation.isPending}
              >
                {addSpecialOfferMutation.isPending ? 'جارٍ الإضافة...' : 'إضافة'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
