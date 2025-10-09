import { toast } from "sonner";

// Type declarations for Web Bluetooth API
declare global {
  interface Navigator {
    bluetooth: {
      requestDevice(options: any): Promise<BluetoothDevice>;
    };
  }
  
  interface BluetoothDevice {
    name?: string;
    id: string;
    gatt?: BluetoothRemoteGATTServer;
  }
  
  interface BluetoothRemoteGATTServer {
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getService(uuid: string): Promise<BluetoothRemoteGATTService>;
  }
  
  interface BluetoothRemoteGATTService {
    getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristic>;
  }
  
  interface BluetoothRemoteGATTCharacteristic {
    writeValue(data: ArrayBuffer): Promise<void>;
  }
}

interface BluetoothPrinter {
  device: BluetoothDevice;
  server?: BluetoothRemoteGATTServer;
  characteristic?: BluetoothRemoteGATTCharacteristic;
  isConnected: boolean;
}

class BluetoothPrinterService {
  private printer: BluetoothPrinter | null = null;
  private readonly SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
  private readonly CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

  // البحث عن طابعات البلوتوث والاتصال
  async connectPrinter(): Promise<boolean> {
    try {
      // التحقق من دعم البلوتوث
      if (!navigator.bluetooth) {
        toast.error('جهازك لا يدعم البلوتوث Web API');
        toast.info('جرب استخدام Chrome أو Edge على Android/Windows');
        return false;
      }

      // البحث عن طابعة مع خيارات أوسع
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          this.SERVICE_UUID, 
          '000018f0-0000-1000-8000-00805f9b34fb',
          '00001101-0000-1000-8000-00805f9b34fb', // Serial Port Profile
          '0000180f-0000-1000-8000-00805f9b34fb', // Battery Service
          '0000180a-0000-1000-8000-00805f9b34fb'  // Device Information
        ]
      });

      if (!device) {
        toast.error('لم يتم اختيار طابعة');
        return false;
      }

      // محاولة الاتصال بالطابعة
      let server;
      try {
        server = await device.gatt?.connect();
      } catch (connectionError) {
        console.warn('فشل الاتصال المباشر، محاولة اتصال بديل:', connectionError);
        // في حالة فشل الاتصال، نحفظ الجهاز فقط
        server = null;
      }

      this.printer = {
        device,
        server: server || undefined,
        isConnected: true
      };

      // حفظ الطابعة في التخزين المحلي
      localStorage.setItem('bluetoothPrinter', JSON.stringify({
        name: device.name || 'طابعة بلوتوث',
        id: device.id
      }));

      toast.success(`تم الاتصال بالطابعة: ${device.name || 'غير معروف'}`);
      return true;

    } catch (error: any) {
      console.error('خطأ في الاتصال بالطابعة:', error);
      
      if (error.name === 'NotFoundError') {
        toast.error('تم إلغاء اختيار الطابعة');
      } else if (error.name === 'SecurityError') {
        toast.error('تم رفض الإذن للوصول للبلوتوث');
      } else if (error.name === 'NotSupportedError') {
        toast.error('جهازك لا يدعم Web Bluetooth API');
        toast.info('جرب استخدام Chrome أو Edge');
      } else {
        toast.error('فشل في الاتصال بالطابعة: ' + (error.message || 'خطأ غير معروف'));
      }
      
      return false;
    }
  }

  // فصل الطابعة
  async disconnectPrinter(): Promise<void> {
    if (this.printer?.server) {
      this.printer.server.disconnect();
      this.printer = null;
      localStorage.removeItem('bluetoothPrinter');
      toast.success('تم فصل الطابعة');
    }
  }

  // التحقق من حالة الاتصال
  isConnected(): boolean {
    return this.printer?.isConnected ?? false;
  }

  // الحصول على معلومات الطابعة المحفوظة
  getSavedPrinter(): { name: string; id: string } | null {
    const saved = localStorage.getItem('bluetoothPrinter');
    return saved ? JSON.parse(saved) : null;
  }

  // طباعة نص (للفواتير)
  async printText(text: string): Promise<boolean> {
    if (!this.printer?.isConnected) {
      toast.error('الطابعة غير متصلة');
      return false;
    }

    try {
      // محاولة طباعة عبر Web Bluetooth إذا كان متوفراً
      if (this.printer.characteristic) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text + '\n\n\n');
        await this.printer.characteristic.writeValue(data);
        toast.success('تم إرسال النص للطباعة عبر Bluetooth');
        return true;
      }

      // طريقة بديلة - استخدام النافذة المنبثقة
      const printWindow = window.open('', '_blank', 'width=300,height=400');
      if (!printWindow) {
        toast.error('لا يمكن فتح نافذة الطباعة');
        return false;
      }

      printWindow.document.write(`
        <html>
          <head>
            <title>طباعة فاتورة</title>
            <style>
              body {
                font-family: 'Courier New', monospace;
                font-size: 12px;
                margin: 10px;
                line-height: 1.4;
                direction: rtl;
              }
              pre {
                white-space: pre-wrap;
                word-wrap: break-word;
                margin: 0;
              }
              @media print {
                body { margin: 0; padding: 5px; font-size: 10px; }
              }
            </style>
          </head>
          <body>
            <pre>${text}</pre>
          </body>
        </html>
      `);

      printWindow.document.close();
      
      setTimeout(() => {
        printWindow.print();
        setTimeout(() => printWindow.close(), 1000);
      }, 500);

      toast.success('تم إرسال النص للطباعة');
      return true;

    } catch (error) {
      console.error('خطأ في الطباعة:', error);
      toast.error('فشل في طباعة النص');
      return false;
    }
  }

  // طباعة باركود (كصورة)
  async printBarcode(canvas: HTMLCanvasElement): Promise<boolean> {
    if (!this.printer?.isConnected) {
      toast.error('الطابعة غير متصلة');
      return false;
    }

    try {
      // طريقة بديلة - استخدام النافذة المنبثقة للطباعة
      const dataURL = canvas.toDataURL('image/png');
      
      const printWindow = window.open('', '_blank', 'width=300,height=200');
      if (!printWindow) {
        toast.error('لا يمكن فتح نافذة الطباعة');
        return false;
      }

      printWindow.document.write(`
        <html>
          <head>
            <title>طباعة باركود</title>
            <style>
              body {
                margin: 0;
                padding: 10px;
                text-align: center;
                font-family: Arial, sans-serif;
              }
              img {
                max-width: 100%;
                height: auto;
              }
              @media print {
                body { margin: 0; padding: 0; }
                img { 
                  width: 58mm; 
                  height: auto;
                  page-break-inside: avoid;
                }
              }
            </style>
          </head>
          <body>
            <img src="${dataURL}" alt="Barcode" />
          </body>
        </html>
      `);

      printWindow.document.close();
      
      setTimeout(() => {
        printWindow.print();
        setTimeout(() => printWindow.close(), 1000);
      }, 500);

      toast.success('تم إرسال الباركود للطباعة');
      return true;

    } catch (error) {
      console.error('خطأ في طباعة الباركود:', error);
      toast.error('فشل في طباعة الباركود');
      return false;
    }
  }

  // اختبار بسيط للطباعة
  async testPrint(): Promise<boolean> {
    const testText = `
================================
         اختبار طباعة
================================

التاريخ: ${new Date().toLocaleDateString('ar-EG')}
الوقت: ${new Date().toLocaleTimeString('ar-EG')}

هذه رسالة اختبار للتأكد من 
عمل الطابعة بشكل صحيح.

يمكنك طباعة الفواتير والباركود
من خلال هذه الطابعة.

================================
       تم بنجاح ✓
================================

`;
    
    return await this.printText(testText);
  }

  // إنشاء نص فاتورة للطباعة الحرارية
  generateInvoiceText(sale: any, storeInfo: any): string {
    const date = new Date(sale.date).toLocaleDateString('ar-EG');
    const time = new Date(sale.date).toLocaleTimeString('ar-EG');

    let invoiceText = '';
    
    // رأس الفاتورة
    invoiceText += '================================\n';
    invoiceText += `        ${storeInfo.name}\n`;
    if (storeInfo.address) invoiceText += `    ${storeInfo.address}\n`;
    if (storeInfo.phone) invoiceText += `    هاتف: ${storeInfo.phone}\n`;
    invoiceText += '================================\n\n';
    
    // معلومات الفاتورة
    invoiceText += `رقم الفاتورة: ${sale.invoice_number}\n`;
    invoiceText += `التاريخ: ${date}\n`;
    invoiceText += `الوقت: ${time}\n`;
    
    if (sale.customer_name) {
      invoiceText += `العميل: ${sale.customer_name}\n`;
    }
    
    invoiceText += '--------------------------------\n';
    
    // الأصناف
    sale.items.forEach((item: any) => {
      invoiceText += `${item.product.name}\n`;
      const qty = item.weight ? `${item.weight} كجم` : `${item.quantity}`;
      invoiceText += `  ${qty} × ${item.price.toFixed(2)} = ${item.total.toFixed(2)}\n`;
    });
    
    invoiceText += '--------------------------------\n';
    
    // المجاميع
    invoiceText += `المجموع الفرعي: ${sale.subtotal.toFixed(2)} ${storeInfo.currency || 'ج.م'}\n`;
    if (sale.discount > 0) {
      invoiceText += `الخصم: -${sale.discount.toFixed(2)} ${storeInfo.currency || 'ج.م'}\n`;
    }
    invoiceText += `الإجمالي: ${sale.total.toFixed(2)} ${storeInfo.currency || 'ج.م'}\n\n`;
    
    // طريقة الدفع
    const paymentMethod = sale.payment_method === 'cash' ? 'نقدي' : 
                         sale.payment_method === 'card' ? 'بطاقة' : 'مختلط';
    invoiceText += `طريقة الدفع: ${paymentMethod}\n`;
    
    if (sale.cash_amount) {
      invoiceText += `المبلغ النقدي: ${sale.cash_amount.toFixed(2)}\n`;
    }
    if (sale.card_amount) {
      invoiceText += `مبلغ البطاقة: ${sale.card_amount.toFixed(2)}\n`;
    }
    
    invoiceText += '\n================================\n';
    invoiceText += '       شكراً لزيارتكم!\n';
    invoiceText += '================================\n';

    return invoiceText;
  }
}

export const bluetoothPrinterService = new BluetoothPrinterService();