import { useState, useEffect, useRef } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Printer, Settings, Bluetooth, Cable, RefreshCw, Edit, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { bluetoothPrinterService } from '@/services/bluetoothPrinterService';
import JsBarcode from "jsbarcode";
import { fetchStoreSettings, StoreSettings } from "@/services/supabase/storeService";

// دالة تنسيق الفاتورة
const formatInvoiceForPrinting = (invoiceData) => {
  let content = '';
  content += `${invoiceData.storeName}\n`;
  content += '--------------------------------\n';
  content += `Invoice No: ${invoiceData.id}\n`;
  content += `Date: ${new Date().toLocaleString()}\n`;
  content += '--------------------------------\n';
  content += 'Item        Qty    Price    Total\n';
  invoiceData.items.forEach(item => {
    const name = item.name.padEnd(12, ' ');
    const qty = item.quantity.toString().padEnd(7, ' ');
    const price = item.price.toFixed(2).padEnd(8, ' ');
    const total = (item.quantity * item.price).toFixed(2);
    content += `${name}${qty}${price}${total}\n`;
  });
  content += '--------------------------------\n';
  content += `Total: ${invoiceData.total.toFixed(2)} EGP\n\n`;
  content += 'Test Invoice - Thank You!\n\n\n';
  return content;
};

// واجهات الأنواع (Interfaces)
interface Product {
  id: string;
  name: string;
  barcode?: string;
  bulk_barcode?: string;
  price: number;
  bulk_price?: number;
  is_bulk: boolean;
  bulk_enabled: boolean;
  companies?: { name: string; };
}
interface PrinterDevice {
  id: string;
  name: string;
  type: 'bluetooth' | 'usb' | 'network';
  status: 'connected' | 'disconnected';
  device?: any;
  port?: any;
}

