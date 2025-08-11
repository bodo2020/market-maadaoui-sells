
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchSales } from '@/services/supabase/saleService';
import { fetchPurchases, getPurchaseWithItems } from '@/services/supabase/purchaseService';
import { Sale, Purchase } from '@/types';
import { FileText, Edit, Printer, CalendarRange, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MainLayout from '@/components/layout/MainLayout';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import InvoiceEditDialog from '@/components/Invoice/InvoiceEditDialog';
import InvoicePreviewDialog from '@/components/POS/InvoiceDialog';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { useBranchStore } from '@/stores/branchStore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const Invoices = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [isPurchaseDetailsOpen, setIsPurchaseDetailsOpen] = useState(false);
  const [invoiceType, setInvoiceType] = useState<'sales' | 'purchases'>('sales');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const { currentBranchId } = useBranchStore();

  // Fetch all sales
  const { 
    data: sales, 
    isLoading: salesLoading, 
    isError: salesError, 
    refetch: refetchSales 
  } = useQuery({
    queryKey: ['sales', currentBranchId],
    queryFn: () => fetchSales()
  });

  // Fetch all purchases
  const { 
    data: purchases, 
    isLoading: purchasesLoading, 
    isError: purchasesError 
  } = useQuery({
    queryKey: ['purchases'],
    queryFn: fetchPurchases
  });

  // Filter by search query and date
  const filteredSales = React.useMemo(() => {
    if (!sales) return [];

    // First filter by search query
    let filtered = sales.filter(sale => 
      sale.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sale.customer_name && sale.customer_name.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // Then filter by selected date if any
    if (selectedDate) {
      const dateStr = selectedDate.toISOString().split('T')[0];
      filtered = filtered.filter(sale => {
        const saleDate = new Date(sale.date).toISOString().split('T')[0];
        return saleDate === dateStr;
      });
    }

    return filtered;
  }, [sales, searchQuery, selectedDate]);

  // Filter purchases by search query and date
  const filteredPurchases = React.useMemo(() => {
    if (!purchases) return [];

    // First filter by search query
    let filtered = purchases.filter(purchase => 
      purchase.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (purchase.suppliers?.name && purchase.suppliers.name.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // Then filter by selected date if any
    if (selectedDate) {
      const dateStr = selectedDate.toISOString().split('T')[0];
      filtered = filtered.filter(purchase => {
        const purchaseDate = new Date(purchase.date).toISOString().split('T')[0];
        return purchaseDate === dateStr;
      });
    }

    return filtered;
  }, [purchases, searchQuery, selectedDate]);

  const handleEdit = (sale: Sale) => {
    setSelectedSale(sale);
    setIsEditDialogOpen(true);
  };

  const handlePreview = (sale: Sale) => {
    setSelectedSale(sale);
    setIsPreviewDialogOpen(true);
  };

  const handleViewPurchase = async (purchase: Purchase) => {
    try {
      const purchaseWithItems = await getPurchaseWithItems(purchase.id);
      if (purchaseWithItems) {
        setSelectedPurchase(purchaseWithItems);
        setIsPurchaseDetailsOpen(true);
      }
    } catch (error) {
      console.error("Error fetching purchase details:", error);
    }
  };

  const handleEditClose = () => {
    setIsEditDialogOpen(false);
    refetchSales(); // Refresh data after edit
  };

  const handlePreviewClose = () => {
    setIsPreviewDialogOpen(false);
  };

  const handlePurchaseDetailsClose = () => {
    setIsPurchaseDetailsOpen(false);
  };

  const handleInvoiceTypeChange = (value: 'sales' | 'purchases') => {
    setInvoiceType(value);
  };

  const handleCalendarToggle = () => {
    setIsCalendarOpen(!isCalendarOpen);
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setIsCalendarOpen(false);
  };

  const handleClearDate = () => {
    setSelectedDate(undefined);
  };

  const isLoading = invoiceType === 'sales' ? salesLoading : purchasesLoading;
  const isError = invoiceType === 'sales' ? salesError : purchasesError;

  return (
    <MainLayout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">إدارة الفواتير</h1>
        </div>

        <Tabs defaultValue="sales" value={invoiceType} onValueChange={(value) => handleInvoiceTypeChange(value as 'sales' | 'purchases')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="sales">فواتير المبيعات</TabsTrigger>
            <TabsTrigger value="purchases">فواتير المشتريات</TabsTrigger>
          </TabsList>

          <Card>
            <CardHeader>
              <CardTitle>بحث الفواتير</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Input
                  placeholder={invoiceType === 'sales' ? "ابحث عن رقم الفاتورة أو اسم العميل..." : "ابحث عن رقم الفاتورة أو اسم المورد..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-md"
                />
                
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="flex items-center gap-2"
                      onClick={handleCalendarToggle}
                    >
                      <CalendarRange className="h-5 w-5" />
                      {selectedDate ? format(selectedDate, 'yyyy/MM/dd') : 'اختر تاريخ'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={handleDateSelect}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                    {selectedDate && (
                      <div className="p-2 border-t flex justify-center">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={handleClearDate}
                        >
                          إلغاء التاريخ
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8">جاري التحميل...</div>
            ) : isError ? (
              <div className="text-center py-8 text-red-500">حدث خطأ أثناء تحميل الفواتير</div>
            ) : (
              <div className="overflow-x-auto">
                {invoiceType === 'sales' ? (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-right">
                        <th className="p-3 border">رقم الفاتورة</th>
                        <th className="p-3 border">التاريخ</th>
                        <th className="p-3 border">العميل</th>
                        <th className="p-3 border">المبلغ</th>
                        <th className="p-3 border">طريقة الدفع</th>
                        <th className="p-3 border">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSales && filteredSales.length > 0 ? (
                        filteredSales.map((sale) => {
                          const saleDate = new Date(sale.date);
                          const formattedDate = saleDate.toLocaleDateString('ar-EG', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          });
                          
                          const paymentMethodText = 
                            sale.payment_method === 'cash' ? 'نقدي' : 
                            sale.payment_method === 'card' ? 'بطاقة' : 'مختلط';

                          return (
                            <tr key={sale.id} className="border-b hover:bg-gray-50">
                              <td className="p-3 border">{sale.invoice_number}</td>
                              <td className="p-3 border">{formattedDate}</td>
                              <td className="p-3 border">{sale.customer_name || 'عميل عام'}</td>
                              <td className="p-3 border">{sale.total.toFixed(2)}</td>
                              <td className="p-3 border">{paymentMethodText}</td>
                              <td className="p-3 border">
                                <div className="flex gap-2">
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    onClick={() => handleEdit(sale)}
                                  >
                                    <Edit className="h-4 w-4 ml-1" />
                                    تعديل
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    onClick={() => handlePreview(sale)}
                                  >
                                    <FileText className="h-4 w-4 ml-1" />
                                    عرض
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="p-3 text-center">
                            لا توجد فواتير متطابقة مع معايير البحث
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-right">
                        <th className="p-3 border">رقم الفاتورة</th>
                        <th className="p-3 border">التاريخ</th>
                        <th className="p-3 border">المورد</th>
                        <th className="p-3 border">المبلغ الكلي</th>
                        <th className="p-3 border">المبلغ المدفوع</th>
                        <th className="p-3 border">الحالة</th>
                        <th className="p-3 border">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPurchases && filteredPurchases.length > 0 ? (
                        filteredPurchases.map((purchase) => {
                          const purchaseDate = new Date(purchase.date);
                          const formattedDate = purchaseDate.toLocaleDateString('ar-EG', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          });
                          
                          const remaining = purchase.total - purchase.paid;
                          const isPaid = remaining <= 0;

                          return (
                            <tr key={purchase.id} className="border-b hover:bg-gray-50">
                              <td className="p-3 border">{purchase.invoice_number}</td>
                              <td className="p-3 border">{formattedDate}</td>
                              <td className="p-3 border">{purchase.suppliers?.name || 'غير محدد'}</td>
                              <td className="p-3 border">{purchase.total.toFixed(2)}</td>
                              <td className="p-3 border">{purchase.paid.toFixed(2)}</td>
                              <td className="p-3 border">
                                {isPaid ? (
                                  <Badge className="bg-green-100 text-green-800 hover:bg-green-200">مدفوعة</Badge>
                                ) : (
                                  <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">
                                    متبقي {remaining.toFixed(2)}
                                  </Badge>
                                )}
                              </td>
                              <td className="p-3 border">
                                <div className="flex gap-2">
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => handleViewPurchase(purchase)}
                                  >
                                    <FileText className="h-4 w-4 ml-1" />
                                    عرض
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7} className="p-3 text-center">
                            لا توجد فواتير متطابقة مع معايير البحث
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </Tabs>
      </div>

      {/* Invoice Edit Dialog */}
      {selectedSale && (
        <InvoiceEditDialog
          isOpen={isEditDialogOpen}
          onClose={handleEditClose}
          sale={selectedSale}
        />
      )}

      {/* Invoice Preview Dialog */}
      {selectedSale && (
        <InvoicePreviewDialog
          isOpen={isPreviewDialogOpen}
          onClose={handlePreviewClose}
          sale={selectedSale}
        />
      )}

      {/* Purchase Details Dialog (You can create a separate component for this) */}
      {selectedPurchase && (
        <div className={`fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center ${isPurchaseDetailsOpen ? 'block' : 'hidden'}`}>
          <div className="bg-white rounded-lg p-6 m-4 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">تفاصيل فاتورة المشتريات</h2>
              <Button variant="ghost" onClick={handlePurchaseDetailsClose}>إغلاق</Button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-sm text-gray-500">رقم الفاتورة</p>
                <p className="font-medium">{selectedPurchase.invoice_number}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">التاريخ</p>
                <p className="font-medium">{new Date(selectedPurchase.date).toLocaleDateString('ar-EG')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">المورد</p>
                <p className="font-medium">{selectedPurchase.suppliers?.name || 'غير محدد'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">الحالة</p>
                <p className="font-medium">
                  {selectedPurchase.total <= selectedPurchase.paid ? (
                    <Badge className="bg-green-100 text-green-800">مدفوعة بالكامل</Badge>
                  ) : (
                    <Badge className="bg-yellow-100 text-yellow-800">
                      متبقي {(selectedPurchase.total - selectedPurchase.paid).toFixed(2)}
                    </Badge>
                  )}
                </p>
              </div>
            </div>
            
            <div className="mb-6">
              <h3 className="font-semibold mb-2">المنتجات</h3>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-2 border text-right">المنتج</th>
                    <th className="p-2 border text-right">الكمية</th>
                    <th className="p-2 border text-right">السعر</th>
                    <th className="p-2 border text-right">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPurchase.items?.map((item, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-2 border">{item.products?.name || 'منتج غير معروف'}</td>
                      <td className="p-2 border">{item.quantity}</td>
                      <td className="p-2 border">{item.price.toFixed(2)}</td>
                      <td className="p-2 border">{item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div></div>
              <div className="space-y-2">
                <div className="flex justify-between border-b pb-2">
                  <span>الإجمالي:</span>
                  <span className="font-semibold">{selectedPurchase.total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span>المدفوع:</span>
                  <span className="font-semibold">{selectedPurchase.paid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>المتبقي:</span>
                  <span>{(selectedPurchase.total - selectedPurchase.paid).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {selectedPurchase.description && (
              <div className="mt-4">
                <h3 className="font-semibold mb-2">ملاحظات</h3>
                <p className="bg-gray-50 p-3 rounded">{selectedPurchase.description}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default Invoices;
