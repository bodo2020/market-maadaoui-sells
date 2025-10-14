import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  AlertCircle,
  History,
  Save,
  Scan,
  Search,
  BarChart3
} from "lucide-react";
import { fetchProducts } from "@/services/supabase/productService";
import { 
  createInventoryRecords,
  updateInventoryRecord,
  fetchInventoryRecordsByDate,
  completeInventorySession,
  completeInventorySessionByDate,
  InventoryRecord
} from "@/services/supabase/inventoryService";
import { Product } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import * as XLSX from 'exceljs';
import BarcodeScanner from "@/components/POS/BarcodeScanner";
import { supabase } from "@/integrations/supabase/client";

export default function DailyInventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryRecords, setInventoryRecords] = useState<InventoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [inventoryType, setInventoryType] = useState<'daily' | 'full'>('daily');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchBarcode, setSearchBarcode] = useState('');
  const [filteredRecords, setFilteredRecords] = useState<InventoryRecord[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();
  // استخدم تاريخ UTC لضمان التطابق مع CURRENT_DATE في قاعدة البيانات
  const currentDate = new Date().toISOString().slice(0, 10);
  const getBranchId = () => (typeof window !== 'undefined' ? localStorage.getItem('currentBranchId') : null);

  useEffect(() => {
    loadInventoryData();
  }, []);

  useEffect(() => {
    // تصفية النتائج بناء على البحث بالباركود
    if (searchBarcode) {
      const filtered = inventoryRecords.filter(record => 
        record.products?.barcode?.includes(searchBarcode) ||
        record.products?.name?.toLowerCase().includes(searchBarcode.toLowerCase())
      );
      setFilteredRecords(filtered);
    } else {
      setFilteredRecords(inventoryRecords);
    }
  }, [searchBarcode, inventoryRecords]);

  const loadInventoryData = async () => {
    setLoading(true);
    try {
      const branchId = getBranchId();
      // التحقق من وجود جرد لليوم الحالي للفرع الحالي
      const existingRecords = await fetchInventoryRecordsByDate(currentDate, branchId || undefined);
      
      if (existingRecords.length > 0) {
        // إذا كان هناك جرد موجود، اعرضه
        setInventoryRecords(existingRecords);
      } else {
        // إنشاء جرد جديد لهذا الفرع
        await startNewInventory();
      }
    } catch (error) {
      console.error("Error loading inventory data:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحميل بيانات الجرد",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const startNewInventory = async (type: 'daily' | 'full' = 'daily') => {
    try {
      // الحصول على الفرع الحالي أولاً
      let branchId = getBranchId();
      if (!branchId) {
        const { data } = await supabase
          .from('branches')
          .select('id, name')
          .eq('active', true)
          .order('created_at', { ascending: true })
          .limit(1);
        branchId = data?.[0]?.id || null;
        if (branchId) {
          localStorage.setItem('currentBranchId', branchId);
          if (data?.[0]?.name) localStorage.setItem('currentBranchName', data[0].name);
        }
      }

      if (!branchId) {
        toast({
          title: "خطأ",
          description: "لم يتم العثور على فرع نشط",
          variant: "destructive"
        });
        return;
      }

      // جلب المنتجات من fetchProducts الذي يدمج البيانات من inventory و products
      const allProducts = await fetchProducts();
      
      if (!allProducts || allProducts.length === 0) {
        toast({
          title: "تحذير",
          description: "لا توجد منتجات في النظام",
          variant: "destructive"
        });
        return;
      }

      let selectedProducts: Product[];
      
      if (type === 'full') {
        // جرد كامل - كل المنتجات
        selectedProducts = allProducts;
        setInventoryType('full');
        navigate('/inventory-full');
        return;
      } else {
        // جرد يومي - اختيار عشوائي
        const randomCount = Math.min(
          Math.floor(Math.random() * 6) + 10, 
          allProducts.length
        );
        const shuffled = [...allProducts].sort(() => 0.5 - Math.random());
        selectedProducts = shuffled.slice(0, randomCount);
        setInventoryType('daily');
      }
      
      const inventoryData = selectedProducts.map(product => ({
        product_id: product.id,
        expected_quantity: product.quantity || 0,
        purchase_price: product.purchase_price || 0
      }));
      
      await createInventoryRecords(inventoryData, branchId);
      
      // إعادة تحميل البيانات
      const newRecords = await fetchInventoryRecordsByDate(currentDate, branchId);
      setInventoryRecords(newRecords);
      
      toast({
        title: "تم إنشاء جرد جديد",
        description: `تم اختيار ${selectedProducts.length} منتج للجرد من فرع ${localStorage.getItem('currentBranchName') || 'الحالي'}`,
      });
    } catch (error) {
      console.error("Error creating new inventory:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إنشاء الجرد الجديد",
        variant: "destructive"
      });
    }
  };

  const handleBarcodeScanned = (barcode: string) => {
    setSearchBarcode(barcode);
    setScannerOpen(false);
    
    // البحث عن المنتج والتمرير إليه - البحث بدقة أكبر
    const foundRecord = inventoryRecords.find(record => {
      const productBarcode = record.products?.barcode;
      // البحث الدقيق أولاً
      if (productBarcode === barcode) return true;
      // ثم البحث الجزئي
      if (productBarcode && productBarcode.includes(barcode)) return true;
      // أو إذا كان الباركود المطلوب جزء من باركود المنتج
      if (barcode.includes(productBarcode || '')) return true;
      return false;
    });
    
    if (foundRecord) {
      // التمرير إلى العنصر
      const element = document.getElementById(`record-${foundRecord.id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.style.backgroundColor = '#fef3c7';
        element.style.border = '2px solid #f59e0b';
        setTimeout(() => {
          element.style.backgroundColor = '';
          element.style.border = '';
        }, 3000);
      }
      
      // تركيز على حقل الإدخال للكمية الفعلية
      setTimeout(() => {
        const quantityInput = document.getElementById(`quantity-${foundRecord.id}`);
        if (quantityInput) {
          quantityInput.focus();
          (quantityInput as HTMLInputElement).select();
        }
      }, 500);
      
      toast({
        title: "تم العثور على المنتج",
        description: foundRecord.products?.name || 'منتج غير معروف',
      });
    } else {
      toast({
        title: "لم يتم العثور على المنتج",
        description: "هذا المنتج غير موجود في قائمة الجرد الحالية",
        variant: "destructive"
      });
    }
  };

  const handleQuantityChange = async (recordId: string, actualQuantity: number, notes?: string) => {
    setSaving(true);
    try {
      await updateInventoryRecord(recordId, { actual_quantity: actualQuantity, notes });
      
      // تحديث البيانات محلياً
      setInventoryRecords(prev => prev.map(record => {
        if (record.id === recordId) {
          const difference = actualQuantity - record.expected_quantity;
          const difference_value = difference * record.purchase_price;
          const status = difference === 0 ? 'checked' : 'discrepancy';
          
          return {
            ...record,
            actual_quantity: actualQuantity,
            difference,
            difference_value,
            status,
            notes
          };
        }
        return record;
      }));
      
      toast({
        title: "تم الحفظ",
        description: "تم حفظ كمية الجرد بنجاح",
      });
    } catch (error) {
      console.error("Error updating inventory record:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حفظ البيانات",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteInventory = async () => {
    setCompleting(true);
    try {
      // التحقق من أن جميع العناصر تم جردها
      const pendingItems = inventoryRecords.filter(record => record.status === 'pending').length;
      
      if (pendingItems > 0) {
        toast({
          title: "لا يمكن إكمال الجرد",
          description: `يوجد ${pendingItems} منتج لم يتم جرده بعد`,
          variant: "destructive"
        });
        return;
      }

      // إكمال الجرد بناءً على التاريخ
      await completeInventorySessionByDate(currentDate);
      
      toast({
        title: "تم إكمال الجرد",
        description: "تم تحديد الجرد كمكتمل ومتاح للموافقة",
      });

      // إعادة تحميل البيانات لتحديث الحالة
      await loadInventoryData();
    } catch (error) {
      console.error("Error completing inventory:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إكمال الجرد",
        variant: "destructive"
      });
    } finally {
      setCompleting(false);
    }
  };

  const exportToExcel = async () => {
    setExporting(true);
    try {
      const workbook = new XLSX.Workbook();
      const worksheet = workbook.addWorksheet('تقرير الجرد');

      // إعداد خصائص الصفحة للـ RTL
      worksheet.properties.defaultRowHeight = 25;
      worksheet.views = [{
        rightToLeft: true,
        showGridLines: true
      }];

      // إضافة العنوان الرئيسي
      const currentDate = format(new Date(), 'yyyy-MM-dd', { locale: ar });
      const inventoryTypeText = inventoryType === 'full' ? 'الكامل' : '';
      worksheet.mergeCells('A1:F3');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = `تقرير الجرد ${inventoryTypeText}\nتاريخ: ${currentDate}`;
      titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      titleCell.font = { size: 16, bold: true };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // إضافة رؤوس الأعمدة بترتيب RTL
      const headers = ['الحالة', 'الفرق', 'الكمية الفعلية', 'الكمية المتوقعة', 'الباركود', 'اسم المنتج'];
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

      // إضافة البيانات بترتيب RTL
      const completedItems = inventoryRecords.filter(record => record.status !== 'pending');
      completedItems.forEach((record, index) => {
        const row = worksheet.getRow(6 + index);
        const statusText = record.status === 'checked' ? 'مطابق' : 'يوجد اختلاف';
        
        // ترتيب البيانات من اليمين لليسار
        row.getCell(1).value = statusText; // الحالة
        row.getCell(2).value = record.difference; // الفرق
        row.getCell(3).value = record.actual_quantity; // الكمية الفعلية
        row.getCell(4).value = record.expected_quantity; // الكمية المتوقعة
        row.getCell(5).value = record.products?.barcode || '-'; // الباركود
        row.getCell(6).value = record.products?.name || ''; // اسم المنتج

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
          if (i === 1) { // عمود الحالة
            if (record.status === 'checked') {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0FFE0' }
              };
            } else if (record.status === 'discrepancy') {
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
      const checkedItems = completedItems.filter(record => record.status === 'checked').length;
      const discrepancyItems = completedItems.filter(record => record.status === 'discrepancy').length;
      const totalDiscrepancyValue = completedItems
        .filter(record => record.status === 'discrepancy')
        .reduce((sum, record) => sum + Math.abs(record.difference_value), 0);

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
        [`قيمة الفروقات: ${totalDiscrepancyValue.toFixed(2)} ج.م`],
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

      // تعيين عرض الأعمدة بترتيب RTL
      worksheet.getColumn(1).width = 15; // الحالة
      worksheet.getColumn(2).width = 10; // الفرق
      worksheet.getColumn(3).width = 15; // الكمية الفعلية
      worksheet.getColumn(4).width = 15; // الكمية المتوقعة
      worksheet.getColumn(5).width = 15; // الباركود
      worksheet.getColumn(6).width = 25; // اسم المنتج

      // تصدير الملف
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `تقرير_الجرد_${inventoryTypeText}_${currentDate}.xlsx`;
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

  const completedItems = inventoryRecords.filter(record => record.status !== 'pending').length;
  const totalItems = inventoryRecords.length;
  const matchedItems = inventoryRecords.filter(record => record.status === 'checked').length;
  const discrepancyItems = inventoryRecords.filter(record => record.status === 'discrepancy').length;
  const discrepancyValue = inventoryRecords
    .filter(record => record.status === 'discrepancy')
    .reduce((sum, record) => sum + Math.abs(record.difference_value), 0);
  
  // التحقق من إكمال الجرد
  const allItemsCompleted = totalItems > 0 && completedItems === totalItems;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4 space-x-reverse">
            <Package className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">الجرد</h1>
              <p className="text-muted-foreground">
                {format(new Date(), 'eeee، d MMMM yyyy', { locale: ar })}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => navigate('/inventory-history')}
            >
              <History className="ml-2 h-4 w-4" />
              سجل الجرد
            </Button>
            
            <Button 
              variant="outline" 
              onClick={() => startNewInventory('daily')}
              disabled={loading}
            >
              <RefreshCw className={`ml-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              جرد يومي
            </Button>
            
            <Button 
              variant="outline" 
              onClick={() => startNewInventory('full')}
              disabled={loading}
            >
              <BarChart3 className={`ml-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              جرد كامل
            </Button>
            
            {/* زر إكمال الجرد */}
            {allItemsCompleted && (
              <Button 
                onClick={handleCompleteInventory}
                disabled={completing}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className={`ml-2 h-4 w-4 ${completing ? 'animate-spin' : ''}`} />
                {completing ? 'جاري الإكمال...' : 'إكمال الجرد'}
              </Button>
            )}
            
            <Button 
              onClick={exportToExcel}
              disabled={exporting || completedItems === 0}
              variant="outline"
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
              <CardTitle className="text-sm font-medium">تم الجرد</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{completedItems}</div>
              <p className="text-xs text-muted-foreground">من {totalItems} منتج</p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all" 
                  style={{ width: `${totalItems ? (completedItems / totalItems) * 100 : 0}%` }}
                ></div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">مطابق</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{matchedItems}</div>
              <p className="text-xs text-muted-foreground">منتج مطابق</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">يوجد اختلاف</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{discrepancyItems}</div>
              <p className="text-xs text-muted-foreground">قيمة الفروقات: {discrepancyValue.toFixed(2)} ج.م</p>
            </CardContent>
          </Card>
        </div>

        {/* تنبيه إكمال الجرد */}
        {allItemsCompleted && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 space-x-reverse">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800">تم الانتهاء من جرد جميع المنتجات</p>
                    <p className="text-sm text-green-600">يمكنك الآن إكمال الجرد لإتاحته للموافقة</p>
                  </div>
                </div>
                <Button 
                  onClick={handleCompleteInventory}
                  disabled={completing}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className={`ml-2 h-4 w-4 ${completing ? 'animate-spin' : ''}`} />
                  {completing ? 'جاري الإكمال...' : 'إكمال الجرد'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <Calendar className="ml-2 h-5 w-5" />
                منتجات الجرد {inventoryType === 'full' ? 'الكامل' : ''}
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setScannerOpen(true)}
                >
                  <Scan className="ml-2 h-4 w-4" />
                  مسح باركود
                </Button>
                
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  <Input
                    placeholder="البحث بالباركود أو اسم المنتج..."
                    value={searchBarcode}
                    onChange={(e) => setSearchBarcode(e.target.value)}
                    className="w-64"
                  />
                </div>
              </div>
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
                      <TableHead>موقع الرف</TableHead>
                      <TableHead>الكمية المتوقعة</TableHead>
                      <TableHead>الكمية الفعلية</TableHead>
                      <TableHead>الفرق</TableHead>
                      <TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((record) => (
                      <TableRow key={record.id} id={`record-${record.id}`}>
                        <TableCell>
                          <div className="flex items-center space-x-3 space-x-reverse">
                            <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center">
                              <img 
                                src={record.products?.image_urls?.[0] || "/placeholder.svg"} 
                                alt={record.products?.name}
                                className="h-6 w-6 object-contain"
                              />
                            </div>
                            <div>
                              <div className="font-medium">{record.products?.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {record.products?.unit_of_measure || 'قطعة'}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{record.products?.barcode || '-'}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-md">
                            {record.products?.shelf_location || 'غير محدد'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{record.expected_quantity}</span>
                        </TableCell>
                        <TableCell>
                          <div className="w-20">
                            <Input
                              id={`quantity-${record.id}`}
                              type="number"
                              min="0"
                              placeholder="الكمية"
                              value={record.actual_quantity || ''}
                              onChange={(e) => 
                                handleQuantityChange(record.id, parseInt(e.target.value) || 0)
                              }
                              className="text-center"
                              disabled={saving}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-center">
                            <span className={`font-medium ${
                              record.difference === 0 
                                ? 'text-green-600' 
                                : record.difference > 0 
                                  ? 'text-blue-600' 
                                  : 'text-red-600'
                            }`}>
                              {record.difference > 0 ? '+' : ''}{record.difference}
                            </span>
                            {record.difference !== 0 && (
                              <div className="text-xs text-muted-foreground">
                                {Math.abs(record.difference_value).toFixed(2)} ج.م
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2 space-x-reverse">
                            {getStatusIcon(record.status)}
                            <span className={`text-sm ${getStatusColor(record.status)}`}>
                              {record.status === 'checked' && 'مطابق'}
                              {record.status === 'discrepancy' && 'اختلاف'}
                              {record.status === 'pending' && 'في الانتظار'}
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
      
      <BarcodeScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleBarcodeScanned}
      />
    </MainLayout>
  );
}
