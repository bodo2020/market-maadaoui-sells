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

// --- START: ADDED FOR INVOICE PRINTING ---
/**
 * دالة لتنسيق بيانات الفاتورة كنص جاهز للطباعة الحرارية
 * @param {object} invoiceData - بيانات الفاتورة (اسم المتجر، المنتجات، الإجمالي)
 * @returns {string} - نص الفاتورة المنسق
 */
const formatInvoiceForPrinting = (invoiceData) => {
  let content = '';
  
  // ترويسة الفاتورة
  content += `${invoiceData.storeName}\n`;
  content += '--------------------------------\n';
  content += `فاتورة رقم: ${invoiceData.id}\n`;
  content += `التاريخ: ${new Date().toLocaleString()}\n`;
  content += '--------------------------------\n';

  // المنتجات
  content += 'الصنف      الكمية   السعر   الإجمالي\n';
  invoiceData.items.forEach(item => {
    const name = item.name.padEnd(12, ' ');
    const qty = item.quantity.toString().padEnd(7, ' ');
    const price = item.price.toFixed(2).padEnd(8, ' ');
    const total = (item.quantity * item.price).toFixed(2);
    content += `${name}${qty}${price}${total}\n`;
  });

  // الإجماليات
  content += '--------------------------------\n';
  content += `الإجمالي: ${invoiceData.total.toFixed(2)} جنيه\n`;
  content += '\n';

  // رسالة شكر
  content += 'فاتورة تجريبية - شكرا!\n';
  content += '\n\n\n'; // مسافة إضافية في النهاية لقطع الورق

  return content;
};
// --- END: ADDED FOR INVOICE PRINTING ---


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

  const refreshPrintersState = () => {
    // This function will re-scan devices and update the UI state
    // It's a simple way to reflect connection changes
    scanForDevices();
    // Force a re-render to update the isConnected() status
    setPrinters(prev => [...prev]); 
  };
  
  const scanForDevices = async () => {
    setIsScanning(true);
    const foundDevices: PrinterDevice[] = [];

    // Add connected bluetooth printer if it exists
    if (bluetoothPrinterService.isConnected()) {
        const savedPrinter = bluetoothPrinterService.getSavedPrinter();
        if (savedPrinter && !foundDevices.some(d => d.type === 'bluetooth')) {
            foundDevices.push({
                id: `bluetooth-${savedPrinter.name}`,
                name: savedPrinter.name,
                type: 'bluetooth',
                status: 'connected',
            });
        }
    }

    // (The rest of your scanForDevices logic for USB and Network)
    // ...
    setPrinters(foundDevices);
    setIsScanning(false);
  };
  
  const requestBluetoothDevice = async () => {
    try {
      const success = await bluetoothPrinterService.connectPrinter();
      if (success) {
        refreshPrintersState(); // Refresh UI after connecting
      }
    } catch (error) {
      console.error('Bluetooth connection failed:', error);
      toast.error('فشل في الاتصال بطابعة البلوتوث');
    }
  };

  const handleDisconnect = async () => {
    await bluetoothPrinterService.disconnectPrinter();
    refreshPrintersState(); // Refresh UI instead of reloading page
    toast.success('تم فصل الطابعة بنجاح');
  };

  // --- START: ADDED FOR INVOICE PRINTING ---
  const handlePrintTestInvoice = async () => {
    if (!bluetoothPrinterService.isConnected()) {
      toast.error("الطابعة غير متصلة. يرجى ربط طابعة بلوتوث أولاً.");
      return;
    }

    toast.info("جاري تجهيز الفاتورة التجريبية...");

    // 1. بيانات فاتورة وهمية للتجربة
    const testInvoiceData = {
      id: Math.floor(1000 + Math.random() * 9000),
      storeName: storeSettings?.name || "متجري",
      items: [
        { name: 'منتج تجريبي 1', quantity: 2, price: 10.00 },
        { name: 'منتج تجريبي 2', quantity: 1, price: 25.50 },
      ],
      total: 45.50,
    };

    // 2. تنسيق الفاتورة
    const formattedInvoice = formatInvoiceForPrinting(testInvoiceData);

    // 3. الطباعة
    try {
      // نفترض أن خدمة البلوتوث لديك بها دالة printInvoice
      await bluetoothPrinterService.printInvoice(formattedInvoice);
      toast.success("تم إرسال الفاتورة التجريبية للطابعة بنجاح!");
    } catch (error) {
      console.error("Printing failed:", error);
      toast.error("فشل إرسال الفاتورة للطابعة.");
    }
  };
  // --- END: ADDED FOR INVOICE PRINTING ---

  // ... (All your other functions: fetchProducts, saveBarcode, etc. remain here)
  const fetchProducts = async () => { try { setLoading(true); const { data, error } = await supabase.from('products').select(`id, name, barcode, bulk_barcode, price, bulk_price, is_bulk, bulk_enabled, company_id, companies ( name )`).order('name'); if (error) throw error; setProducts(data || []); } catch (error) { console.error('Error fetching products:', error); toast.error('حدث خطأ في تحميل المنتجات'); } finally { setLoading(false); } };
  const fetchStoreData = async () => { try { const settings = await fetchStoreSettings(); setStoreSettings(settings); } catch (error) { console.error('Error fetching store settings:', error); } };
  const startEditing = (product: Product) => { setEditingProduct(product.id); setEditingBarcode({ barcode: product.barcode || '', bulk_barcode: product.bulk_barcode || '' }); };
  const cancelEditing = () => { setEditingProduct(null); setEditingBarcode({ barcode: '', bulk_barcode: '' }); };
  const saveBarcode = async (productId: string) => { try { const { error } = await supabase.from('products').update({ barcode: editingBarcode.barcode || null, bulk_barcode: editingBarcode.bulk_barcode || null }).eq('id', productId); if (error) throw error; setProducts(prev => prev.map(p => p.id === productId ? { ...p, barcode: editingBarcode.barcode, bulk_barcode: editingBarcode.bulk_barcode } : p)); toast.success('تم حفظ الباركود بنجاح'); cancelEditing(); } catch (error) { console.error('Error saving barcode:', error); toast.error('حدث خطأ في حفظ الباركود'); } };
  const filteredProducts = products.filter(product => product.name.toLowerCase().includes(searchTerm.toLowerCase()) || product.barcode?.includes(searchTerm) || product.bulk_barcode?.includes(searchTerm));
  const toggleProductSelection = (productId: string) => { const newSelected = new Set(selectedProducts); if (newSelected.has(productId)) { newSelected.delete(productId); } else { newSelected.add(productId); } setSelectedProducts(newSelected); };
  const printSelectedBarcodes = () => { if (selectedProducts.size === 0) { toast.error('يرجى اختيار منتج واحد على الأقل للطباعة'); return; } const selectedPrinter = printers.find(p => p.id === barcodePrinter); if (!selectedPrinter || selectedPrinter.status === 'disconnected') { toast.error('طابعة الباركود غير متصلة'); return; } toast.success(`تم إرسال ${selectedProducts.size} باركود للطباعة على ${selectedPrinter.name}`); setSelectedProducts(new Set()); };
  const printAllBarcodes = () => { const selectedPrinter = printers.find(p => p.id === barcodePrinter); if (!selectedPrinter || selectedPrinter.status === 'disconnected') { toast.error('طابعة الباركود غير متصلة'); return; } toast.success(`تم إرسال جميع الباركودات (${filteredProducts.length}) للطباعة`); };
  const requestUSBDevice = async () => { try { if (!('serial' in navigator)) { toast.error('متصفحك لا يدعم الوصول لأجهزة USB'); return; } const port = await (navigator as any).serial.requestPort(); const newDevice: PrinterDevice = { id: `usb-${Date.now()}`, name: `USB Printer ${printers.length + 1}`, type: 'usb', status: 'connected', port: port }; setPrinters(prev => [...prev, newDevice]); toast.success('تم إضافة جهاز USB بنجاح'); } catch (error) { console.error('Error requesting USB device:', error); toast.error('تم إلغاء اختيار الجهاز أو حدث خطأ'); } };
  

  return (
    <MainLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* The entire JSX remains the same, with only one button added */}
        {/* ... */}
        <Tabs defaultValue="products" className="w-full">
          {/* ... TabsList ... */}
          <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="products">المنتجات والباركود</TabsTrigger><TabsTrigger value="devices">إعدادات الطابعات</TabsTrigger></TabsList>
          
          {/* ... TabsContent for products ... */}
          <TabsContent value="products" className="space-y-4">{/* ... */}</TabsContent>

          <TabsContent value="devices" className="space-y-4">
            <Card>
              <CardHeader>{/* ... */}</CardHeader>
              <CardContent className="space-y-6">
                {/* ... Printer Selection & Device Discovery ... */}
                
                {/* --- START: MODIFIED SECTION --- */}
                {/* Test Print Buttons */}
                <div className="flex gap-4">
                  <Button variant="outline" className="flex-1" onClick={handlePrintTestInvoice}>
                    <Printer className="h-4 w-4 mr-2" />
                    طباعة فاتورة تجريبية
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => bluetoothPrinterService.testPrint()}>
                    <Printer className="h-4 w-4 mr-2" />
                    اختبار طباعة الباركود
                  </Button>
                </div>
                {/* --- END: MODIFIED SECTION --- */}

                {/* Bluetooth Printer Manager */}
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">إدارة طابعة البلوتوث</h3>
                  {/* ... Rest of the Bluetooth Manager section ... */}
                   <div className="p-4 border rounded-lg bg-blue-50 mb-4"><div className="flex items-center gap-2 text-blue-800 mb-2"><Bluetooth className="h-5 w-5" /><span className="font-medium">طابعة واحدة للكل</span></div><p className="text-sm text-blue-700">يمكنك ربط طابعة بلوتوث واحدة تعمل للفواتير والباركود معاً. ستطبع الفواتير تلقائياً بعد كل عملية بيع.</p></div>
                  {bluetoothPrinterService.isConnected() ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 border rounded-lg bg-green-50">
                        <div className="flex items-center gap-3"><Bluetooth className="h-5 w-5 text-green-600" /><div><p className="font-medium text-green-800">{bluetoothPrinterService.getSavedPrinter()?.name || 'طابعة بلوتوث'}</p><p className="text-sm text-green-600">متصلة وجاهزة</p></div></div>
                        <Button variant="outline" size="sm" onClick={handleDisconnect}>
                          فصل الطابعة
                        </Button>
                      </div>
                      <Button variant="outline" className="w-full" onClick={() => bluetoothPrinterService.testPrint()}>
                        <Printer className="h-4 w-4 mr-2" />
                        اختبار الطباعة
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-6"><Bluetooth className="h-12 w-12 mx-auto mb-4 opacity-50" /><p className="text-muted-foreground mb-4">لا توجد طابعة مربوطة</p><Button onClick={requestBluetoothDevice} className="gap-2"><Bluetooth className="h-4 w-4" />ربط طابعة بلوتوث</Button><div className="mt-4 text-xs text-muted-foreground space-y-1"><p>• تأكد من تشغيل البلوتوث في جهازك</p><p>• اجعل الطابعة في وضع الاكتشاف</p><p>• استخدم Chrome أو Edge للحصول على أفضل دعم</p><p>• ستطبع الفواتير تلقائياً بعد كل عملية بيع</p></div></div>
                  )}
                  {/* ... Additional Info ... */}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}