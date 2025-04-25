
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  PlusCircle,
  Trash2
} from "lucide-react";
import { Product } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { fetchProducts, updateProduct, deleteProduct } from "@/services/supabase/productService";
import { checkLowStockProducts, showLowStockToasts } from "@/services/notificationService";

export default function InventoryManagement() {
  const [inventory, setInventory] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isAddStockDialogOpen, setIsAddStockDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [stockToAdd, setStockToAdd] = useState(0);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const navigate = useNavigate();
  
  useEffect(() => {
    loadProducts();
    
    // Check for low stock and display notifications
    const checkStock = async () => {
      await checkLowStockProducts();
      showLowStockToasts();
    };
    
    checkStock();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const products = await fetchProducts();
      setInventory(products);
    } catch (error) {
      console.error("Error loading products:", error);
      toast.error("حدث خطأ أثناء تحميل المنتجات");
    } finally {
      setLoading(false);
    }
  };
  
  const filteredInventory = inventory.filter(product => 
    (product.name && product.name.toLowerCase().includes(search.toLowerCase())) || 
    (product.barcode && product.barcode.toString().includes(search))
  );

  // Products with low stock (less than 10 units)
  const lowStockProducts = inventory.filter(product => (product.quantity || 0) < 10);
  
  const handleAddStock = async () => {
    if (selectedProduct && stockToAdd > 0) {
      setLoading(true);
      try {
        const updatedProduct = {
          ...selectedProduct,
          quantity: (selectedProduct.quantity || 0) + stockToAdd
        };
        
        await updateProduct(selectedProduct.id, updatedProduct);
        
        setInventory(inventory.map(product => 
          product.id === selectedProduct.id 
            ? { ...product, quantity: (product.quantity || 0) + stockToAdd } 
            : product
        ));
        
        toast.success(`تم إضافة ${stockToAdd} وحدات إلى المخزون`);
        
        setIsAddStockDialogOpen(false);
        setStockToAdd(0);
        setSelectedProduct(null);
      } catch (error) {
        console.error("Error updating stock:", error);
        toast.error("حدث خطأ أثناء تحديث المخزون");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDeleteProduct = async () => {
    if (!productToDelete) return;
    
    setLoading(true);
    try {
      await deleteProduct(productToDelete.id);
      toast.success("تم حذف المنتج بنجاح");
      setIsDeleteDialogOpen(false);
      setProductToDelete(null);
      loadProducts();
    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error("حدث خطأ أثناء حذف المنتج");
    } finally {
      setLoading(false);
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
          <Button variant="outline">
            <Download className="ml-2 h-4 w-4" />
            تصدير
          </Button>
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
                          {(product.quantity || 0) > 10 ? (
                            <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                              {product.quantity || 0} وحدة
                            </span>
                          ) : (product.quantity || 0) > 0 ? (
                            <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                              {product.quantity || 0} وحدة
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                              غير متوفر
                            </span>
                          )}
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
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setProductToDelete(product);
                                setIsDeleteDialogOpen(true);
                              }}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
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

      {/* Delete Product Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف المنتج</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من أنك تريد حذف منتج "{productToDelete?.name}"؟
              <br />
              هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteProduct}
              className="bg-red-500 hover:bg-red-600"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  جاري الحذف...
                </>
              ) : (
                "حذف المنتج"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
