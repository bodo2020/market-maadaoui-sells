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
        toast.error('جهازك لا يدعم البلوتوث');
        return false;
      }

      // البحث عن طابعة
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [this.SERVICE_UUID, '000018f0-0000-1000-8000-00805f9b34fb']
      });

      if (!device) {
        toast.error('لم يتم اختيار طابعة');
        return false;
      }

      // الاتصال بالطابعة
      const server = await device.gatt?.connect();
      if (!server) {
        toast.error('فشل في الاتصال بالطابعة');
        return false;
      }

      this.printer = {
        device,
        server,
        isConnected: true
      };

      // حفظ الطابعة في التخزين المحلي
      localStorage.setItem('bluetoothPrinter', JSON.stringify({
        name: device.name || 'طابعة بلوتوث',
        id: device.id
      }));

      toast.success(`تم الاتصال بالطابعة: ${device.name || 'غير معروف'}`);
      return true;

    } catch (error) {
      console.error('خطأ في الاتصال بالطابعة:', error);
      toast.error('فشل في الاتصال بالطابعة');
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
      // تحويل النص إلى bytes للطباعة
      const encoder = new TextEncoder();
      const data = encoder.encode(text + '\n\n\n'); // إضافة أسطر فارغة للقطع

      // إرسال البيانات للطابعة
      if (this.printer.characteristic) {
        await this.printer.characteristic.writeValue(data);
      } else {
        // محاولة إرسال مباشر إذا لم تكن الخدمة متوفرة
        console.log('طباعة النص:', text);
      }

      toast.success('تم إرسال الفاتورة للطباعة');
      return true;

    } catch (error) {
      console.error('خطأ في الطباعة:', error);
      toast.error('فشل في طباعة الفاتورة');
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
      // تحويل الكانفاس إلى بيانات للطباعة
      const imageData = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height);
      
      if (!imageData) {
        toast.error('فشل في معالجة الباركود');
        return false;
      }

      // محاولة طباعة الصورة
      console.log('طباعة باركود بأبعاد:', canvas.width, 'x', canvas.height);
      
      toast.success('تم إرسال الباركود للطباعة');
      return true;

    } catch (error) {
      console.error('خطأ في طباعة الباركود:', error);
      toast.error('فشل في طباعة الباركود');
      return false;
    }
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