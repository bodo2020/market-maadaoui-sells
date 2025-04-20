import { useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
// Remove the incorrect import for date-picker
import { Calendar } from "@/components/ui/calendar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPurchases, deletePurchase, addPurchase } from "@/services/supabase/purchaseService";
import { fetchSuppliers } from "@/services/supabase/supplierService";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar as CalendarIcon, ChevronDown, Download, Edit, Eye, FilePlus, Plus, Search, Trash2 } from "lucide-react";
import { Supplier, Purchase } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Purchases() {
  const [open, setOpen] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [paid, setPaid] = useState<number | undefined>(undefined);
  const [description, setDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();

  const { data: purchases, isLoading } = useQuery({
    queryKey: ["purchases"],
    queryFn: fetchPurchases,
  });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSuppliers,
  });

  const addPurchaseMutation = useMutation(addPurchase, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      setOpen(false);
      toast.success("تمت إضافة عملية الشراء بنجاح");
    },
    onError: (error) => {
      toast.error("حدث خطأ أثناء إضافة عملية الشراء");
      console.error("Error adding purchase:", error);
    },
  });

  const deletePurchaseMutation = useMutation(deletePurchase, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      setOpenDelete(false);
      toast.success("تم حذف عملية الشراء بنجاح");
    },
    onError: (error) => {
      toast.error("حدث خطأ أثناء حذف عملية الشراء");
      console.error("Error deleting purchase:", error);
    },
  });

  const filteredPurchases = purchases?.filter((purchase) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      purchase.invoice_number.toLowerCase().includes(searchLower) ||
      purchase.suppliers?.name.toLowerCase().includes(searchLower)
    );
  });

  const handleDelete = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setOpenDelete(true);
  };

  const confirmDelete = async () => {
    if (selectedPurchase) {
      await deletePurchaseMutation.mutateAsync(selectedPurchase.id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !supplierId || !invoiceNumber || !total || !paid) {
      toast.error("الرجاء ملء جميع الحقول");
      return;
    }

    const newPurchase = {
      date: format(date, "yyyy-MM-dd"),
      supplier_id: supplierId,
      invoice_number: invoiceNumber,
      total: total,
      paid: paid,
      description: description,
    };

    await addPurchaseMutation.mutateAsync(newPurchase);
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">المشتريات</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => console.log("تصدير")}>
              <Download className="ml-2 h-4 w-4" />
              تصدير
            </Button>
            <Button variant="default" onClick={() => setOpen(true)}>
              <Plus className="ml-2 h-4 w-4" />
              إضافة عملية شراء
            </Button>
          </div>
        </div>

        <div className="mb-4 flex">
          <div className="relative w-full max-w-sm">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="البحث عن طريق رقم الفاتورة أو اسم المورد..."
              className="pl-10 pr-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>سجل المشتريات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p>Loading...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>المورد</TableHead>
                    <TableHead>رقم الفاتورة</TableHead>
                    <TableHead>المبلغ الإجمالي</TableHead>
                    <TableHead>المدفوع</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPurchases?.map((purchase) => (
                    <TableRow key={purchase.id}>
                      <TableCell>
                        {new Date(purchase.date).toLocaleDateString("ar-SA")}
                      </TableCell>
                      <TableCell>{purchase.suppliers?.name}</TableCell>
                      <TableCell>{purchase.invoice_number}</TableCell>
                      <TableCell>{purchase.total}</TableCell>
                      <TableCell>{purchase.paid}</TableCell>
                      <TableCell className="text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="mr-2 h-4 w-4" /> <span>عرض</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit className="mr-2 h-4 w-4" /> <span>تعديل</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(purchase)}
                              disabled={deletePurchaseMutation.isLoading}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> <span>حذف</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-[525px] rtl">
            <DialogHeader>
              <DialogTitle>إضافة عملية شراء جديدة</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="date">التاريخ</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, "PPP") : <span>اختر تاريخ</span>}
                        <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="center" side="bottom">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        disabled={(date) =>
                          date > new Date() || date < new Date("2020-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label htmlFor="supplier">المورد</Label>
                  <Select onValueChange={setSupplierId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="اختر مورد" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers?.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="invoiceNumber">رقم الفاتورة</Label>
                  <Input
                    id="invoiceNumber"
                    type="text"
                    placeholder="أدخل رقم الفاتورة"
                    className="text-right"
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="total">المبلغ الإجمالي</Label>
                  <Input
                    id="total"
                    type="number"
                    placeholder="أدخل المبلغ الإجمالي"
                    className="text-right"
                    onChange={(e) => setTotal(Number(e.target.value))}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="paid">المدفوع</Label>
                <Input
                  id="paid"
                  type="number"
                  placeholder="أدخل المبلغ المدفوع"
                  className="text-right"
                  onChange={(e) => setPaid(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="description">الوصف</Label>
                <Input
                  id="description"
                  placeholder="أدخل وصفًا (اختياري)"
                  className="text-right"
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="submit" disabled={addPurchaseMutation.isLoading}>
                  {addPurchaseMutation.isLoading ? "جاري الإضافة..." : "إضافة"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  إلغاء
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيؤدي هذا الإجراء إلى حذف عملية الشراء بشكل دائم.
                هل أنت متأكد؟
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row-reverse">
              <AlertDialogAction
                onClick={confirmDelete}
                disabled={deletePurchaseMutation.isLoading}
              >
                {deletePurchaseMutation.isLoading ? "جاري الحذف..." : "حذف"}
              </AlertDialogAction>
              <AlertDialogCancel onClick={() => setOpenDelete(false)}>
                إلغاء
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}
