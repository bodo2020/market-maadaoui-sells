
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { fetchSaleById, updateSale } from "@/services/supabase/saleService";
import { getStoreSettings } from "@/services/supabase/settingsService";
import { Sale } from "@/types";
import { format } from "date-fns";
import { ArrowLeft, Save, Printer } from "lucide-react";

export default function InvoiceEditor() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeSettings, setStoreSettings] = useState({
    storeName: "",
    storeAddress: "",
    storePhone: "",
    storeEmail: "",
    logoUrl: null as string | null,
  });
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        if (id) {
          const invoiceData = await fetchSaleById(id);
          setInvoice(invoiceData);
          setCustomerName(invoiceData.customer_name || "");
          setCustomerPhone(invoiceData.customer_phone || "");
        }
        
        const settings = await getStoreSettings();
        setStoreSettings(settings);
      } catch (error) {
        console.error("Error loading invoice:", error);
        toast({
          title: "خطأ",
          description: "حدث خطأ أثناء تحميل الفاتورة",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id, toast]);

  const handleSave = async () => {
    if (!invoice || !id) return;
    
    try {
      setSaving(true);
      await updateSale(id, {
        customer_name: customerName,
        customer_phone: customerPhone,
      });
      
      toast({
        title: "تم",
        description: "تم حفظ تغييرات الفاتورة بنجاح",
      });
    } catch (error) {
      console.error("Error saving invoice:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حفظ الفاتورة",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="p-4">
        <p>جاري تحميل الفاتورة...</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-4">
        <p>الفاتورة غير موجودة</p>
        <Button onClick={() => navigate(-1)} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> العودة
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6 print:py-0">
      <div className="flex justify-between items-center print:hidden">
        <h1 className="text-2xl font-bold">تعديل الفاتورة</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> العودة
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> طباعة
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" /> حفظ التغييرات
          </Button>
        </div>
      </div>

      <Card className="print:shadow-none print:border-none">
        <CardContent className="p-6">
          <div className="space-y-6">
            {/* Invoice Header */}
            <div className="flex justify-between items-center border-b pb-4">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold print:text-xl">{storeSettings.storeName}</h2>
                {storeSettings.storeAddress && <p className="text-sm text-muted-foreground">{storeSettings.storeAddress}</p>}
                {storeSettings.storePhone && <p className="text-sm text-muted-foreground">هاتف: {storeSettings.storePhone}</p>}
                {storeSettings.storeEmail && <p className="text-sm text-muted-foreground">بريد: {storeSettings.storeEmail}</p>}
              </div>
              {storeSettings.logoUrl && (
                <div className="w-24 h-24">
                  <img src={storeSettings.logoUrl} alt="شعار المتجر" className="w-full h-full object-contain" />
                </div>
              )}
            </div>

            {/* Invoice Details */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium">رقم الفاتورة:</p>
                <p>{invoice.invoice_number}</p>
              </div>
              <div>
                <p className="text-sm font-medium">التاريخ:</p>
                <p>{format(new Date(invoice.date), 'yyyy-MM-dd')}</p>
              </div>
              <div className="print:hidden">
                <Label htmlFor="customer-name">اسم العميل</Label>
                <Input 
                  id="customer-name" 
                  value={customerName} 
                  onChange={(e) => setCustomerName(e.target.value)} 
                  placeholder="اسم العميل (اختياري)"
                />
              </div>
              <div className="print:hidden">
                <Label htmlFor="customer-phone">رقم هاتف العميل</Label>
                <Input 
                  id="customer-phone" 
                  value={customerPhone} 
                  onChange={(e) => setCustomerPhone(e.target.value)} 
                  placeholder="رقم الهاتف (اختياري)"
                />
              </div>
              <div className="hidden print:block">
                <p className="text-sm font-medium">اسم العميل:</p>
                <p>{customerName || "---"}</p>
              </div>
              <div className="hidden print:block">
                <p className="text-sm font-medium">رقم هاتف العميل:</p>
                <p>{customerPhone || "---"}</p>
              </div>
            </div>

            {/* Invoice Items */}
            <div className="mt-6">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-right py-2">#</th>
                    <th className="text-right py-2">المنتج</th>
                    <th className="text-right py-2">الكمية</th>
                    <th className="text-right py-2">السعر</th>
                    <th className="text-right py-2">الخصم</th>
                    <th className="text-right py-2">المجموع</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, index) => (
                    <tr key={index} className="border-b">
                      <td className="py-2">{index + 1}</td>
                      <td className="py-2">{item.product.name}</td>
                      <td className="py-2">
                        {item.weight ? `${item.weight} ${item.product.unit_of_measure || 'kg'}` : item.quantity}
                      </td>
                      <td className="py-2">{item.price.toFixed(2)}</td>
                      <td className="py-2">{item.discount.toFixed(2)}</td>
                      <td className="py-2">{item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Invoice Summary */}
            <div className="mt-6 border-t pt-4">
              <div className="flex justify-between">
                <span>المجموع:</span>
                <span>{invoice.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>الخصم:</span>
                <span>{invoice.discount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>الإجمالي:</span>
                <span>{invoice.total.toFixed(2)}</span>
              </div>
              
              <div className="mt-4 border-t pt-4">
                <p className="text-sm font-medium">طريقة الدفع:</p>
                <p>
                  {invoice.payment_method === 'cash' && 'نقداً'}
                  {invoice.payment_method === 'card' && 'بطاقة'}
                  {invoice.payment_method === 'mixed' && 'مختلط (نقداً وبطاقة)'}
                </p>
                {invoice.payment_method === 'mixed' && (
                  <div className="flex flex-col gap-1 mt-2">
                    <p className="text-sm">المبلغ النقدي: {invoice.cash_amount?.toFixed(2) || '0.00'}</p>
                    <p className="text-sm">المبلغ بالبطاقة: {invoice.card_amount?.toFixed(2) || '0.00'}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 text-center text-sm text-muted-foreground">
              <p>شكراً لتعاملكم معنا</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
