
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { fetchSales, deleteSale } from "@/services/supabase/saleService";
import { Sale } from "@/types";
import { format } from "date-fns";
import { Eye, FileText, Trash } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function InvoiceList() {
  const [invoices, setInvoices] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const sales = await fetchSales();
      setInvoices(sales);
    } catch (error) {
      console.error("Error loading invoices:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحميل الفواتير",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = (id: string) => {
    setInvoiceToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!invoiceToDelete) return;

    try {
      await deleteSale(invoiceToDelete);
      setInvoices(invoices.filter(invoice => invoice.id !== invoiceToDelete));
      toast({
        title: "تم",
        description: "تم حذف الفاتورة بنجاح",
      });
    } catch (error) {
      console.error("Error deleting invoice:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حذف الفاتورة",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setInvoiceToDelete(null);
    }
  };

  if (loading) {
    return <div className="p-4">جاري تحميل الفواتير...</div>;
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">الفواتير</h1>
        <Link to="/pos">
          <Button>إنشاء فاتورة جديدة</Button>
        </Link>
      </div>

      {invoices.length === 0 ? (
        <Card className="p-6 text-center">
          <p>لا توجد فواتير حتى الآن</p>
          <Link to="/pos">
            <Button className="mt-4">إنشاء فاتورة جديدة</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4">
          {invoices.map(invoice => (
            <Card key={invoice.id} className="p-4">
              <div className="flex justify-between items-center">
                <div>
                  <div className="flex items-center">
                    <FileText className="h-5 w-5 text-primary mr-2" />
                    <span className="font-medium">{invoice.invoice_number}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {format(new Date(invoice.date), 'yyyy-MM-dd HH:mm')}
                  </p>
                  {invoice.customer_name && (
                    <p className="text-sm mt-1">العميل: {invoice.customer_name}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-bold">{invoice.total.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">
                    {invoice.items.length} منتج
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link to={`/invoices/${invoice.id}`}>
                    <Button variant="outline" size="sm">
                      <Eye className="h-4 w-4 mr-1" /> عرض وتعديل
                    </Button>
                  </Link>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => confirmDelete(invoice.id)}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد من حذف هذه الفاتورة؟</AlertDialogTitle>
            <AlertDialogDescription>
              لا يمكن التراجع عن هذا الإجراء. سيتم حذف الفاتورة بشكل نهائي.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
