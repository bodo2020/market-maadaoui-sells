import { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, File, Edit, Trash2, Calendar } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format } from 'date-fns';
import { DatePicker } from "@/components/ui/date-picker"
import { arEG } from 'date-fns/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Purchase, Supplier } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export default function Purchases() {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [total, setTotal] = useState(0);
  const [paid, setPaid] = useState(0);
  const [description, setDescription] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const queryClient = useQueryClient();

  const { data: purchases, isLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchases')
        .select('*, suppliers(name)')
        .order('date', { ascending: false });
      if (error) {
        throw error;
      }
      return data as Purchase[];
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name', { ascending: true });
      if (error) {
        throw error;
      }
      return data as Supplier[];
    },
  });

  const addPurchaseMutation = useMutation({
    mutationFn: async (newPurchase: Omit<Purchase, 'id' | 'created_at' | 'updated_at'>) => {
      const { error } = await supabase
        .from('purchases')
        .insert(newPurchase);
      if (error) {
        throw error;
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setOpen(false);
      clearForm();
      toast.success('تمت إضافة عملية الشراء بنجاح');
    },
    onError: (error: any) => {
      toast.error(`حدث خطأ أثناء إضافة عملية الشراء: ${error.message}`);
    },
  });

  const updatePurchaseMutation = useMutation({
    mutationFn: async ({ id, purchase }: { id: string, purchase: Partial<Purchase> }) => {
      const { error } = await supabase
        .from('purchases')
        .update(purchase)
        .eq('id', id);
      if (error) {
        throw error;
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setEditOpen(false);
      clearForm();
      toast.success('تم تحديث عملية الشراء بنجاح');
    },
    onError: (error: any) => {
      toast.error(`حدث خطأ أثناء تحديث عملية الشراء: ${error.message}`);
    },
  });

  const deletePurchaseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('purchases')
        .delete()
        .eq('id', id);
      if (error) {
        throw error;
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      toast.success('تم حذف عملية الشراء بنجاح');
    },
    onError: (error: any) => {
      toast.error(`حدث خطأ أثناء حذف عملية الشراء: ${error.message}`);
    },
  });

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    if (!date || !invoiceNumber || !total || !paid || !selectedSupplierId) {
      toast.error('الرجاء ملء جميع الحقول المطلوبة.');
      return;
    }

    const newPurchase: Omit<Purchase, 'id' | 'created_at' | 'updated_at'> = {
      supplier_id: selectedSupplierId,
      date: date.toISOString(),
      invoice_number: invoiceNumber,
      total: parseFloat(total.toString()),
      paid: parseFloat(paid.toString()),
      description: description,
      invoice_file_url: invoiceFile ? 'url' : null,
    };

    addPurchaseMutation.mutate(newPurchase);
  };

  const handleEditSubmit = async (e: any) => {
    e.preventDefault();

    if (!selectedPurchase) {
      toast.error('لم يتم تحديد عملية الشراء للتعديل.');
      return;
    }

    if (!date || !invoiceNumber || !total || !paid || !selectedSupplierId) {
      toast.error('الرجاء ملء جميع الحقول المطلوبة.');
      return;
    }

    const updatedPurchase: Partial<Purchase> = {
      supplier_id: selectedSupplierId,
      date: date.toISOString(),
      invoice_number: invoiceNumber,
      total: parseFloat(total.toString()),
      paid: parseFloat(paid.toString()),
      description: description,
      invoice_file_url: invoiceFile ? 'url' : null,
    };

    updatePurchaseMutation.mutate({ id: selectedPurchase.id, purchase: updatedPurchase });
  };

  const handleDelete = (id: string) => {
    deletePurchaseMutation.mutate(id);
  };

  const handleEdit = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setEditOpen(true);
    setDate(new Date(purchase.date));
    setInvoiceNumber(purchase.invoice_number);
    setTotal(purchase.total);
    setPaid(purchase.paid);
    setDescription(purchase.description || "");
    setSelectedSupplierId(purchase.supplier_id);
  };

  const clearForm = () => {
    setDate(new Date());
    setInvoiceNumber("");
    setTotal(0);
    setPaid(0);
    setDescription("");
    setInvoiceFile(null);
    setSelectedSupplierId("");
  };

  const filteredPurchases = purchases?.filter(purchase => {
    const searchTerm = searchQuery.toLowerCase();
    return (
      purchase.invoice_number.toLowerCase().includes(searchTerm) ||
      purchase.suppliers?.name.toLowerCase().includes(searchTerm)
    );
  });

  return (
    <MainLayout>
      <div className="container mx-auto p-6 dir-rtl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">إدارة المشتريات</h1>
          <Button onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 ml-2" />
            إضافة عملية شراء
          </Button>
        </div>

        <div className="relative w-full max-w-sm mb-4">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="البحث عن طريق رقم الفاتورة أو اسم المورد..."
            className="pl-10 pr-10"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>قائمة المشتريات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                جاري التحميل...
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>رقم الفاتورة</TableHead>
                    <TableHead>المورد</TableHead>
                    <TableHead>المبلغ الإجمالي</TableHead>
                    <TableHead>المدفوع</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPurchases?.map(purchase => (
                    <TableRow key={purchase.id}>
                      <TableCell>
                        {format(new Date(purchase.date), 'yyyy-MM-dd', { locale: arEG })}
                      </TableCell>
                      <TableCell>{purchase.invoice_number}</TableCell>
                      <TableCell>{purchase.suppliers?.name}</TableCell>
                      <TableCell>{purchase.total}</TableCell>
                      <TableCell>{purchase.paid}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2 space-x-reverse">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleEdit(purchase)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            disabled={deletePurchaseMutation.isLoading}
                            onClick={() => handleDelete(purchase.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add Purchase Dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة عملية شراء جديدة</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="date">التاريخ</Label>
                <DatePicker
                  locale={arEG}
                  id="date"
                  value={date}
                  onValueChange={setDate}
                />
              </div>
              <div>
                <Label htmlFor="supplier">المورد</Label>
                <Select onValueChange={(value) => setSelectedSupplierId(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المورد" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers?.map(supplier => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="invoiceNumber">رقم الفاتورة</Label>
                <Input
                  type="text"
                  id="invoiceNumber"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="total">المبلغ الإجمالي</Label>
                <Input
                  type="number"
                  id="total"
                  value={total}
                  onChange={e => setTotal(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="paid">المدفوع</Label>
                <Input
                  type="number"
                  id="paid"
                  value={paid}
                  onChange={e => setPaid(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="description">الوصف</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="invoiceFile">ملف الفاتورة</Label>
                <Input
                  type="file"
                  id="invoiceFile"
                  onChange={e => setInvoiceFile(e.target.files?.[0] || null)}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={addPurchaseMutation.isLoading}>
                  {addPurchaseMutation.isLoading ? (
                    <>
                      جاري الإضافة...
                    </>
                  ) : (
                    'إضافة'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Purchase Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>تعديل عملية الشراء</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <Label htmlFor="date">التاريخ</Label>
                <DatePicker
                  locale={arEG}
                  id="date"
                  value={date}
                  onValueChange={setDate}
                />
              </div>
              <div>
                <Label htmlFor="supplier">المورد</Label>
                <Select value={selectedSupplierId} onValueChange={(value) => setSelectedSupplierId(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المورد" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers?.map(supplier => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="invoiceNumber">رقم الفاتورة</Label>
                <Input
                  type="text"
                  id="invoiceNumber"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="total">المبلغ الإجمالي</Label>
                <Input
                  type="number"
                  id="total"
                  value={total}
                  onChange={e => setTotal(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="paid">المدفوع</Label>
                <Input
                  type="number"
                  id="paid"
                  value={paid}
                  onChange={e => setPaid(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="description">الوصف</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="invoiceFile">ملف الفاتورة</Label>
                <Input
                  type="file"
                  id="invoiceFile"
                  onChange={e => setInvoiceFile(e.target.files?.[0] || null)}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={updatePurchaseMutation.isLoading}>
                  {updatePurchaseMutation.isLoading ? (
                    <>
                      جاري التحديث...
                    </>
                  ) : (
                    'تحديث'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
