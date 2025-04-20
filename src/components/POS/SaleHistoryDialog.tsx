
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Printer, PackageX } from "lucide-react";
import { Sale } from "@/types";
import { fetchSales } from "@/services/supabase/saleService";
import { printInvoice } from "@/services/supabase/saleService";
import { toast } from "sonner";
import { ReturnOrderDialog } from "@/components/orders/ReturnOrderDialog";

interface SaleHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeInfo: any;
}

export default function SaleHistoryDialog({
  open,
  onOpenChange,
  storeInfo
}: SaleHistoryDialogProps) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [returnOrderOpen, setReturnOrderOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  useEffect(() => {
    if (open) {
      loadSales();
    }
  }, [open]);

  const loadSales = async () => {
    try {
      setLoading(true);
      // Get today's sales
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      
      const salesData = await fetchSales(startDate, endDate);
      setSales(salesData);
    } catch (error) {
      console.error("Error loading sales:", error);
      toast({
        title: "خطأ في تحميل المبيعات",
        description: "حدث خطأ أثناء تحميل المبيعات، يرجى المحاولة مرة أخرى."
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePrintInvoice = (sale: Sale) => {
    try {
      printInvoice(sale, storeInfo);
    } catch (error) {
      console.error("Error printing invoice:", error);
      toast({
        title: "خطأ في طباعة الفاتورة",
        description: "حدث خطأ أثناء طباعة الفاتورة، يرجى المحاولة مرة أخرى."
      });
    }
  };

  const handleCreateReturn = (sale: Sale) => {
    setSelectedSale(sale);
    setReturnOrderOpen(true);
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ar-EG', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const filteredSales = sales.filter(sale => {
    if (!searchQuery) return true;
    
    const query = searchQuery.toLowerCase();
    return (
      sale.invoice_number?.toLowerCase().includes(query) ||
      sale.customer_name?.toLowerCase().includes(query) ||
      sale.customer_phone?.toLowerCase().includes(query)
    );
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl dir-rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">سجل المبيعات اليومية</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث برقم الفاتورة، اسم العميل، أو رقم الهاتف"
                  className="pr-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={loadSales}>تحديث</Button>
            </div>
            
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رقم الفاتورة</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">العميل</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">طريقة الدفع</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10">
                        جاري التحميل...
                      </TableCell>
                    </TableRow>
                  ) : filteredSales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                        لا توجد مبيعات مسجلة لهذا اليوم
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSales.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell>{sale.invoice_number}</TableCell>
                        <TableCell>{formatDateTime(sale.date)}</TableCell>
                        <TableCell>{sale.customer_name || 'عميل غير مسجل'}</TableCell>
                        <TableCell>{sale.total.toFixed(2)}</TableCell>
                        <TableCell>
                          {sale.payment_method === 'cash' ? 'نقدي' :
                           sale.payment_method === 'card' ? 'بطاقة' : 'مختلط'}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2 space-x-reverse">
                            <Button variant="ghost" size="sm" onClick={() => handlePrintInvoice(sale)}>
                              <Printer className="h-4 w-4 ml-1" />
                              طباعة
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleCreateReturn(sale)}>
                              <PackageX className="h-4 w-4 ml-1" />
                              إرجاع
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {selectedSale && (
        <ReturnOrderDialog
          open={returnOrderOpen}
          onOpenChange={setReturnOrderOpen}
          items={selectedSale.items}
          saleId={selectedSale.id}
          orderType="pos"
          customerName={selectedSale.customer_name}
          customerPhone={selectedSale.customer_phone}
          invoiceNumber={selectedSale.invoice_number}
          total={selectedSale.total}
          onComplete={loadSales}
        />
      )}
    </>
  );
}
