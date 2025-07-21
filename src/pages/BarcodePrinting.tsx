
import React, { useState, useEffect } from 'react';
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Printer, QrCode, Package, Scale, Boxes } from "lucide-react";
import { Product } from "@/types";
import { fetchProducts } from "@/services/supabase/productService";
import { BarcodeGenerator } from "@/components/products/BarcodeGenerator";
import { toast } from "sonner";

interface ProductBarcode {
  type: 'normal' | 'bulk' | 'scale';
  label: string;
  barcode: string;
  icon: React.ComponentType<any>;
}

interface PrintItem {
  product: Product;
  barcodeType: 'normal' | 'bulk' | 'scale';
  quantity: number;
}

export default function BarcodePrinting() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [printQueue, setPrintQueue] = useState<PrintItem[]>([]);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (error) {
      console.error("Error loading products:", error);
      toast.error("حدث خطأ أثناء تحميل المنتجات");
    } finally {
      setLoading(false);
    }
  };

  const getProductBarcodes = (product: Product): ProductBarcode[] => {
    const barcodes: ProductBarcode[] = [];

    // Normal barcode
    if (product.barcode) {
      barcodes.push({
        type: 'normal',
        label: 'قطعة',
        barcode: product.barcode,
        icon: Package
      });
    }

    // Bulk barcode
    if (product.bulk_enabled && product.bulk_barcode) {
      barcodes.push({
        type: 'bulk',
        label: 'جملة',
        barcode: product.bulk_barcode,
        icon: Boxes
      });
    }

    // Scale barcode (for scale type products)
    if (product.barcode_type === 'scale' && product.barcode) {
      barcodes.push({
        type: 'scale',
        label: 'ميزان',
        barcode: product.barcode,
        icon: Scale
      });
    }

    return barcodes;
  };

  const addToPrintQueue = (product: Product, barcodeType: 'normal' | 'bulk' | 'scale', quantity: number) => {
    if (quantity <= 0) {
      toast.error("الكمية يجب أن تكون أكبر من صفر");
      return;
    }

    const existingItemIndex = printQueue.findIndex(
      item => item.product.id === product.id && item.barcodeType === barcodeType
    );

    if (existingItemIndex >= 0) {
      const updatedQueue = [...printQueue];
      updatedQueue[existingItemIndex].quantity += quantity;
      setPrintQueue(updatedQueue);
    } else {
      setPrintQueue([...printQueue, { product, barcodeType, quantity }]);
    }

    toast.success(`تم إضافة ${quantity} باركود إلى قائمة الطباعة`);
  };

  const removeFromPrintQueue = (productId: string, barcodeType: string) => {
    setPrintQueue(printQueue.filter(
      item => !(item.product.id === productId && item.barcodeType === barcodeType)
    ));
  };

  const clearPrintQueue = () => {
    setPrintQueue([]);
    toast.success("تم مسح قائمة الطباعة");
  };

  const printAllBarcodes = () => {
    if (printQueue.length === 0) {
      toast.error("قائمة الطباعة فارغة");
      return;
    }

    // This would handle bulk printing
    printQueue.forEach(item => {
      for (let i = 0; i < item.quantity; i++) {
        // Individual barcode printing logic would go here
        console.log(`Printing barcode for ${item.product.name} (${item.barcodeType})`);
      }
    });

    toast.success(`تم طباعة ${printQueue.reduce((sum, item) => sum + item.quantity, 0)} باركود`);
    clearPrintQueue();
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(search.toLowerCase()) ||
    product.barcode?.includes(search) ||
    product.bulk_barcode?.includes(search)
  );

  const getTotalPrintCount = () => {
    return printQueue.reduce((sum, item) => sum + item.quantity, 0);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">طباعة الباركود</h1>
          <div className="flex gap-2">
            <Button
              onClick={printAllBarcodes}
              disabled={printQueue.length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              <Printer className="h-4 w-4 ml-2" />
              طباعة الكل ({getTotalPrintCount()})
            </Button>
            <Button
              variant="outline"
              onClick={clearPrintQueue}
              disabled={printQueue.length === 0}
            >
              مسح القائمة
            </Button>
          </div>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-2">
              <Input
                placeholder="ابحث بالاسم أو الباركود..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
              <Button variant="outline">
                <Search className="h-4 w-4 ml-2" />
                بحث
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Print Queue */}
        {printQueue.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                قائمة الطباعة ({getTotalPrintCount()} باركود)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {printQueue.map((item, index) => (
                  <div key={`${item.product.id}-${item.barcodeType}`} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <img
                        src={item.product.image_urls?.[0] || "/placeholder.svg"}
                        alt={item.product.name}
                        className="h-10 w-10 object-cover rounded"
                      />
                      <div>
                        <h4 className="font-medium">{item.product.name}</h4>
                        <Badge variant="secondary">
                          {item.barcodeType === 'normal' ? 'قطعة' : 
                           item.barcodeType === 'bulk' ? 'جملة' : 'ميزان'}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">الكمية: {item.quantity}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeFromPrintQueue(item.product.id, item.barcodeType)}
                      >
                        حذف
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Products Table */}
        <Card>
          <CardHeader>
            <CardTitle>المنتجات</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">جاري التحميل...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المنتج</TableHead>
                    <TableHead>أنواع الباركود</TableHead>
                    <TableHead>الكمية</TableHead>
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => {
                    const barcodes = getProductBarcodes(product);
                    
                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <img
                              src={product.image_urls?.[0] || "/placeholder.svg"}
                              alt={product.name}
                              className="h-12 w-12 object-cover rounded"
                            />
                            <div>
                              <h4 className="font-medium">{product.name}</h4>
                              <p className="text-sm text-muted-foreground">
                                السعر: {product.price} ج.م
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {barcodes.map((barcode) => {
                              const IconComponent = barcode.icon;
                              return (
                                <Badge key={barcode.type} variant="outline" className="gap-1">
                                  <IconComponent className="h-3 w-3" />
                                  {barcode.label}
                                </Badge>
                              );
                            })}
                            {barcodes.length === 0 && (
                              <span className="text-sm text-muted-foreground">لا يوجد باركود</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{product.quantity || 0}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-2">
                            {barcodes.map((barcode) => (
                              <BarcodeQuantitySelector
                                key={barcode.type}
                                product={product}
                                barcodeType={barcode.type}
                                barcodeLabel={barcode.label}
                                onAddToPrint={addToPrintQueue}
                              />
                            ))}
                            {barcodes.length === 0 && (
                              <span className="text-xs text-muted-foreground">
                                لا يمكن طباعة الباركود
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        لا توجد منتجات مطابقة للبحث
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

// Component for selecting quantity for each barcode type
interface BarcodeQuantitySelectorProps {
  product: Product;
  barcodeType: 'normal' | 'bulk' | 'scale';
  barcodeLabel: string;
  onAddToPrint: (product: Product, barcodeType: 'normal' | 'bulk' | 'scale', quantity: number) => void;
}

function BarcodeQuantitySelector({ 
  product, 
  barcodeType, 
  barcodeLabel, 
  onAddToPrint 
}: BarcodeQuantitySelectorProps) {
  const [quantity, setQuantity] = useState(1);

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min="1"
        value={quantity}
        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
        className="w-16 h-8 text-xs"
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => onAddToPrint(product, barcodeType, quantity)}
        className="text-xs px-2 py-1 h-8"
      >
        {barcodeLabel}
      </Button>
    </div>
  );
}
