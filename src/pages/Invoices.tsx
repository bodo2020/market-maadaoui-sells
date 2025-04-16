
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchSales } from '@/services/supabase/saleService';
import { Sale } from '@/types';
import { FileText, Edit, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MainLayout from '@/components/layout/MainLayout';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import InvoiceEditDialog from '@/components/Invoice/InvoiceEditDialog';
import InvoicePreviewDialog from '@/components/POS/InvoiceDialog';

const Invoices = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);

  // Fetch all sales
  const { data: sales, isLoading, isError, refetch } = useQuery({
    queryKey: ['sales'],
    queryFn: fetchSales
  });

  // Filter sales based on search query
  const filteredSales = sales?.filter(sale => 
    sale.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (sale.customer_name && sale.customer_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleEdit = (sale: Sale) => {
    setSelectedSale(sale);
    setIsEditDialogOpen(true);
  };

  const handlePreview = (sale: Sale) => {
    setSelectedSale(sale);
    setIsPreviewDialogOpen(true);
  };

  const handleEditClose = () => {
    setIsEditDialogOpen(false);
    refetch(); // Refresh data after edit
  };

  const handlePreviewClose = () => {
    setIsPreviewDialogOpen(false);
  };

  return (
    <MainLayout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">إدارة الفواتير</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>بحث الفواتير</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="ابحث عن رقم الفاتورة أو اسم العميل..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md"
            />
          </CardContent>
        </Card>

        <Tabs defaultValue="all" className="w-full">
          <TabsList>
            <TabsTrigger value="all">جميع الفواتير</TabsTrigger>
            <TabsTrigger value="today">اليوم</TabsTrigger>
            <TabsTrigger value="week">هذا الأسبوع</TabsTrigger>
          </TabsList>
          
          <TabsContent value="all" className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8">جاري التحميل...</div>
            ) : isError ? (
              <div className="text-center py-8 text-red-500">حدث خطأ أثناء تحميل الفواتير</div>
            ) : (
              <div className="overflow-x-auto">
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
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="today">
            {/* Similar content as "all" tab, but filtered for today */}
            <div className="py-8 text-center text-muted-foreground">
              قريباً - عرض فواتير اليوم
            </div>
          </TabsContent>
          
          <TabsContent value="week">
            {/* Similar content as "all" tab, but filtered for this week */}
            <div className="py-8 text-center text-muted-foreground">
              قريباً - عرض فواتير الأسبوع
            </div>
          </TabsContent>
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
    </MainLayout>
  );
};

export default Invoices;
