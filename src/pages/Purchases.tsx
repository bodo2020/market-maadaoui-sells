
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Eye, Trash2, FileText, Upload, Download, Filter } from "lucide-react";
import { fetchPurchases, createPurchase, deletePurchase } from "@/services/supabase/purchaseService";
import { fetchSuppliers } from "@/services/supabase/supplierService";
import { Textarea } from "@/components/ui/textarea";
import { Purchase } from "@/types";
import PurchaseItemForm from "@/components/purchases/PurchaseItemForm";

export default function Purchases() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [formData, setFormData] = useState({
    supplier_id: "",
    invoice_number: "",
    date: new Date().toISOString().split('T')[0],
    total: 0,
    paid: 0,
    description: "",
    items: []
  });
  const [purchaseItems, setPurchaseItems] = useState<any[]>([]);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  
  const queryClient = useQueryClient();
  
  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["purchases"],
    queryFn: () => fetchPurchases()
  });
  
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSuppliers
  });
  
  const createPurchaseMutation = useMutation({
    mutationFn: createPurchase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      toast.success("تم إضافة فاتورة الشراء بنجاح");
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("حدث خطأ أثناء إضافة فاتورة الشراء");
      console.error("Error creating purchase:", error);
    }
  });
  
  const deletePurchaseMutation = useMutation({
    mutationFn: deletePurchase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      toast.success("تم حذف فاتورة الشراء بنجاح");
    },
    onError: (error) => {
      toast.error("حدث خطأ أثناء حذف فاتورة الشراء");
      console.error("Error deleting purchase:", error);
    }
  });
  
  const resetForm = () => {
    setFormData({
      supplier_id: "",
      invoice_number: "",
      date: new Date().toISOString().split('T')[0],
      total: 0,
      paid: 0,
      description: "",
      items: []
    });
    setPurchaseItems([]);
    setInvoiceFile(null);
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setFormData({
      ...formData,
      [id]: id === "total" || id === "paid" ? Number(value) : value
    });
  };
  
  const handleSelectChange = (value: string, field: string) => {
    setFormData({
      ...formData,
      [field]: value
    });
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setInvoiceFile(e.target.files[0]);
    }
  };
  
  const handleAddPurchase = () => {
    if (!formData.supplier_id || !formData.invoice_number || !formData.date || formData.total <= 0) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    
    // Calculate total from purchase items
    const calculatedTotal = purchaseItems.reduce((sum, item) => 
      sum + (item.quantity * item.price), 0
    );
    
    createPurchaseMutation.mutate({
      ...formData,
      total: calculatedTotal,
      items: purchaseItems,
      invoice_file: invoiceFile
    });
  };
  
  const handleDeletePurchase = (id: string) => {
    if (confirm("هل أنت متأكد من رغبتك في حذف هذه الفاتورة؟")) {
      deletePurchaseMutation.mutate(id);
    }
  };
  
  const handleViewPurchase = async (purchase: Purchase) => {
    // Fetch purchase with items details
    const { getPurchaseWithItems } = await import("@/services/supabase/purchaseService");
    const purchaseWithItems = await getPurchaseWithItems(purchase.id);
    
    if (purchaseWithItems) {
      setSelectedPurchase(purchaseWithItems);
    } else {
      setSelectedPurchase(purchase);
    }
    setIsViewDialogOpen(true);
  };
  
  const handleExportPurchases = () => {
    // TODO: Implement export functionality
    toast.info("سيتم إضافة ميزة التصدير قريباً");
  };
  
  const handleFilterPurchases = () => {
    // TODO: Implement filter functionality
    toast.info("سيتم إضافة ميزة التصفية قريباً");
  };
  
  const filteredPurchases = purchases.filter(purchase => {
    const searchTermLower = searchTerm.toLowerCase();
    const supplierName = suppliers.find(s => s.id === purchase.supplier_id)?.name || "";
    
    return (
      supplierName.toLowerCase().includes(searchTermLower) ||
      purchase.invoice_number.toLowerCase().includes(searchTermLower) ||
      purchase.description?.toLowerCase().includes(searchTermLower)
    );
  });
  
  const getSupplierName = (supplierId: string) => {
    return suppliers.find(s => s.id === supplierId)?.name || "غير معروف";
  };
  
  const getRemainingAmount = (purchase: Purchase) => {
    return purchase.total - purchase.paid;
  };
  
  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">إدارة المشتريات</h1>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="ml-2 h-4 w-4" />
          إضافة فاتورة شراء جديدة
        </Button>
      </div>
      
      <div className="flex gap-2 mb-6">
        <Button variant="outline" onClick={handleFilterPurchases}>
          <Filter className="ml-2 h-4 w-4" />
          تصفية
        </Button>
        <Button variant="outline" onClick={handleExportPurchases}>
          <Download className="ml-2 h-4 w-4" />
          تصدير
        </Button>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">قائمة فواتير الشراء</CardTitle>
          <div className="flex w-full max-w-sm items-center space-x-2 mt-2">
            <Input
              type="search"
              placeholder="بحث..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
            <Button variant="ghost">
              <Search />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center p-4">جاري التحميل...</div>
          ) : filteredPurchases.length === 0 ? (
            <div className="text-center text-muted-foreground p-4">
              {searchTerm ? "لا توجد نتائج مطابقة للبحث" : "لا يوجد فواتير شراء، أضف فواتير جديدة"}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رقم الفاتورة</TableHead>
                    <TableHead>المورد</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>إجمالي الفاتورة</TableHead>
                    <TableHead>المبلغ المدفوع</TableHead>
                    <TableHead>المبلغ المتبقي</TableHead>
                    <TableHead>ملف الفاتورة</TableHead>
                    <TableHead className="text-left">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPurchases.map((purchase) => (
                    <TableRow key={purchase.id}>
                      <TableCell className="font-medium">{purchase.invoice_number}</TableCell>
                      <TableCell>{getSupplierName(purchase.supplier_id)}</TableCell>
                      <TableCell>{new Date(purchase.date).toLocaleDateString('ar-EG')}</TableCell>
                      <TableCell>{purchase.total}</TableCell>
                      <TableCell>{purchase.paid}</TableCell>
                      <TableCell>{getRemainingAmount(purchase)}</TableCell>
                      <TableCell>
                        {purchase.invoice_file_url ? (
                          <a 
                            href={purchase.invoice_file_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center text-blue-600"
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            عرض
                          </a>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewPurchase(purchase)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => handleDeletePurchase(purchase.id)}
                            disabled={deletePurchaseMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Add Purchase Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>إضافة فاتورة شراء جديدة</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="supplier_id">المورد</Label>
                <Select 
                  onValueChange={(value) => handleSelectChange(value, "supplier_id")}
                  value={formData.supplier_id}
                >
                  <SelectTrigger id="supplier_id">
                    <SelectValue placeholder="اختر المورد" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice_number">رقم الفاتورة</Label>
                <Input 
                  id="invoice_number" 
                  placeholder="رقم الفاتورة" 
                  value={formData.invoice_number}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">التاريخ</Label>
                <Input 
                  id="date" 
                  type="date" 
                  value={formData.date}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="total">إجمالي الفاتورة</Label>
                <Input 
                  id="total" 
                  type="number" 
                  placeholder="0.00" 
                  value={formData.total}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paid">المبلغ المدفوع</Label>
                <Input 
                  id="paid" 
                  type="number" 
                  placeholder="0.00" 
                  value={formData.paid}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label>المبلغ المتبقي</Label>
                <Input 
                  type="number"
                  readOnly
                  value={(formData.total - formData.paid).toFixed(2)}
                  className="bg-muted"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">وصف</Label>
              <Textarea 
                id="description" 
                placeholder="وصف الفاتورة (اختياري)" 
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
              />
            </div>
            
            {/* Purchase Items Form */}
            <PurchaseItemForm 
              items={purchaseItems} 
              onItemsChange={setPurchaseItems}
            />

            <div className="space-y-2">
              <Label htmlFor="invoice_file">صورة الفاتورة</Label>
              <div className="flex items-center gap-2">
                <Input 
                  id="invoice_file" 
                  type="file" 
                  accept="image/*,.pdf"
                  onChange={handleFileChange}
                  className="max-w-xs"
                />
                <Button 
                  type="button" 
                  variant="outline"
                  className="flex items-center"
                  disabled={!invoiceFile}
                  onClick={() => setInvoiceFile(null)}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {invoiceFile ? invoiceFile.name : "اختر ملف"}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              type="submit" 
              onClick={handleAddPurchase}
              disabled={createPurchaseMutation.isPending}
            >
              {createPurchaseMutation.isPending ? "جارِ الحفظ..." : "حفظ الفاتورة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* View Purchase Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>عرض تفاصيل فاتورة الشراء</DialogTitle>
          </DialogHeader>
          {selectedPurchase && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">المورد</Label>
                  <p>{getSupplierName(selectedPurchase.supplier_id)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">رقم الفاتورة</Label>
                  <p>{selectedPurchase.invoice_number}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">التاريخ</Label>
                  <p>{new Date(selectedPurchase.date).toLocaleDateString('ar-EG')}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">إجمالي الفاتورة</Label>
                  <p>{selectedPurchase.total}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">المبلغ المدفوع</Label>
                  <p>{selectedPurchase.paid}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">المبلغ المتبقي</Label>
                  <p>{getRemainingAmount(selectedPurchase)}</p>
                </div>
              </div>
              
              {selectedPurchase.description && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground">وصف</Label>
                  <p>{selectedPurchase.description}</p>
                </div>
              )}
              
              {/* Purchase Items */}
              {selectedPurchase.items && selectedPurchase.items.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">المنتجات المشتراة</Label>
                  <div className="border rounded-md">
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
                        {selectedPurchase.items.map((item: any, index: number) => (
                          <TableRow key={index}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{item.products?.name || 'منتج غير معروف'}</p>
                                {item.batch_number && (
                                  <p className="text-sm text-muted-foreground">
                                    دفعة: {item.batch_number}
                                  </p>
                                )}
                                {item.expiry_date && (
                                  <p className="text-sm text-muted-foreground">
                                    الصلاحية: {new Date(item.expiry_date).toLocaleDateString('ar-EG')}
                                  </p>
                                )}
                                {item.shelf_location && (
                                  <p className="text-sm text-muted-foreground">
                                    الموقع: {item.shelf_location}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>{item.price}</TableCell>
                            <TableCell>{item.total || (item.quantity * item.price)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              
              {selectedPurchase.invoice_file_url && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">ملف الفاتورة</Label>
                  <div className="mt-1">
                    <a 
                      href={selectedPurchase.invoice_file_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      عرض الفاتورة
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