// مكون عرض الباركود
const SimpleBarcodeDisplay = ({ value, productName, storeName, className }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (canvasRef.current && value) {
      try {
        JsBarcode(canvasRef.current, value, {
          format: 'CODE128', width: 1.5, height: 40, displayValue: false,
          background: 'white', lineColor: 'black', margin: 2
        });
      } catch (error) { console.error('Error generating barcode:', error); }
    }
  }, [value, productName, storeName]);
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
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editingBarcode, setEditingBarcode] = useState({ barcode: '', bulk_barcode: '' });

  // استخدام forceUpdate لضمان تحديث الواجهة عند تغيير حالة الاتصال
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    fetchProducts();
    refreshPrintersState(); // تحديث قائمة الطابعات عند تحميل الصفحة
    fetchStoreData();
  }, []);
  
  const refreshPrintersState = () => {
    const foundDevices: PrinterDevice[] = [];
    if (bluetoothPrinterService.isConnected()) {
        const savedPrinter = bluetoothPrinterService.getSavedPrinter();
        if (savedPrinter) {
            foundDevices.push({
                id: `bluetooth-${savedPrinter.name}`,
                name: savedPrinter.name,
                type: 'bluetooth',
                status: 'connected',
            });
        }
    }
    setPrinters(foundDevices);
    forceUpdate(c => c + 1); // فرض تحديث الواجهة
  };

  const requestBluetoothDevice = async () => {
    const success = await bluetoothPrinterService.connectPrinter();
    if (success) {
      refreshPrintersState();
    }
  };

  const handleDisconnect = async () => {
    await bluetoothPrinterService.disconnectPrinter();
    refreshPrintersState();
    toast.success('تم فصل الطابعة بنجاح');
  };

  const handlePrintTestInvoice = async () => {
    if (!bluetoothPrinterService.isConnected()) {
      toast.error("الطابعة غير متصلة. يرجى ربط طابعة بلوتوث أولاً.");
      return;
    }
    toast.info("جاري تجهيز الفاتورة التجريبية...");
    const testInvoiceData = {
      id: Math.floor(1000 + Math.random() * 9000),
      storeName: storeSettings?.name || "My Store",
      items: [
        { name: 'Test Item 1', quantity: 2, price: 10.00 },
        { name: 'Test Item 2', quantity: 1, price: 25.50 },
      ],
      total: 45.50,
    };
    const formattedInvoice = formatInvoiceForPrinting(testInvoiceData);
    try {
      await bluetoothPrinterService.printInvoice(formattedInvoice);
      toast.success("تم إرسال الفاتورة التجريبية للطابعة بنجاح!");
    } catch (error) {
      toast.error("فشل إرسال الفاتورة للطابعة.");
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('products').select(`*, companies(name)`).order('name');
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
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

  // ... (باقي الدوال المساعدة مثل الحفظ والتحرير كما هي)
  const startEditing = (product: Product) => { setEditingProduct(product.id); setEditingBarcode({ barcode: product.barcode || '', bulk_barcode: product.bulk_barcode || '' }); };
  const cancelEditing = () => { setEditingProduct(null); setEditingBarcode({ barcode: '', bulk_barcode: '' }); };
  const saveBarcode = async (productId: string) => { try { const { error } = await supabase.from('products').update({ barcode: editingBarcode.barcode || null, bulk_barcode: editingBarcode.bulk_barcode || null }).eq('id', productId); if (error) throw error; fetchProducts(); toast.success('تم حفظ الباركود بنجاح'); cancelEditing(); } catch (error) { toast.error('حدث خطأ في حفظ الباركود'); } };
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.barcode?.includes(searchTerm) || p.bulk_barcode?.includes(searchTerm));
  const toggleProductSelection = (productId: string) => { const newSelected = new Set(selectedProducts); if (newSelected.has(productId)) newSelected.delete(productId); else newSelected.add(productId); setSelectedProducts(newSelected); };

  return (
    <MainLayout>
      <div className="container mx-auto p-6 space-y-6">
        <h1 className="text-3xl font-bold">إدارة الباركود والطابعات</h1>
        <Tabs defaultValue="products" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="products">المنتجات والباركود</TabsTrigger>
            <TabsTrigger value="devices">إعدادات الطابعات</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="space-y-4">
            {/* ... قسم عرض المنتجات والبحث ... */}
          </TabsContent>

          <TabsContent value="devices" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />إعدادات الطابعات</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex gap-4">
                  <Button variant="outline" className="flex-1" onClick={handlePrintTestInvoice}>
                    <Printer className="h-4 w-4 ml-2" />
                    طباعة فاتورة تجريبية
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => bluetoothPrinterService.testPrint()}>
                    <Printer className="h-4 w-4 ml-2" />
                    اختبار اتصال الطابعة
                  </Button>
                </div>
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">إدارة طابعة البلوتوث</h3>
                  <div className="p-4 border rounded-lg bg-blue-50 mb-4">
                    <div className="flex items-center gap-2 text-blue-800 mb-2">
                      <Bluetooth className="h-5 w-5" /><span className="font-medium">طابعة واحدة للكل</span>
                    </div>
                    <p className="text-sm text-blue-700">يمكنك ربط طابعة بلوتوث واحدة لطباعة الفواتير والباركود معاً.</p>
                  </div>
                  {bluetoothPrinterService.isConnected() ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 border rounded-lg bg-green-50">
                        <div className="flex items-center gap-3">
                          <Bluetooth className="h-5 w-5 text-green-600" />
                          <div>
                            <p className="font-medium text-green-800">{bluetoothPrinterService.getSavedPrinter()?.name || 'طابعة بلوتوث'}</p>
                            <p className="text-sm text-green-600">متصلة وجاهزة</p>
                          </div>
                        </div>
                        <Button variant="destructive" size="sm" onClick={handleDisconnect}>فصل الطابعة</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <Bluetooth className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-muted-foreground mb-4">لا توجد طابعة مربوطة</p>
                      <Button onClick={requestBluetoothDevice} className="gap-2">
                        <Bluetooth className="h-4 w-4" />ربط طابعة بلوتوث
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}