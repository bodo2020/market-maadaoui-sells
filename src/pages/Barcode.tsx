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

// Helper function to format invoice text
const formatInvoiceForPrinting = (invoiceData: any): string => {
  let content = '';
  content += `${invoiceData.storeName}\n`;
  content += '--------------------------------\n';
  content += `Invoice No: ${invoiceData.id}\n`;
  content += `Date: ${new Date().toLocaleString('ar-EG')}\n`;
  content += '--------------------------------\n';
  content += 'Item        Qty    Price    Total\n';
  invoiceData.items.forEach((item: any) => {
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

// Type Interfaces
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

export default function Barcode() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  
  // [THE FIX] This state is used to force the component to re-render
  const [connectionVersion, setConnectionVersion] = useState(0);
  const forceUpdate = () => setConnectionVersion(v => v + 1);

  useEffect(() => {
    fetchProducts();
    fetchStoreData();
    // Check status on initial load
    forceUpdate(); 
  }, []);

  const handleConnect = async () => {
    await bluetoothPrinterService.connectPrinter();
    // Force UI to update after connection attempt
    forceUpdate();
  };

  const handleDisconnect = () => {
    bluetoothPrinterService.disconnectPrinter();
    // Force UI to update after disconnection
    forceUpdate();
  };

  const handlePrintTestInvoice = async () => {
    if (!bluetoothPrinterService.isConnected()) {
      toast.error("الطابعة غير متصلة. يرجى ربط طابعة بلوتوث أولاً.");
      return;
    }
    
    const testInvoiceData = {
      id: Math.floor(1000 + Math.random() * 9000),
      storeName: storeSettings?.name || "متجري",
      items: [
        { name: 'منتج تجريبي 1', quantity: 2, price: 10.00 },
        { name: 'منتج تجريبي 2', quantity: 1, price: 25.50 },
      ],
      total: 45.50,
    };
    
    const formattedInvoice = formatInvoiceForPrinting(testInvoiceData);
    await bluetoothPrinterService.printInvoice(formattedInvoice);
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
    const settings = await fetchStoreSettings();
    setStoreSettings(settings);
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6 space-y-6">
        <h1 className="text-3xl font-bold">إدارة الطابعات</h1>
        <Tabs defaultValue="devices" className="w-full">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="devices">إعدادات الطابعات</TabsTrigger>
          </TabsList>

          <TabsContent value="devices" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />إعدادات الطابعات</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-4">
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
                  {bluetoothPrinterService.isConnected() ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 border rounded-lg bg-green-50">
                        <div className="flex items-center gap-3">
                          <Bluetooth className="h-5 w-5 text-green-600" />
                          <div>
                            <p className="font-medium text-green-800">{bluetoothPrinterService.getConnectedPrinterName() || 'طابعة بلوتوث'}</p>
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
                      <Button onClick={handleConnect} className="gap-2">
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
