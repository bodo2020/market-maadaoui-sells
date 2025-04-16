import { useState } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Search, 
  Plus, 
  Package, 
  AlertTriangle,
  Filter,
  Download,
  Truck
} from "lucide-react";
import { products } from "@/data/mockData";
import { Product } from "@/types";

export default function InventoryManagement() {
  const [inventory, setInventory] = useState<Product[]>(products);
  const [search, setSearch] = useState("");
  const [isAddStockDialogOpen, setIsAddStockDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [stockToAdd, setStockToAdd] = useState(0);
  
  const filteredInventory = inventory.filter(product => 
    product.name.includes(search) || 
    product.barcode.includes(search)
  );

  // Products with low stock (less than 10 units)
  const lowStockProducts = inventory.filter(product => product.quantity < 10);
  
  const handleAddStock = () => {
    if (selectedProduct && stockToAdd > 0) {
      setInventory(inventory.map(product => 
        product.id === selectedProduct.id 
          ? { ...product, quantity: product.quantity + stockToAdd } 
          : product
      ));
      setIsAddStockDialogOpen(false);
      setStockToAdd(0);
      setSelectedProduct(null);
    }
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
          >
            <Truck className="ml-2 h-4 w-4" />
            إضافة مخزون
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
              {inventory.reduce((total, product) => total + product.quantity, 0)}
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
              {inventory.reduce((total, product) => total + (product.purchasePrice * product.quantity), 0).toFixed(2)} {siteConfig.currency}
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
                            src={product.imageUrls[0]} 
                            alt={product.name}
                            className="h-6 w-6 object-contain"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.barcode}</TableCell>
                      <TableCell>
                        <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                          {product.quantity} وحدة
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button 
                          size="sm" 
                          onClick={() => {
                            setSelectedProduct(product);
                            setStockToAdd(0);
                            setIsAddStockDialogOpen(true);
                          }}
                        >
                          <Plus className="ml-2 h-4 w-4" />
                          إضافة مخزون
                        </Button>
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
                {filteredInventory.map(product => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center">
                        <img 
                          src={product.imageUrls[0]} 
                          alt={product.name}
                          className="h-6 w-6 object-contain"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.barcode}</TableCell>
                    <TableCell>{product.purchasePrice} {siteConfig.currency}</TableCell>
                    <TableCell>
                      {product.quantity > 10 ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                          {product.quantity} وحدة
                        </span>
                      ) : product.quantity > 0 ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                          {product.quantity} وحدة
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                          غير متوفر
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(product.purchasePrice * product.quantity).toFixed(2)} {siteConfig.currency}
                    </TableCell>
                    <TableCell>
                      {product.updated_at.toLocaleDateString('ar-EG')}
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setSelectedProduct(product);
                          setStockToAdd(0);
                          setIsAddStockDialogOpen(true);
                        }}
                      >
                        <Plus className="ml-2 h-4 w-4" />
                        إضافة
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
          <div className="grid gap-4 py-4">
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
                    src={selectedProduct.imageUrls[0]} 
                    alt={selectedProduct.name}
                    className="h-8 w-8 object-contain"
                  />
                </div>
                <div>
                  <h4 className="font-medium">{selectedProduct.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    المخزون الحالي: {selectedProduct.quantity} وحدة
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
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="purchasePrice">سعر الشراء للوحدة</Label>
              <Input 
                id="purchasePrice" 
                type="number" 
                min="0"
                defaultValue={selectedProduct?.purchasePrice}
                disabled
              />
            </div>
            
            {selectedProduct && stockToAdd > 0 && (
              <div className="p-3 bg-primary/10 rounded-md">
                <p className="text-sm">
                  إجمالي التكلفة: {(selectedProduct.purchasePrice * stockToAdd).toFixed(2)} {siteConfig.currency}
                </p>
                <p className="text-sm">
                  المخزون بعد الإضافة: {selectedProduct.quantity + stockToAdd} وحدة
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              type="submit" 
              onClick={handleAddStock}
              disabled={!selectedProduct || stockToAdd <= 0}
            >
              إضافة المخزون
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
