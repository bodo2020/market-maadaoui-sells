import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import MainLayout from "@/components/layout/MainLayout";
import { Purchase, PurchaseItem, Product } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/data/mockData";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Edit, File, Trash2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface PurchaseWithSupplier extends Purchase {
  suppliers: { name: string };
}

export default function Invoices() {
  const [purchases, setPurchases] = useState<PurchaseWithSupplier[]>([]);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchPurchases();
  }, []);

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("purchases")
        .select("*, suppliers(name)")
        .order("date", { ascending: false });

      if (error) {
        console.error("Error fetching purchases:", error);
        toast({
          title: "Error",
          description: "Failed to fetch purchases.",
          variant: "destructive",
        });
      }

      setPurchases(data as PurchaseWithSupplier[]);
    } catch (error) {
      console.error("Unexpected error fetching purchases:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while fetching purchases.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPurchaseDetails = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from("purchases")
        .select("*, suppliers(name), items:purchase_items(*, products(name))")
        .eq("id", id)
        .single();

      if (error) {
        console.error("Error fetching purchase details:", error);
        toast({
          title: "Error",
          description: "Failed to fetch purchase details.",
          variant: "destructive",
        });
        return null;
      }

      const purchaseItems = Array.isArray(data.items) 
        ? data.items.map((item: any) => ({
            product: item.products || { name: "Unknown Product", id: item.product_id },
            quantity: item.quantity,
            price: item.price,
            total: item.total,
            id: item.id,
            purchase_id: item.purchase_id,
            product_id: item.product_id,
            created_at: item.created_at,
            updated_at: item.updated_at
          }))
        : [];

      const purchaseData = {
        ...data,
        items: purchaseItems,
        subtotal: data.total,
        discount: 0,
        payment_method: 'cash' as 'cash' | 'card' | 'mixed',
      } as Purchase;
      
      setPurchase(purchaseData);
      return purchaseData;
    } catch (error) {
      console.error("Unexpected error fetching purchase details:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while fetching purchase details.",
        variant: "destructive",
      });
      return null;
    }
  };

  const handleOpenDialog = async (id: string) => {
    setSelectedPurchaseId(id);
    await fetchPurchaseDetails(id);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedPurchaseId(null);
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6 dir-rtl">
        <h1 className="text-2xl font-bold mb-4">الفواتير</h1>

        <Card>
          <CardHeader>
            <CardTitle>قائمة الفواتير</CardTitle>
            <CardDescription>عرض وتفاصيل الفواتير المسجلة</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رقم الفاتورة</TableHead>
                    <TableHead>المورد</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>المبلغ الإجمالي</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center">
                        تحميل...
                      </TableCell>
                    </TableRow>
                  ) : purchases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center">
                        لا توجد فواتير مسجلة.
                      </TableCell>
                    </TableRow>
                  ) : (
                    purchases.map((purchase) => (
                      <TableRow key={purchase.id}>
                        <TableCell>{purchase.invoice_number}</TableCell>
                        <TableCell>{purchase.suppliers.name}</TableCell>
                        <TableCell>
                          {new Date(purchase.date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>{formatCurrency(purchase.total)}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(purchase.id)}
                          >
                            <File className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>تفاصيل الفاتورة</DialogTitle>
              <DialogDescription>
                معلومات تفصيلية حول الفاتورة المحددة
              </DialogDescription>
            </DialogHeader>
            <Separator className="my-4" />
            {purchase ? (
              <div className="grid gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>معلومات الفاتورة</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <p>
                          <strong>رقم الفاتورة:</strong> {purchase.invoice_number}
                        </p>
                        <p>
                          <strong>المورد:</strong> {purchase.suppliers.name}
                        </p>
                        <p>
                          <strong>التاريخ:</strong>{" "}
                          {new Date(purchase.date).toLocaleDateString()}
                        </p>
                        <p>
                          <strong>طريقة الدفع:</strong> {purchase.payment_method}
                        </p>
                        <p>
                          <strong>المبلغ الإجمالي:</strong> {formatCurrency(purchase.total)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>تفاصيل الأصناف</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>المنتج</TableHead>
                            <TableHead>الكمية</TableHead>
                            <TableHead>السعر</TableHead>
                            <TableHead>المجموع</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {purchase.items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>{item.product.name}</TableCell>
                              <TableCell>{item.quantity}</TableCell>
                              <TableCell>{formatCurrency(item.price)}</TableCell>
                              <TableCell>{formatCurrency(item.total)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-4">تحميل تفاصيل الفاتورة...</div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
