
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

export default function InventoryManagement() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isAddStockDialogOpen, setIsAddStockDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [stockToAdd, setStockToAdd] = useState(0);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  useEffect(() => {
    loadProducts();
    
    // Check for low stock and display notifications
    const checkStock = async () => {
      await checkLowStockProducts();
      showLowStockToasts();
    };
    
    checkStock();
  }, []);

  // Add effect to reload data when returning from edit page
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadProducts();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      // Load inventory data with alerts
      const inventoryData = await fetchInventoryWithAlerts();
      
      setInventory(inventoryData.all);
      setLowStockProducts(inventoryData.lowStock);
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
        const updatedProduct = {
          ...selectedProduct,
          quantity: (selectedProduct.quantity || 0) + stockToAdd
        };
        
        await updateProduct(selectedProduct.id, updatedProduct);
        
        // Reload data to get updated inventory alerts
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
  
  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">إدارة المخزون</h1>
        <div className="flex gap-2">
          <Button variant="outline">
            <Filter className="ml-2 h-4 w-4" />
            تصفية
          </Button>
          {(user?.role === 'admin' || user?.role === 'super_admin') && (
            <Button variant="outline">
              <Download className="ml-2 h-4 w-4" />
              تصدير
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
                    <TableHead>سعر الشراء</TableHead>
                    <TableHead>المخزون</TableHead>
                    <TableHead>القيمة</TableHead>
                    <TableHead>آخر تحديث</TableHead>
                    <TableHead className="text-left">الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
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
