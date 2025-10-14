import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  ArrowLeft,
  Save,
  Scan,
  Search,
  CheckCircle,
  AlertCircle,
  Package
} from "lucide-react";
import { fetchProducts } from "@/services/supabase/productService";
import { 
  createInventoryRecords,
  updateInventoryRecord,
  fetchInventoryRecordsByDate,
  completeInventorySessionByDate,
  InventoryRecord
} from "@/services/supabase/inventoryService";
import { Product } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import BarcodeScanner from "@/components/POS/BarcodeScanner";
import { supabase } from "@/integrations/supabase/client";

export default function InventoryFullPage() {
  const [inventoryRecords, setInventoryRecords] = useState<InventoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchBarcode, setSearchBarcode] = useState('');
  const [filteredRecords, setFilteredRecords] = useState<InventoryRecord[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();
  const currentDate = new Date().toISOString().slice(0, 10);
  const getBranchId = () => (typeof window !== 'undefined' ? localStorage.getItem('currentBranchId') : null);

  useEffect(() => {
    loadInventoryData();
  }, []);

  useEffect(() => {
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
      const existingRecords = await fetchInventoryRecordsByDate(currentDate, branchId || undefined);
      
      if (existingRecords.length > 0) {
        setInventoryRecords(existingRecords);
      } else {
        await startFullInventory();
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

  const startFullInventory = async () => {
    try {
      // الحصول على الفرع الحالي
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

      // جلب جميع المنتجات باستخدام fetchProducts
      const allProducts = await fetchProducts();
      
      if (!allProducts || allProducts.length === 0) {
        toast({
          title: "تحذير",
          description: "لا توجد منتجات في النظام",
          variant: "destructive"
        });
        return;
      }

      const inventoryData = allProducts.map(product => ({
        product_id: product.id,
        expected_quantity: product.quantity || 0,
        purchase_price: product.purchase_price || 0
      }));
      
      await createInventoryRecords(inventoryData, branchId);
      
      const newRecords = await fetchInventoryRecordsByDate(currentDate, branchId);
      setInventoryRecords(newRecords);
      
      toast({
        title: "تم إنشاء الجرد الكامل",
        description: `تم إنشاء جرد لـ ${allProducts.length} منتج من فرع ${localStorage.getItem('currentBranchName') || 'الحالي'}`,
      });
    } catch (error) {
      console.error("Error creating full inventory:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إنشاء الجرد",
        variant: "destructive"
      });
    }
  };

  const handleBarcodeScanned = (barcode: string) => {
    setSearchBarcode(barcode);
    setScannerOpen(false);
    
    const foundRecord = inventoryRecords.find(record => {
      const productBarcode = record.products?.barcode;
      if (productBarcode === barcode) return true;
      if (productBarcode && productBarcode.includes(barcode)) return true;
      if (barcode.includes(productBarcode || '')) return true;
      return false;
    });
    
    if (foundRecord) {
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
        description: "هذا المنتج غير موجود في قائمة الجرد",
        variant: "destructive"
      });
    }
  };

  const handleQuantityChange = async (recordId: string, actualQuantity: number, notes?: string) => {
    setSaving(true);
    try {
      await updateInventoryRecord(recordId, { actual_quantity: actualQuantity, notes });
      
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
      const pendingItems = inventoryRecords.filter(record => record.status === 'pending').length;
      
      if (pendingItems > 0) {
        toast({
          title: "لا يمكن إكمال الجرد",
          description: `يوجد ${pendingItems} منتج لم يتم جرده بعد`,
          variant: "destructive"
        });
        return;
      }

      const branchId = getBranchId();
      await completeInventorySessionByDate(currentDate, branchId || undefined);
      
      toast({
        title: "تم إكمال الجرد",
        description: "تم تحديد الجرد كمكتمل ومتاح للموافقة",
      });

      navigate('/inventory-history');
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

  const totalProducts = inventoryRecords.length;
  const completedProducts = inventoryRecords.filter(r => r.status !== 'pending').length;
  const matchedProducts = inventoryRecords.filter(r => r.status === 'checked').length;
  const discrepancyProducts = inventoryRecords.filter(r => r.status === 'discrepancy').length;

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-[60vh]">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4 space-x-reverse">
            <Button 
              variant="outline" 
              onClick={() => navigate('/daily-inventory')}
            >
              <ArrowLeft className="ml-2 h-4 w-4" />
              العودة
            </Button>
            <Package className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">الجرد الكامل</h1>
              <p className="text-muted-foreground">
                {format(new Date(), 'eeee، d MMMM yyyy', { locale: ar })}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button
              onClick={() => setScannerOpen(true)}
              variant="outline"
            >
              <Scan className="ml-2 h-4 w-4" />
              مسح الباركود
            </Button>
            
            <Button
              onClick={handleCompleteInventory}
              disabled={completing || completedProducts < totalProducts}
              variant="default"
            >
              <Save className="ml-2 h-4 w-4" />
              {completing ? 'جاري الإكمال...' : 'إكمال الجرد'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">إجمالي المنتجات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalProducts}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">تم الجرد</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{completedProducts}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">مطابق</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{matchedProducts}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">اختلاف</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{discrepancyProducts}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>كل المنتجات</CardTitle>
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث بالباركود أو الاسم..."
                  value={searchBarcode}
                  onChange={(e) => setSearchBarcode(e.target.value)}
                  className="w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>اسم المنتج</TableHead>
                    <TableHead>الباركود</TableHead>
                    <TableHead>الكمية المتوقعة</TableHead>
                    <TableHead>الكمية الفعلية</TableHead>
                    <TableHead>الفرق</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>ملاحظات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((record) => (
                    <TableRow key={record.id} id={`record-${record.id}`}>
                      <TableCell className="font-medium">
                        {record.products?.name}
                      </TableCell>
                      <TableCell>{record.products?.barcode}</TableCell>
                      <TableCell>{record.expected_quantity}</TableCell>
                      <TableCell>
                        <Input
                          id={`quantity-${record.id}`}
                          type="number"
                          value={record.actual_quantity}
                          onChange={(e) => handleQuantityChange(
                            record.id, 
                            parseInt(e.target.value) || 0,
                            record.notes
                          )}
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell className={
                        record.difference > 0 ? 'text-green-600' : 
                        record.difference < 0 ? 'text-red-600' : ''
                      }>
                        {record.difference > 0 ? '+' : ''}{record.difference}
                      </TableCell>
                      <TableCell>
                        <div className={`flex items-center space-x-2 space-x-reverse ${getStatusColor(record.status)}`}>
                          {getStatusIcon(record.status)}
                          <span className="text-sm">
                            {record.status === 'checked' ? 'مطابق' : 
                             record.status === 'discrepancy' ? 'اختلاف' : 'معلق'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="ملاحظات..."
                          value={record.notes || ''}
                          onChange={(e) => handleQuantityChange(
                            record.id,
                            record.actual_quantity,
                            e.target.value
                          )}
                          className="w-32"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
