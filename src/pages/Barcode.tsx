import { useState, useEffect, useRef } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Printer, Settings, Bluetooth, Cable } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import JsBarcode from "jsbarcode";

interface Product {
  id: string;
  name: string;
  barcode?: string;
  bulk_barcode?: string;
  price: number;
  bulk_price?: number;
  is_bulk: boolean;
  bulk_enabled: boolean;
  company_id?: string;
  companies?: {
    name: string;
  };
}

interface PrinterDevice {
  id: string;
  name: string;
  type: 'bluetooth' | 'usb';
  status: 'connected' | 'disconnected';
}

// Simple Barcode Display Component
const SimpleBarcodeDisplay = ({ value, className }: { value: string; className?: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && value) {
      try {
        JsBarcode(canvasRef.current, value, {
          format: 'CODE128',
          width: 1.5,
          height: 40,
          displayValue: false,
          background: 'white',
          lineColor: 'black',
          margin: 2
        });
      } catch (error) {
        console.error('Error generating barcode:', error);
      }
    }
  }, [value]);

  return <canvas ref={canvasRef} className={className} />;
};

export default function Barcode() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [printers, setPrinters] = useState<PrinterDevice[]>([
    { id: '1', name: 'Invoice Printer HP-1000', type: 'usb', status: 'connected' },
    { id: '2', name: 'Barcode Printer Zebra ZT230', type: 'bluetooth', status: 'connected' },
    { id: '3', name: 'Bluetooth Printer BT-200', type: 'bluetooth', status: 'disconnected' }
  ]);
  const [invoicePrinter, setInvoicePrinter] = useState<string>('1');
  const [barcodePrinter, setBarcodePrinter] = useState<string>('2');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select(`
          id,
          name,
          barcode,
          bulk_barcode,
          price,
          bulk_price,
          is_bulk,
          bulk_enabled,
          company_id,
          companies (
            name
          )
        `)
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('حدث خطأ في تحميل المنتجات');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.barcode?.includes(searchTerm) ||
    product.bulk_barcode?.includes(searchTerm)
  );

  const toggleProductSelection = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const printSelectedBarcodes = () => {
    if (selectedProducts.size === 0) {
      toast.error('يرجى اختيار منتج واحد على الأقل للطباعة');
      return;
    }

    const selectedPrinter = printers.find(p => p.id === barcodePrinter);
    if (!selectedPrinter || selectedPrinter.status === 'disconnected') {
      toast.error('طابعة الباركود غير متصلة');
      return;
    }

    // Here you would implement the actual printing logic
    toast.success(`تم إرسال ${selectedProducts.size} باركود للطباعة على ${selectedPrinter.name}`);
    setSelectedProducts(new Set());
  };

  const printAllBarcodes = () => {
    const selectedPrinter = printers.find(p => p.id === barcodePrinter);
    if (!selectedPrinter || selectedPrinter.status === 'disconnected') {
      toast.error('طابعة الباركود غير متصلة');
      return;
    }

    toast.success(`تم إرسال جميع الباركودات (${filteredProducts.length}) للطباعة`);
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">إدارة الباركود</h1>
        </div>

        <Tabs defaultValue="products" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="products">المنتجات والباركود</TabsTrigger>
            <TabsTrigger value="devices">إعدادات الطابعات</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="space-y-4">
            {/* Search and Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  البحث والتحكم
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 items-center">
                  <div className="flex-1">
                    <Input
                      placeholder="البحث بالاسم أو الباركود..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Button 
                    onClick={printSelectedBarcodes}
                    disabled={selectedProducts.size === 0}
                    variant="default"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    طباعة المحدد ({selectedProducts.size})
                  </Button>
                  <Button 
                    onClick={printAllBarcodes}
                    variant="outline"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    طباعة الكل ({filteredProducts.length})
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Products Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-4">
                      <div className="h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3 mb-4"></div>
                      <div className="h-20 bg-gray-200 rounded"></div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                filteredProducts.map((product) => (
                  <Card 
                    key={product.id} 
                    className={`cursor-pointer transition-all ${
                      selectedProducts.has(product.id) 
                        ? 'ring-2 ring-primary bg-primary/5' 
                        : 'hover:shadow-md'
                    }`}
                    onClick={() => toggleProductSelection(product.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-sm line-clamp-2">{product.name}</h3>
                          {product.companies?.name && (
                            <Badge variant="secondary" className="text-xs mt-1">
                              {product.companies.name}
                            </Badge>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          checked={selectedProducts.has(product.id)}
                          onChange={() => toggleProductSelection(product.id)}
                          className="mr-2"
                        />
                      </div>

                      <div className="space-y-3">
                        {/* Regular Barcode */}
                        {product.barcode && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-primary">قطعة</span>
                              <span className="text-xs text-muted-foreground">{product.price} ج.م</span>
                            </div>
                            <SimpleBarcodeDisplay 
                              value={product.barcode} 
                              className="h-12 w-full"
                            />
                            <p className="text-xs text-center font-mono">{product.barcode}</p>
                          </div>
                        )}

                        {/* Bulk Barcode */}
                        {product.bulk_enabled && product.bulk_barcode && (
                          <div className="space-y-2 pt-2 border-t">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-green-600">جملة</span>
                              <span className="text-xs text-muted-foreground">{product.bulk_price} ج.م</span>
                            </div>
                            <SimpleBarcodeDisplay 
                              value={product.bulk_barcode} 
                              className="h-12 w-full"
                            />
                            <p className="text-xs text-center font-mono">{product.bulk_barcode}</p>
                          </div>
                        )}

                        {/* No Barcode */}
                        {!product.barcode && !product.bulk_barcode && (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            لا يوجد باركود لهذا المنتج
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {!loading && filteredProducts.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">لا توجد منتجات تطابق البحث</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="devices" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  إعدادات الطابعات
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Printer Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">طابعة الفواتير</label>
                    <select 
                      value={invoicePrinter} 
                      onChange={(e) => setInvoicePrinter(e.target.value)}
                      className="w-full p-2 border border-input rounded-md bg-background"
                    >
                      {printers.map(printer => (
                        <option key={printer.id} value={printer.id}>
                          {printer.name} ({printer.status === 'connected' ? 'متصل' : 'غير متصل'})
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">طابعة الباركود</label>
                    <select 
                      value={barcodePrinter} 
                      onChange={(e) => setBarcodePrinter(e.target.value)}
                      className="w-full p-2 border border-input rounded-md bg-background"
                    >
                      {printers.map(printer => (
                        <option key={printer.id} value={printer.id}>
                          {printer.name} ({printer.status === 'connected' ? 'متصل' : 'غير متصل'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Available Devices */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">الأجهزة المتاحة</h3>
                  <div className="space-y-2">
                    {printers.map(printer => (
                      <div key={printer.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          {printer.type === 'bluetooth' ? (
                            <Bluetooth className="h-5 w-5 text-blue-500" />
                          ) : (
                            <Cable className="h-5 w-5 text-gray-500" />
                          )}
                          <div>
                            <p className="font-medium">{printer.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {printer.type === 'bluetooth' ? 'بلوتوث' : 'USB'}
                            </p>
                          </div>
                        </div>
                        <Badge 
                          variant={printer.status === 'connected' ? 'default' : 'secondary'}
                        >
                          {printer.status === 'connected' ? 'متصل' : 'غير متصل'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Test Print Buttons */}
                <div className="flex gap-4">
                  <Button variant="outline" className="flex-1">
                    <Printer className="h-4 w-4 mr-2" />
                    اختبار طابعة الفواتير
                  </Button>
                  <Button variant="outline" className="flex-1">
                    <Printer className="h-4 w-4 mr-2" />
                    اختبار طابعة الباركود
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}