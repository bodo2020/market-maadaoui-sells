
import { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  FileDown, 
  RefreshCw, 
  Package, 
  Calendar,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { fetchProducts } from "@/services/supabase/productService";
import { Product } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import * as XLSX from 'exceljs';

interface InventoryItem extends Product {
  actualQuantity?: number;
  difference?: number;
  status?: 'pending' | 'checked' | 'discrepancy';
}

export default function DailyInventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadRandomProducts();
  }, []);

  const loadRandomProducts = async () => {
    setLoading(true);
    try {
      const allProducts = await fetchProducts();
      // اختيار 10-15 منتج عشوائي للجرد اليومي
      const randomCount = Math.floor(Math.random() * 6) + 10; // 10 إلى 15 منتج
      const shuffled = allProducts.sort(() => 0.5 - Math.random());
      const selectedProducts = shuffled.slice(0, randomCount);
      
      const inventoryData = selectedProducts.map(product => ({
        ...product,
        status: 'pending' as const
      }));
      
      setProducts(allProducts);
      setInventoryItems(inventoryData);
    } catch (error) {
      console.error("Error loading products:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحميل المنتجات",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = (productId: string, actualQuantity: number) => {
    setInventoryItems(prev => prev.map(item => {
      if (item.id === productId) {
        const expectedQuantity = item.quantity || 0;
        const difference = actualQuantity - expectedQuantity;
        const status = difference === 0 ? 'checked' : 'discrepancy';
        
        return {
          ...item,
          actualQuantity,
          difference,
          status
        };
      }
      return item;
    }));
  };

  const exportToExcel = async () => {
    setExporting(true);
    try {
      const workbook = new XLSX.Workbook();
      const worksheet = workbook.addWorksheet('تقرير الجرد اليومي');

      // إعداد خصائص الصفحة
      worksheet.properties.defaultRowHeight = 25;
      worksheet.properties.rightToLeft = true;

      // إضافة العنوان الرئيسي
      const currentDate = format(new Date(), 'yyyy-MM-dd', { locale: ar });
      worksheet.mergeCells('A1:F3');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = `تقرير الجرد اليومي\nتاريخ: ${currentDate}`;
      titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      titleCell.font = { size: 16, bold: true };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // إضافة رؤوس الأعمدة
      const headers = ['اسم المنتج', 'الباركود', 'الكمية المتوقعة', 'الكمية الفعلية', 'الفرق', 'الحالة'];
      const headerRow = worksheet.getRow(5);
      headers.forEach((header, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = header;
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD0D0D0' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // إضافة البيانات
      const completedItems = inventoryItems.filter(item => item.status !== 'pending');
      completedItems.forEach((item, index) => {
        const row = worksheet.getRow(6 + index);
        const statusText = item.status === 'checked' ? 'مطابق' : 'يوجد اختلاف';
        
        row.getCell(1).value = item.name;
        row.getCell(2).value = item.barcode || '-';
        row.getCell(3).value = item.quantity || 0;
        row.getCell(4).value = item.actualQuantity || 0;
        row.getCell(5).value = item.difference || 0;
        row.getCell(6).value = statusText;

        // تنسيق الصفوف
        for (let i = 1; i <= 6; i++) {
          const cell = row.getCell(i);
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };

          // تلوين خلايا الحالة
          if (i === 6) {
            if (item.status === 'checked') {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0FFE0' }
              };
            } else if (item.status === 'discrepancy') {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFE0E0' }
              };
            }
          }
        }
      });

      // إضافة ملخص الجرد
      const summaryStartRow = 8 + completedItems.length;
      const totalItems = completedItems.length;
      const checkedItems = completedItems.filter(item => item.status === 'checked').length;
      const discrepancyItems = completedItems.filter(item => item.status === 'discrepancy').length;

      worksheet.mergeCells(`A${summaryStartRow}:F${summaryStartRow}`);
      const summaryTitleCell = worksheet.getCell(`A${summaryStartRow}`);
      summaryTitleCell.value = 'ملخص الجرد';
      summaryTitleCell.font = { size: 14, bold: true };
      summaryTitleCell.alignment = { horizontal: 'center' };
      summaryTitleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF0F0F0' }
      };

      const summaryData = [
        [`إجمالي المنتجات المجردة: ${totalItems}`],
        [`المنتجات المطابقة: ${checkedItems}`],
        [`المنتجات بها اختلاف: ${discrepancyItems}`],
        [`تاريخ ووقت التصدير: ${format(new Date(), 'yyyy-MM-dd HH:mm', { locale: ar })}`]
      ];

      summaryData.forEach((data, index) => {
        const row = worksheet.getRow(summaryStartRow + 1 + index);
        worksheet.mergeCells(`A${summaryStartRow + 1 + index}:F${summaryStartRow + 1 + index}`);
        const cell = row.getCell(1);
        cell.value = data[0];
        cell.alignment = { horizontal: 'right' };
        cell.font = { size: 11 };
      });

      // تعيين عرض الأعمدة
      worksheet.getColumn(1).width = 25; // اسم المنتج
      worksheet.getColumn(2).width = 15; // الباركود
      worksheet.getColumn(3).width = 15; // الكمية المتوقعة
      worksheet.getColumn(4).width = 15; // الكمية الفعلية
      worksheet.getColumn(5).width = 10; // الفرق
      worksheet.getColumn(6).width = 15; // الحالة

      // تصدير الملف
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `تقرير_الجرد_${currentDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "تم التصدير بنجاح",
        description: "تم تصدير تقرير الجرد إلى ملف Excel",
      });
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      toast({
        title: "خطأ في التصدير",
        description: "حدث خطأ أثناء تصدير التقرير",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'checked': return 'text-green-600';
      case 'discrepancy': return 'text-red-600';
      default: return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'checked': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'discrepancy': return <AlertCircle className="h-4 w-4 text-red-600" />;
      default: return null;
    }
  };

  const completedItems = inventoryItems.filter(item => item.status !== 'pending').length;
  const totalItems = inventoryItems.length;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4 space-x-reverse">
            <Package className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">الجرد اليومي</h1>
              <p className="text-muted-foreground">
                {format(new Date(), 'eeee، d MMMM yyyy', { locale: ar })}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={loadRandomProducts}
              disabled={loading}
            >
              <RefreshCw className={`ml-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              جرد جديد
            </Button>
            
            <Button 
              onClick={exportToExcel}
              disabled={exporting || completedItems === 0}
            >
              <FileDown className="ml-2 h-4 w-4" />
              {exporting ? 'جاري التصدير...' : 'تصدير لملف Excel'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">إجمالي المنتجات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalItems}</div>
              <p className="text-xs text-muted-foreground">منتج للجرد اليوم</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">تم الجرد</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{completedItems}</div>
              <p className="text-xs text-muted-foreground">من {totalItems} منتج</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">مطابق</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {inventoryItems.filter(item => item.status === 'checked').length}
              </div>
              <p className="text-xs text-muted-foreground">منتج مطابق للنظام</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">يحتاج مراجعة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {inventoryItems.filter(item => item.status === 'discrepancy').length}
              </div>
              <p className="text-xs text-muted-foreground">منتج به اختلاف</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="ml-2 h-5 w-5" />
              منتجات الجرد اليومي
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center p-12">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المنتج</TableHead>
                      <TableHead>الباركود</TableHead>
                      <TableHead>الكمية المتوقعة</TableHead>
                      <TableHead>الكمية الفعلية</TableHead>
                      <TableHead>الفرق</TableHead>
                      <TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center space-x-3 space-x-reverse">
                            <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center">
                              <img 
                                src={item.image_urls?.[0] || "/placeholder.svg"} 
                                alt={item.name}
                                className="h-6 w-6 object-contain"
                              />
                            </div>
                            <div>
                              <div className="font-medium">{item.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {item.unit_of_measure || 'قطعة'}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{item.barcode || '-'}</TableCell>
                        <TableCell>
                          <span className="font-medium">{item.quantity || 0}</span>
                        </TableCell>
                        <TableCell>
                          <div className="w-20">
                            <Input
                              type="number"
                              min="0"
                              placeholder="الكمية"
                              value={item.actualQuantity || ''}
                              onChange={(e) => 
                                handleQuantityChange(item.id, parseInt(e.target.value) || 0)
                              }
                              className="text-center"
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.difference !== undefined && (
                            <span className={`font-medium ${
                              item.difference === 0 
                                ? 'text-green-600' 
                                : item.difference > 0 
                                  ? 'text-blue-600' 
                                  : 'text-red-600'
                            }`}>
                              {item.difference > 0 ? '+' : ''}{item.difference}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2 space-x-reverse">
                            {getStatusIcon(item.status || 'pending')}
                            <span className={`text-sm ${getStatusColor(item.status || 'pending')}`}>
                              {item.status === 'checked' && 'مطابق'}
                              {item.status === 'discrepancy' && 'اختلاف'}
                              {item.status === 'pending' && 'في الانتظار'}
                            </span>
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
      </div>
    </MainLayout>
  );
}
