
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Receipt, Calendar, Package } from "lucide-react";
import { Sale, CartItem } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { ReturnOrderDialog } from "@/components/orders/ReturnOrderDialog";

interface SaleHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeInfo: any;
}

export default function SaleHistoryDialog({ open, onOpenChange, storeInfo }: SaleHistoryDialogProps) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [filteredSales, setFilteredSales] = useState<Sale[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  useEffect(() => {
    if (open) {
      fetchSales();
    }
  }, [open]);

  useEffect(() => {
    filterSales();
  }, [searchQuery, sales]);

  const fetchSales = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        throw error;
      }

      // Process the data to ensure it conforms to the Sale type
      const processedSales = (data || []).map(sale => {
        let parsedItems: CartItem[] = [];
        
        try {
          // Try to parse items if they're a string
          const items = typeof sale.items === 'string' 
            ? JSON.parse(sale.items) 
            : sale.items;
            
          // Ensure items is treated as CartItem[]
          parsedItems = Array.isArray(items) ? items as CartItem[] : [];
        } catch (e) {
          console.error("Error parsing items:", e);
        }
        
        return {
          ...sale,
          items: parsedItems,
          payment_method: (sale.payment_method === 'cash' || 
                         sale.payment_method === 'card' || 
                         sale.payment_method === 'mixed') 
            ? sale.payment_method as 'cash' | 'card' | 'mixed'
            : 'cash' // Default if invalid
        } as Sale;
      });

      setSales(processedSales);
      setFilteredSales(processedSales);
    } catch (error) {
      console.error("Error fetching sales:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterSales = () => {
    const query = searchQuery.toLowerCase();
    if (!query) {
      setFilteredSales(sales);
      return;
    }

    const filtered = sales.filter(
      (sale) =>
        sale.invoice_number.toLowerCase().includes(query) ||
        (sale.customer_name && sale.customer_name.toLowerCase().includes(query)) ||
        (sale.customer_phone && sale.customer_phone.toLowerCase().includes(query))
    );
    setFilteredSales(filtered);
  };

  const handleReturn = (sale: Sale) => {
    setSelectedSale(sale);
    setReturnDialogOpen(true);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ar-EG', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(date);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>سجل الفواتير</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث باسم العميل أو رقم الفاتورة..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              <Button variant="outline" onClick={fetchSales}>تحديث</Button>
            </div>

            {loading ? (
              <div className="text-center py-8">جاري التحميل...</div>
            ) : filteredSales.length === 0 ? (
              <div className="text-center py-8">لا توجد فواتير</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>رقم الفاتورة</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>العميل</TableHead>
                      <TableHead>المجموع</TableHead>
                      <TableHead>طريقة الدفع</TableHead>
                      <TableHead>الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSales.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell>{sale.invoice_number}</TableCell>
                        <TableCell>{formatDate(sale.created_at)}</TableCell>
                        <TableCell>{sale.customer_name || "غير محدد"}</TableCell>
                        <TableCell>{sale.total} {storeInfo?.currency || "ج.م"}</TableCell>
                        <TableCell>
                          {sale.payment_method === "cash"
                            ? "نقدي"
                            : sale.payment_method === "card"
                            ? "بطاقة"
                            : "مختلط"}
                        </TableCell>
                        <TableCell className="flex gap-2">
                          <Button variant="outline" size="icon" title="طباعة">
                            <Receipt className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            title="إنشاء مرتجع"
                            onClick={() => handleReturn(sale)}
                          >
                            <Package className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {selectedSale && (
        <ReturnOrderDialog
          open={returnDialogOpen}
          onOpenChange={setReturnDialogOpen}
          onComplete={fetchSales}
          items={selectedSale.items.map(item => ({
            product_id: item.product.id,
            product_name: item.product.name,
            price: item.price,
            quantity: item.quantity,
            total: item.total
          }))}
          orderId={selectedSale.id}
          orderType="pos"
          customerName={selectedSale.customer_name}
          customerPhone={selectedSale.customer_phone}
          total={selectedSale.total}
        />
      )}
    </>
  );
}
