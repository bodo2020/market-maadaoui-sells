import { toast } from "sonner";

// Minimal Web Bluetooth declarations for browsers that expose the API at runtime.
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
    connected?: boolean;
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
  server: BluetoothRemoteGATTServer;
  characteristic?: BluetoothRemoteGATTCharacteristic;
  isConnected: boolean;
}

export type PrinterConnectionStatus = {
  connected: boolean;
  directBlePrinting: boolean;
  name: string | null;
  id: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

class BluetoothPrinterService {
  private printer: BluetoothPrinter | null = null;
  private readonly SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
  private readonly CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

  async connectPrinter(): Promise<boolean> {
    try {
      if (!navigator.bluetooth) {
        toast.error('المتصفح الحالي لا يدعم Web Bluetooth');
        toast.info('استخدم Chrome أو Edge على جهاز يدعم Bluetooth');
        return false;
      }

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          this.SERVICE_UUID,
          '0000180f-0000-1000-8000-00805f9b34fb',
          '0000180a-0000-1000-8000-00805f9b34fb'
        ]
      });

      if (!device?.gatt) {
        toast.error('الطابعة المختارة لا توفر اتصال Bluetooth GATT');
        return false;
      }

      const server = await device.gatt.connect();
      let characteristic: BluetoothRemoteGATTCharacteristic | undefined;

      try {
        const service = await server.getService(this.SERVICE_UUID);
        characteristic = await service.getCharacteristic(this.CHARACTERISTIC_UUID);
      } catch (error) {
        console.warn('Printer connected but direct BLE write characteristic was not found:', error);
      }

      this.printer = { device, server, characteristic, isConnected: true };

      localStorage.setItem('bluetoothPrinter', JSON.stringify({
        name: device.name || 'طابعة بلوتوث',
        id: device.id,
        directBlePrinting: Boolean(characteristic),
      }));

      if (characteristic) {
        toast.success(`تم ربط ${device.name || 'الطابعة'} للطباعة المباشرة`);
      } else {
        toast.success(`تم ربط ${device.name || 'الطابعة'}`);
        toast.info('الطباعة المباشرة BLE غير متاحة لهذه الطابعة؛ سيتم استخدام نافذة الطباعة عند الحاجة.');
      }
      return true;
    } catch (error: any) {
      console.error('خطأ في الاتصال بالطابعة:', error);
      if (error?.name === 'NotFoundError') toast.error('تم إلغاء اختيار الطابعة');
      else if (error?.name === 'SecurityError') toast.error('تم رفض إذن البلوتوث');
      else if (error?.name === 'NotSupportedError') toast.error('الجهاز أو المتصفح لا يدعم Web Bluetooth');
      else toast.error('فشل الاتصال بالطابعة: ' + (error?.message || 'خطأ غير معروف'));
      return false;
    }
  }

  async disconnectPrinter(): Promise<void> {
    try {
      if (this.printer?.server?.connected !== false) this.printer?.server?.disconnect();
    } catch {
      // The OS may already have disconnected the device.
    }
    this.printer = null;
    localStorage.removeItem('bluetoothPrinter');
    toast.success('تم فصل الطابعة');
  }

  isConnected(): boolean {
    return Boolean(this.printer?.isConnected && this.printer.server?.connected !== false);
  }

  hasDirectBlePrinting(): boolean {
    return Boolean(this.isConnected() && this.printer?.characteristic);
  }

  getStatus(): PrinterConnectionStatus {
    return {
      connected: this.isConnected(),
      directBlePrinting: this.hasDirectBlePrinting(),
      name: this.printer?.device?.name || this.getSavedPrinter()?.name || null,
      id: this.printer?.device?.id || this.getSavedPrinter()?.id || null,
    };
  }

  getSavedPrinter(): { name: string; id: string; directBlePrinting?: boolean } | null {
    try {
      const saved = localStorage.getItem('bluetoothPrinter');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }

  private async writeBleChunks(text: string) {
    const characteristic = this.printer?.characteristic;
    if (!characteristic) return false;
    const bytes = new TextEncoder().encode(text + '\n\n\n');
    const chunkSize = 180;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.slice(offset, Math.min(bytes.length, offset + chunkSize));
      await characteristic.writeValue(chunk.buffer);
      if (bytes.length > chunkSize) await new Promise(resolve => setTimeout(resolve, 20));
    }
    return true;
  }

  private printThroughBrowser(text: string): boolean {
    const printWindow = window.open('', '_blank', 'width=360,height=600');
    if (!printWindow) {
      toast.error('المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع.');
      return false;
    }

    printWindow.document.write(`
      <html dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>طباعة فاتورة</title>
          <style>
            @page { margin: 2mm; }
            body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; direction: rtl; }
            pre { white-space: pre-wrap; word-break: break-word; margin: 0; font-family: Arial, sans-serif; }
          </style>
        </head>
        <body><pre>${escapeHtml(text)}</pre></body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
      window.setTimeout(() => printWindow.close(), 1000);
    }, 250);
    return true;
  }

  async printText(text: string): Promise<boolean> {
    try {
      if (this.hasDirectBlePrinting()) {
        await this.writeBleChunks(text);
        toast.success('تم إرسال الفاتورة للطابعة');
        return true;
      }
      return this.printThroughBrowser(text);
    } catch (error) {
      console.error('خطأ في الطباعة:', error);
      this.printer = this.printer ? { ...this.printer, isConnected: false } : null;
      toast.error('انقطع الاتصال بالطابعة. افتح إعدادات الطابعة وأعد الربط.');
      return false;
    }
  }

  async printBarcode(canvas: HTMLCanvasElement): Promise<boolean> {
    try {
      const dataURL = canvas.toDataURL('image/png');
      const printWindow = window.open('', '_blank', 'width=360,height=300');
      if (!printWindow) {
        toast.error('المتصفح منع نافذة الطباعة');
        return false;
      }
      printWindow.document.write(`
        <html><head><meta charset="utf-8" /><title>طباعة باركود</title>
        <style>@page{margin:2mm}body{margin:0;text-align:center}img{max-width:100%;height:auto}</style></head>
        <body><img src="${dataURL}" alt="Barcode" /></body></html>
      `);
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => {
        printWindow.print();
        window.setTimeout(() => printWindow.close(), 1000);
      }, 250);
      return true;
    } catch (error) {
      console.error('خطأ في طباعة الباركود:', error);
      toast.error('فشل في طباعة الباركود');
      return false;
    }
  }

  async testPrint(): Promise<boolean> {
    return this.printText(`
================================
         اختبار طباعة
================================
التاريخ: ${new Date().toLocaleDateString('ar-EG')}
الوقت: ${new Date().toLocaleTimeString('ar-EG')}

إذا ظهرت هذه الورقة فإعداد الطابعة جاهز.
================================
`);
  }

  generateInvoiceText(sale: any, storeInfo: any): string {
    const date = new Date(sale.date).toLocaleDateString('ar-EG');
    const time = new Date(sale.date).toLocaleTimeString('ar-EG');
    const currency = storeInfo.currency || 'ج.م';
    const loyaltyCoupon = Number(sale.loyalty_voucher_amount || 0);
    const amountPaid = Math.max(0, Number(sale.amount_due ?? (Number(sale.total || 0) - loyaltyCoupon)));
    let invoiceText = '';

    invoiceText += '================================\n';
    invoiceText += `        ${storeInfo.name}\n`;
    if (storeInfo.address) invoiceText += `    ${storeInfo.address}\n`;
    if (storeInfo.phone) invoiceText += `    هاتف: ${storeInfo.phone}\n`;
    invoiceText += '================================\n\n';
    invoiceText += `رقم الفاتورة: ${sale.invoice_number}\n`;
    invoiceText += `التاريخ: ${date}\n`;
    invoiceText += `الوقت: ${time}\n`;
    if (sale.customer_name) invoiceText += `العميل: ${sale.customer_name}\n`;
    invoiceText += '--------------------------------\n';

    sale.items.forEach((item: any) => {
      invoiceText += `${item.product.name}\n`;
      const qty = item.weight ? `${Number(item.weight).toFixed(3)} كجم` : `${item.quantity}`;
      invoiceText += `  ${qty} × ${Number(item.price || 0).toFixed(2)} = ${Number(item.total || 0).toFixed(2)}\n`;
    });

    invoiceText += '--------------------------------\n';
    invoiceText += `المجموع الفرعي: ${Number(sale.subtotal || 0).toFixed(2)} ${currency}\n`;
    if (Number(sale.discount || 0) > 0) invoiceText += `خصومات المنتجات: -${Number(sale.discount).toFixed(2)} ${currency}\n`;
    invoiceText += `الإجمالي بعد خصومات المنتجات: ${Number(sale.total || 0).toFixed(2)} ${currency}\n`;
    if (loyaltyCoupon > 0) invoiceText += `خصم كوبون الولاء: -${loyaltyCoupon.toFixed(2)} ${currency}\n`;
    invoiceText += `المدفوع فعليًا: ${amountPaid.toFixed(2)} ${currency}\n\n`;

    const paymentMethod = sale.payment_method === 'cash' ? 'نقدي' : sale.payment_method === 'card' ? 'بطاقة' : 'مختلط';
    invoiceText += `طريقة الدفع: ${paymentMethod}\n`;
    if (Number(sale.cash_amount || 0) > 0) invoiceText += `المبلغ النقدي: ${Number(sale.cash_amount).toFixed(2)} ${currency}\n`;
    if (Number(sale.card_amount || 0) > 0) invoiceText += `مبلغ البطاقة: ${Number(sale.card_amount).toFixed(2)} ${currency}\n`;
    if (loyaltyCoupon > 0) invoiceText += `كوبون الخصم: ${loyaltyCoupon.toFixed(2)} ${currency}\n`;
    invoiceText += '\n================================\n';
    invoiceText += `       ${storeInfo.footer || 'شكراً لزيارتكم!'}\n`;
    invoiceText += '================================\n';
    return invoiceText;
  }
}

export const bluetoothPrinterService = new BluetoothPrinterService();