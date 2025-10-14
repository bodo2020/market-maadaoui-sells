
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Plus, 
  Package, 
  AlertTriangle,
  Filter,
  Download,
  Truck,
  Loader2,
  Bell,
  Edit,
  PlusCircle
} from "lucide-react";
import { Product } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { fetchProducts, updateProduct } from "@/services/supabase/productService";
import { checkLowStockProducts, showLowStockToasts } from "@/services/notificationService";
import { fetchInventoryWithAlerts } from "@/services/supabase/inventoryService";
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { supabase } from "@/integrations/supabase/client";

const getBranchId = () => (typeof window !== 'undefined' ? localStorage.getItem('currentBranchId') : null);

export default function InventoryManagement() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isAddStockDialogOpen, setIsAddStockDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [stockToAdd, setStockToAdd] = useState(0);
  const [branches, setBranches] = useState<any[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>("");
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    if (currentBranch) {
      loadProducts();
      
      // Check for low stock and display notifications
      const checkStock = async () => {
        await checkLowStockProducts();
        showLowStockToasts();
      };
      
      checkStock();
    }
  }, [currentBranch]);

  // Add effect to reload data when returning from edit page
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && currentBranch) {
        loadProducts();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentBranch]);

  const loadBranches = async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('active', true)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setBranches(data || []);
      
      // تعيين الفرع الحالي من localStorage أو أول فرع
      const savedBranchId = getBranchId();
      if (savedBranchId && data?.some(b => b.id === savedBranchId)) {
        setCurrentBranch(savedBranchId);
      } else if (data && data.length > 0) {
        setCurrentBranch(data[0].id);
        localStorage.setItem('currentBranchId', data[0].id);
        localStorage.setItem('currentBranchName', data[0].name);
      }
    } catch (error) {
      console.error("Error loading branches:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحميل الفروع",
        variant: "destructive"
      });
    }
  };

  const handleBranchChange = (branchId: string) => {
    setCurrentBranch(branchId);
    const branch = branches.find(b => b.id === branchId);
    if (branch) {
      localStorage.setItem('currentBranchId', branchId);
      localStorage.setItem('currentBranchName', branch.name);
    }
  };

  const loadProducts = async () => {
    setLoading(true);
    try {
      if (!currentBranch) return;

      // الخطوة 1: جلب جميع المنتجات (بدون فلترة)
      const { data: allProducts, error: productsError } = await supabase
        .from('products')
        .select(`
          id,
          name,
          barcode,
          price,
          purchase_price,
          image_urls,
          shelf_location,
          expiry_date,
          unit_of_measure
        `)
        .order('name');

      if (productsError) throw productsError;

      // الخطوة 2: جلب المخزون للفرع الحالي
      const { data: inventoryData, error: invError } = await supabase
        .from('inventory')
        .select('product_id, quantity')
        .eq('branch_id', currentBranch);

      if (invError) throw invError;

      // الخطوة 3: جلب إعدادات التنبيهات
      const { data: alertsData, error: alertsError } = await supabase
        .from('inventory_alerts')
        .select('product_id, min_stock_level, alert_enabled');

      if (alertsError) throw alertsError;

      // إنشاء Maps للوصول السريع
      const inventoryMap = new Map(inventoryData?.map(inv => [inv.product_id, inv.quantity]) || []);
      const alertsMap = new Map(alertsData?.map(a => [a.product_id, a]) || []);

      // دمج البيانات: جميع المنتجات مع الكمية من المخزون (0 إذا لم توجد)
      const formattedInventory = (allProducts || []).map(product => {
        const quantity = inventoryMap.get(product.id) || 0;
        const alert = alertsMap.get(product.id);
        
        return {
          id: product.id,
          name: product.name,
          barcode: product.barcode,
          price: product.price || 0,
          purchase_price: product.purchase_price || 0,
          quantity: quantity,
          image_urls: product.image_urls,
          shelf_location: product.shelf_location,
          expiry_date: product.expiry_date,
          unit_of_measure: product.unit_of_measure,
          inventory_alerts: alert,
          branch_id: currentBranch
        };
      });

      // فلترة المنتجات منخفضة المخزون
      const lowStock = formattedInventory.filter(product => {
        const alert = product.inventory_alerts;
        if (!alert || !alert.alert_enabled || !alert.min_stock_level) return false;
        return (product.quantity || 0) < alert.min_stock_level;
      });

      setInventory(formattedInventory);
      setLowStockProducts(lowStock);
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
  
  const filteredInventory = inventory.filter(product => 
    (product.name && product.name.toLowerCase().includes(search.toLowerCase())) || 
    (product.barcode && product.barcode.toString().includes(search))
  );

  
  const handleAddStock = async () => {
    if (selectedProduct && stockToAdd > 0) {
      setLoading(true);
      try {
        // تحديث أو إنشاء سجل المخزون
        const { error } = await supabase
          .from('inventory')
          .upsert({ 
            product_id: selectedProduct.id,
            branch_id: currentBranch,
            quantity: (selectedProduct.quantity || 0) + stockToAdd,
            updated_at: new Date().toISOString()
          }, { onConflict: 'product_id,branch_id' });

        if (error) throw error;
        
        // Reload data to get updated inventory
        await loadProducts();
        
        toast({
          title: "تم بنجاح",
          description: `تم إضافة ${stockToAdd} وحدات إلى المخزون`,
        });
        
        setIsAddStockDialogOpen(false);
        setStockToAdd(0);
        setSelectedProduct(null);
      } catch (error) {
        console.error("Error updating stock:", error);
        toast({
          title: "خطأ",
          description: "حدث خطأ أثناء تحديث المخزون",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleAddProduct = () => {
    navigate("/add-product");
  };

  const exportToExcel = async () => {
    try {
      setLoading(true);
      
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'نظام إدارة المتاجر';
      workbook.created = new Date();
      
      const worksheet = workbook.addWorksheet('جرد المنتجات');
      
      // إضافة العناوين
      worksheet.addRow([
        'اسم المنتج',
        'الباركود', 
        'سعر البيع',
        'سعر الشراء',
        'الكمية المتاحة',
        'القيمة الإجمالية',
        'موقع الرف',
        'تاريخ الصلاحية',
        'حالة المخزون'
      ]);
      
      // تنسيق العناوين
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };
      headerRow.alignment = { horizontal: 'center' };
      
      // إضافة البيانات
      inventory.forEach(product => {
        const quantity = product.quantity || 0;
        const purchasePrice = product.purchase_price || 0;
        const salePrice = product.price || 0;
        const totalValue = quantity * purchasePrice;
        
        // تحديد حالة المخزون
        let stockStatus = 'متوفر';
        if (quantity === 0) {
          stockStatus = 'غير متوفر';
        } else if (product.inventory_alerts?.alert_enabled && 
                   product.inventory_alerts?.min_stock_level && 
                   quantity < product.inventory_alerts.min_stock_level) {
          stockStatus = 'منخفض';
        }
        
        worksheet.addRow([
          product.name,
          product.barcode || '',
          salePrice,
          purchasePrice,
          quantity,
          totalValue,
          product.shelf_location || '',
          product.expiry_date ? new Date(product.expiry_date).toLocaleDateString('ar-EG') : '',
          stockStatus
        ]);
      });
      
      // تحديد عرض الأعمدة
      worksheet.columns = [
        { width: 30 }, // اسم المنتج
        { width: 15 }, // الباركود
        { width: 12 }, // سعر البيع
        { width: 12 }, // سعر الشراء
        { width: 12 }, // الكمية
        { width: 15 }, // القيمة الإجمالية
        { width: 15 }, // موقع الرف
        { width: 15 }, // تاريخ الصلاحية
        { width: 12 }  // حالة المخزون
      ];
      
      // إضافة مجموع في النهاية
      const totalProducts = inventory.length;
      const totalQuantity = inventory.reduce((sum, product) => sum + (product.quantity || 0), 0);
      const totalValue = inventory.reduce((sum, product) => sum + ((product.quantity || 0) * (product.purchase_price || 0)), 0);
      
      worksheet.addRow([]);
      worksheet.addRow(['المجموع الكلي:', '', '', '', totalQuantity, totalValue, '', '', `${totalProducts} منتج`]);
      
      // تنسيق صف المجموع
      const summaryRow = worksheet.getRow(worksheet.rowCount);
      summaryRow.font = { bold: true };
      summaryRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E7E6E6' } };
      
      // إنشاء الملف وحفظه
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const fileName = `جرد_المنتجات_${new Date().toISOString().split('T')[0]}.xlsx`;
      saveAs(blob, fileName);
      
      toast({
        title: "تم بنجاح",
        description: "تم تصدير بيانات المخزون إلى ملف Excel",
      });
      
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تصدير البيانات",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">إدارة المخزون</h1>
          {branches.length > 1 && (
            <div className="flex items-center gap-2">
              <Label>الفرع:</Label>
              <Select value={currentBranch} onValueChange={handleBranchChange}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="اختر الفرع" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map(branch => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Filter className="ml-2 h-4 w-4" />
            تصفية
          </Button>
          {(user?.role === 'admin' || user?.role === 'super_admin') && (
            <Button 
              variant="outline" 
              onClick={exportToExcel}
              disabled={loading || inventory.length === 0}
            >
              <Download className="ml-2 h-4 w-4" />
              تصدير Excel
            </Button>
          )}
          <Button 
            variant="default"
            onClick={() => {
              setSelectedProduct(null);
              setStockToAdd(0);
              setIsAddStockDialogOpen(true);
            }}
            disabled={loading}
          >
            <Truck className="ml-2 h-4 w-4" />
            إضافة مخزون
          </Button>
          <Button 
            variant="default" 
            onClick={handleAddProduct}
          >
            <PlusCircle className="ml-2 h-4 w-4" />
            إضافة منتج
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المنتجات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inventory.length}</div>
            <p className="text-xs text-muted-foreground">منتج مسجل في النظام</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي كمية المخزون</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {inventory.reduce((total, product) => total + (product.quantity || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">وحدة متوفرة في المخزون</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">قيمة المخزون</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {inventory.reduce((total, product) => total + (product.purchase_price * (product.quantity || 0)), 0).toFixed(2)} {siteConfig.currency}
            </div>
            <p className="text-xs text-muted-foreground">القيمة الإجمالية بسعر الشراء</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">منتجات منخفضة المخزون</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{lowStockProducts.length}</div>
            <p className="text-xs text-muted-foreground">منتجات تحتاج إلى تجديد المخزون</p>
          </CardContent>
        </Card>
      </div>
      
      {lowStockProducts.length > 0 && (
        <Card className="mb-6 border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-3">
            <div className="flex items-center">
              <AlertTriangle className="text-yellow-500 ml-2 h-5 w-5" />
              <CardTitle>تنبيه المخزون المنخفض</CardTitle>
            </div>
            <CardDescription>
              المنتجات التالية تحتاج إلى تجديد المخزون
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">صورة</TableHead>
                    <TableHead>المنتج</TableHead>
                    <TableHead>الباركود</TableHead>
                    <TableHead>موقع الرف</TableHead>
                    <TableHead>المخزون الحالي</TableHead>
                    <TableHead>الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockProducts.map(product => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center">
                          <img 
                            src={product.image_urls ? product.image_urls[0] : "/placeholder.svg"} 
                            alt={product.name}
                            className="h-6 w-6 object-contain"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.barcode}</TableCell>
                      <TableCell>
                        {product.shelf_location ? (
                          <Badge variant="outline">{product.shelf_location}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">غير محدد</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                          {product.quantity || 0} وحدة
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => {
                              setSelectedProduct(product);
                              setStockToAdd(0);
                              setIsAddStockDialogOpen(true);
                            }}
                            disabled={loading}
                          >
                            <Plus className="ml-2 h-4 w-4" />
                            إضافة مخزون
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/add-product?id=${product.id}`)}
                          >
                            <Edit className="ml-2 h-4 w-4" />
                            تعديل
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
      
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>جميع المنتجات</CardTitle>
              <CardDescription>إدارة مخزون المنتجات</CardDescription>
            </div>
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6">
            <Input 
              placeholder="ابحث بالاسم أو الباركود" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Button variant="outline">
              <Search className="ml-2 h-4 w-4" />
              بحث
            </Button>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">صورة</TableHead>
                    <TableHead>المنتج</TableHead>
                    <TableHead>الباركود</TableHead>
                    <TableHead>موقع الرف</TableHead>
                    <TableHead>سعر الشراء</TableHead>
                    <TableHead>المخزون</TableHead>
                    <TableHead>القيمة</TableHead>
                    <TableHead>تاريخ الصلاحية</TableHead>
                    <TableHead>آخر تحديث</TableHead>
                    <TableHead className="text-left">الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        لا توجد منتجات مطابقة للبحث
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInventory.map(product => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center">
                            <img 
                              src={product.image_urls ? product.image_urls[0] : "/placeholder.svg"} 
                              alt={product.name}
                              className="h-6 w-6 object-contain"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>{product.barcode}</TableCell>
                        <TableCell>
                          {product.shelf_location ? (
                            <Badge variant="outline">{product.shelf_location}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">غير محدد</span>
                          )}
                        </TableCell>
                        <TableCell>{product.purchase_price} {siteConfig.currency}</TableCell>
                         <TableCell>
                           {(() => {
                             const alert = product.inventory_alerts;
                             const currentQuantity = product.quantity || 0;
                             const hasAlert = alert && alert.alert_enabled && alert.min_stock_level;
                             
                             if (currentQuantity === 0) {
                               return (
                                 <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                                   غير متوفر
                                 </span>
                               );
                             }
                             
                             if (hasAlert && currentQuantity < alert.min_stock_level) {
                               return (
                                 <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                                   {currentQuantity} وحدة (منخفض)
                                 </span>
                               );
                             }
                             
                             if (hasAlert && currentQuantity === alert.min_stock_level) {
                               return (
                                 <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                                   {currentQuantity} وحدة (حد أدنى)
                                 </span>
                               );
                             }
                             
                             return (
                               <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                                 {currentQuantity} وحدة
                               </span>
                             );
                           })()}
                         </TableCell>
                         <TableCell>
                           {(product.purchase_price * (product.quantity || 0)).toFixed(2)} {siteConfig.currency}
                         </TableCell>
                         <TableCell>
                           {product.expiry_date ? (
                             <Badge 
                               variant={
                                 new Date(product.expiry_date) < new Date() ? "destructive" :
                                 new Date(product.expiry_date) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) ? "secondary" :
                                 new Date(product.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) ? "default" : 
                                 "outline"
                               }
                             >
                               {new Date(product.expiry_date).toLocaleDateString('ar-EG')}
                             </Badge>
                           ) : (
                             <span className="text-muted-foreground text-sm">غير محدد</span>
                           )}
                         </TableCell>
                        <TableCell>
                          {typeof product.updated_at === 'string' 
                            ? new Date(product.updated_at).toLocaleDateString('ar-EG')
                            : product.updated_at
                              ? product.updated_at.toLocaleDateString('ar-EG')
                              : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                setSelectedProduct(product);
                                setStockToAdd(0);
                                setIsAddStockDialogOpen(true);
                              }}
                              disabled={loading}
                            >
                              <Plus className="ml-2 h-4 w-4" />
                              إضافة
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/add-product?id=${product.id}`)}
                            >
                              <Edit className="ml-2 h-4 w-4" />
                              تعديل
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Add Stock Dialog */}
      <Dialog open={isAddStockDialogOpen} onOpenChange={setIsAddStockDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>إضافة مخزون</DialogTitle>
            <DialogDescription>
              أدخل كمية المخزون المراد إضافتها
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="grid gap-4 py-4 px-1">
              {!selectedProduct ? (
                <div className="space-y-2">
                  <Label htmlFor="productSelect">اختر المنتج</Label>
                  <select 
                    id="productSelect"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2"
                    onChange={(e) => {
                      const product = inventory.find(p => p.id === e.target.value);
                      setSelectedProduct(product || null);
                    }}
                    disabled={loading}
                  >
                    <option value="">-- اختر المنتج --</option>
                    {inventory.map(product => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 border rounded-md">
                  <div className="h-12 w-12 rounded bg-gray-100 flex items-center justify-center">
                    <img 
                      src={selectedProduct.image_urls ? selectedProduct.image_urls[0] : "/placeholder.svg"} 
                      alt={selectedProduct.name}
                      className="h-8 w-8 object-contain"
                    />
                  </div>
                  <div>
                    <h4 className="font-medium">{selectedProduct.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      المخزون الحالي: {selectedProduct.quantity || 0} وحدة
                    </p>
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="stockAmount">الكمية المراد إضافتها</Label>
                <Input 
                  id="stockAmount" 
                  type="number" 
                  min="1"
                  value={stockToAdd}
                  onChange={(e) => setStockToAdd(parseInt(e.target.value) || 0)}
                  disabled={loading}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="purchasePrice">سعر الشراء للوحدة</Label>
                <Input 
                  id="purchasePrice" 
                  type="number" 
                  min="0"
                  defaultValue={selectedProduct?.purchase_price}
                  disabled
                />
              </div>
              
              {selectedProduct && stockToAdd > 0 && (
                <div className="p-3 bg-primary/10 rounded-md">
                  <p className="text-sm">
                    إجمالي التكلفة: {(selectedProduct.purchase_price * stockToAdd).toFixed(2)} {siteConfig.currency}
                  </p>
                  <p className="text-sm">
                    المخزون بعد الإضافة: {(selectedProduct.quantity || 0) + stockToAdd} وحدة
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button 
              type="submit" 
              onClick={handleAddStock}
              disabled={!selectedProduct || stockToAdd <= 0 || loading}
            >
              {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              إضافة المخزون
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
