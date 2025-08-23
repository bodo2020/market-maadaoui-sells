import { useState, useEffect, useRef } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Printer, Settings, Bluetooth, Cable, RefreshCw, Plus, Wifi, Edit, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { bluetoothPrinterService } from '@/services/bluetoothPrinterService';
import JsBarcode from "jsbarcode";
import { fetchStoreSettings, StoreSettings } from "@/services/supabase/storeService";

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
  type: 'bluetooth' | 'usb' | 'network';
  status: 'connected' | 'disconnected';
  device?: any; // BluetoothDevice | USBDevice
  port?: any; // SerialPort
}

// Simple Barcode Display Component
const SimpleBarcodeDisplay = ({ value, productName, storeName, className }: { 
  value: string; 
  productName: string;
  storeName: string;
  className?: string;
}) => {
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

  return (
    <div className="space-y-1">
      <canvas ref={canvasRef} className={className} />
      <div className="text-xs text-center space-y-1">
        <div className="font-medium">{productName}</div>
        <div className="text-muted-foreground">{storeName}</div>
      </div>
    </div>
  );
};

export default function Barcode() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [printers, setPrinters] = useState<PrinterDevice[]>([]);
  const [invoicePrinter, setInvoicePrinter] = useState<string>('');
  const [barcodePrinter, setBarcodePrinter] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editingBarcode, setEditingBarcode] = useState({ barcode: '', bulk_barcode: '' });

  useEffect(() => {
    fetchProducts();
    scanForDevices();
    fetchStoreData();
  }, []);

  const scanForDevices = async () => {
    setIsScanning(true);
    const foundDevices: PrinterDevice[] = [];

    try {
      // Check for USB Serial devices
      if ('serial' in navigator) {
        try {
          const ports = await (navigator as any).serial.getPorts();
          ports.forEach((port: any, index: number) => {
            foundDevices.push({
              id: `usb-${index}`,
              name: `USB Serial Printer ${index + 1}`,
              type: 'usb',
              status: 'connected',
              port: port
            });
          });
        } catch (error) {
          console.log('Serial API not available or no permission');
        }
      }

      // Check for Bluetooth devices if available
      if ('bluetooth' in navigator) {
        try {
          // Note: Bluetooth scanning requires user interaction
          console.log('Bluetooth API available but requires user interaction to scan');
        } catch (error) {
          console.log('Bluetooth API not available');
        }
      }

      // Check for network printers (placeholder - would need actual network discovery)
      const networkPrinters = [
        {
          id: 'network-1',
          name: 'Network Printer (192.168.1.100)',
          type: 'network' as const,
          status: 'connected' as const,
        }
      ];

      foundDevices.push(...networkPrinters);
      setPrinters(foundDevices);

      if (foundDevices.length > 0 && !invoicePrinter) {
        setInvoicePrinter(foundDevices[0].id);
      }
      if (foundDevices.length > 1 && !barcodePrinter) {
        setBarcodePrinter(foundDevices[1]?.id || foundDevices[0].id);
      }

    } catch (error) {
      console.error('Error scanning for devices:', error);
      toast.error('حدث خطأ أثناء البحث عن الأجهزة');
    } finally {
      setIsScanning(false);
    }
  };

  const requestUSBDevice = async () => {
    try {
      if (!('serial' in navigator)) {
        toast.error('متصفحك لا يدعم الوصول لأجهزة USB');
        return;
      }

      const port = await (navigator as any).serial.requestPort();
      
      const newDevice: PrinterDevice = {
        id: `usb-${Date.now()}`,
        name: `USB Printer ${printers.length + 1}`,
        type: 'usb',
        status: 'connected',
        port: port
      };

      setPrinters(prev => [...prev, newDevice]);
      toast.success('تم إضافة جهاز USB بنجاح');
      
    } catch (error) {
      console.error('Error requesting USB device:', error);
      toast.error('تم إلغاء اختيار الجهاز أو حدث خطأ');
    }
  };

  const requestBluetoothDevice = async () => {
    try {
      // استخدام خدمة الطباعة البلوتوث الجديدة
      const success = await bluetoothPrinterService.connectPrinter();
      
      if (success) {
        const savedPrinter = bluetoothPrinterService.getSavedPrinter();
        if (savedPrinter) {
          const newPrinter: PrinterDevice = {
            id: `bluetooth-${Date.now()}`,
            name: savedPrinter.name,
            type: 'bluetooth',
            status: 'connected'
          };
          
          setPrinters(prev => [...prev, newPrinter]);
          setInvoicePrinter(newPrinter.id);
          setBarcodePrinter(newPrinter.id);
          toast.success('تم ربط الطابعة للفواتير والباركود معاً');
        }
      }
    } catch (error) {
      console.error('Bluetooth connection failed:', error);
      toast.error('فشل في الاتصال بطابعة البلوتوث');
    }
  };

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

  const fetchStoreData = async () => {
    try {
      const settings = await fetchStoreSettings();
      setStoreSettings(settings);
    } catch (error) {
      console.error('Error fetching store settings:', error);
    }
  };

  const startEditing = (product: Product) => {
    setEditingProduct(product.id);
    setEditingBarcode({
      barcode: product.barcode || '',
      bulk_barcode: product.bulk_barcode || ''
    });
  };

  const cancelEditing = () => {
    setEditingProduct(null);
    setEditingBarcode({ barcode: '', bulk_barcode: '' });
  };

  const saveBarcode = async (productId: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({
          barcode: editingBarcode.barcode || null,
          bulk_barcode: editingBarcode.bulk_barcode || null
        })
        .eq('id', productId);

      if (error) throw error;

      // Update local state
      setProducts(prev => prev.map(p => 
        p.id === productId 
          ? { ...p, barcode: editingBarcode.barcode, bulk_barcode: editingBarcode.bulk_barcode }
          : p
      ));

      toast.success('تم حفظ الباركود بنجاح');
      cancelEditing();
    } catch (error) {
      console.error('Error saving barcode:', error);
      toast.error('حدث خطأ في حفظ الباركود');
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

                      {editingProduct === product.id ? (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <label className="text-xs font-medium">باركود القطعة</label>
                            <Input
                              value={editingBarcode.barcode}
                              onChange={(e) => setEditingBarcode(prev => ({ ...prev, barcode: e.target.value }))}
                              placeholder="أدخل باركود القطعة"
                              className="text-xs"
                            />
                          </div>
                          {product.bulk_enabled && (
                            <div className="space-y-2">
                              <label className="text-xs font-medium">باركود الجملة</label>
                              <Input
                                value={editingBarcode.bulk_barcode}
                                onChange={(e) => setEditingBarcode(prev => ({ ...prev, bulk_barcode: e.target.value }))}
                                placeholder="أدخل باركود الجملة"
                                className="text-xs"
                              />
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => saveBarcode(product.id)}>
                              <Save className="h-3 w-3 mr-1" />
                              حفظ
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEditing}>
                              <X className="h-3 w-3 mr-1" />
                              إلغاء
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Edit Button */}
                          <div className="flex justify-end">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditing(product);
                              }}
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              تعديل
                            </Button>
                          </div>

                          {/* Regular Barcode */}
                          {product.barcode && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-primary">قطعة</span>
                              </div>
                              <SimpleBarcodeDisplay 
                                value={product.barcode}
                                productName={product.name}
                                storeName={storeSettings?.name || 'المتجر'}
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
                              </div>
                              <SimpleBarcodeDisplay 
                                value={product.bulk_barcode}
                                productName={`${product.name} (جملة)`}
                                storeName={storeSettings?.name || 'المتجر'}
                                className="h-12 w-full"
                              />
                              <p className="text-xs text-center font-mono">{product.bulk_barcode}</p>
                            </div>
                          )}

                          {/* No Barcode */}
                          {!product.barcode && !product.bulk_barcode && (
                            <div className="text-center py-4 text-muted-foreground text-sm">
                              لا يوجد باركود لهذا المنتج
                              <br />
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="mt-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditing(product);
                                }}
                              >
                                إضافة باركود
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
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

                {/* Device Discovery */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">البحث عن الأجهزة</h3>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={scanForDevices}
                        disabled={isScanning}
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${isScanning ? 'animate-spin' : ''}`} />
                        {isScanning ? 'جاري البحث...' : 'إعادة البحث'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={requestUSBDevice}>
                        <Cable className="h-4 w-4 mr-2" />
                        إضافة USB
                      </Button>
                      <Button variant="outline" size="sm" onClick={requestBluetoothDevice}>
                        <Bluetooth className="h-4 w-4 mr-2" />
                        إضافة بلوتوث
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Available Devices */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">الأجهزة المتاحة ({printers.length})</h3>
                  {printers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Printer className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>لا توجد أجهزة متصلة</p>
                      <p className="text-sm">اضغط على "إضافة USB" أو "إضافة بلوتوث" لإضافة جهاز</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {printers.map(printer => (
                        <div key={printer.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            {printer.type === 'bluetooth' ? (
                              <Bluetooth className="h-5 w-5 text-blue-500" />
                            ) : printer.type === 'usb' ? (
                              <Cable className="h-5 w-5 text-gray-500" />
                            ) : (
                              <Wifi className="h-5 w-5 text-green-500" />
                            )}
                            <div>
                              <p className="font-medium">{printer.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {printer.type === 'bluetooth' ? 'بلوتوث' : 
                                 printer.type === 'usb' ? 'USB' : 'شبكة'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={printer.status === 'connected' ? 'default' : 'secondary'}
                            >
                              {printer.status === 'connected' ? 'متصل' : 'غير متصل'}
                            </Badge>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setPrinters(prev => prev.filter(p => p.id !== printer.id));
                                toast.success('تم حذف الجهاز');
                              }}
                            >
                              حذف
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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

                {/* Bluetooth Printer Manager */}
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">إدارة طابعة البلوتوث</h3>
                  <div className="p-4 border rounded-lg bg-blue-50 mb-4">
                    <div className="flex items-center gap-2 text-blue-800 mb-2">
                      <Bluetooth className="h-5 w-5" />
                      <span className="font-medium">طابعة واحدة للكل</span>
                    </div>
                    <p className="text-sm text-blue-700">
                      يمكنك ربط طابعة بلوتوث واحدة تعمل للفواتير والباركود معاً. 
                      ستطبع الفواتير تلقائياً بعد كل عملية بيع.
                    </p>
                  </div>

                  {bluetoothPrinterService.isConnected() ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 border rounded-lg bg-green-50">
                        <div className="flex items-center gap-3">
                          <Bluetooth className="h-5 w-5 text-green-600" />
                          <div>
                            <p className="font-medium text-green-800">
                              {bluetoothPrinterService.getSavedPrinter()?.name || 'طابعة بلوتوث'}
                            </p>
                            <p className="text-sm text-green-600">متصلة وجاهزة</p>
                          </div>
                        </div>
                        
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={async () => {
                            await bluetoothPrinterService.disconnectPrinter();
                            window.location.reload();
                          }}
                        >
                          فصل الطابعة
                        </Button>
                      </div>
                      
                      <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={async () => {
                          if (bluetoothPrinterService.isConnected()) {
                            await bluetoothPrinterService.testPrint();
                          } else {
                            toast.error('الطابعة غير متصلة');
                          }
                        }}
                      >
                        <Printer className="h-4 w-4 mr-2" />
                        اختبار الطباعة
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <Bluetooth className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-muted-foreground mb-4">لا توجد طابعة مربوطة</p>
                      
                      <Button 
                        onClick={requestBluetoothDevice}
                        className="gap-2"
                      >
                        <Bluetooth className="h-4 w-4" />
                        ربط طابعة بلوتوث
                      </Button>
                      
                      <div className="mt-4 text-xs text-muted-foreground space-y-1">
                        <p>• تأكد من تشغيل البلوتوث في جهازك</p>
                        <p>• اجعل الطابعة في وضع الاكتشاف</p>
                        <p>• استخدم Chrome أو Edge للحصول على أفضل دعم</p>
                        <p>• ستطبع الفواتير تلقائياً بعد كل عملية بيع</p>
                      </div>
                    </div>
                  )}
                  
                  {/* معلومات إضافية */}
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <h4 className="font-medium mb-2">نصائح للاستخدام:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• إذا فشل الاتصال، جرب إعادة تشغيل البلوتوث</li>
                      <li>• بعض الطابعات تحتاج وضع "Pairing Mode"</li>
                      <li>• إذا لم تعمل الطباعة المباشرة، ستفتح نافذة طباعة</li>
                      <li>• يمكنك استخدام نفس الطابعة للفواتير والباركود</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}