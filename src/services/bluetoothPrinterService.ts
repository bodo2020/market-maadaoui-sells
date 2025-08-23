import { toast } from "sonner";

// Type declarations for Web Bluetooth API
declare global {
  interface Navigator {
    bluetooth: {
      requestDevice(options?: any): Promise<BluetoothDevice>;
    };
  }
  interface BluetoothDevice {
    name?: string;
    id: string;
    gatt?: BluetoothRemoteGATTServer;
    addEventListener(type: 'gattserverdisconnected', listener: (this: this, ev: Event) => any): void;
  }
  interface BluetoothRemoteGATTServer {
    connected: boolean; // This property exists on the server object
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTService>;
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
  characteristic: BluetoothRemoteGATTCharacteristic;
}

class BluetoothPrinterService {
  private printer: BluetoothPrinter | null = null;
  
  private readonly SERVICE_UUID = '00001101-0000-1000-8000-00805f9b34fb';
  private readonly CHARACTERISTIC_UUID = '00001101-0000-1000-8000-00805f9b34fb';

  async connectPrinter(): Promise<boolean> {
    if (!navigator.bluetooth) {
      toast.error('المتصفح لا يدعم بلوتوث الويب.');
      return false;
    }
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [this.SERVICE_UUID],
      });
      if (!device.gatt) return false;

      toast.loading(`جاري الاتصال بـ ${device.name || 'طابعة'}...`);
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(this.SERVICE_UUID);
      const characteristic = await service.getCharacteristic(this.CHARACTERISTIC_UUID);
      this.printer = { device, server, characteristic };
      device.addEventListener('gattserverdisconnected', () => {
        this.printer = null;
        toast.warning("تم فصل اتصال الطابعة.");
      });
      toast.success(`تم الاتصال بنجاح بـ: ${device.name || 'طابعة بلوتوث'}`);
      return true;
    } catch (error) {
      toast.error('فشل الاتصال، تأكد أن الطابعة في وضع الاقتران.');
      return false;
    }
  }

  disconnectPrinter(): void {
    if (this.printer?.server?.connected) {
      this.printer.server.disconnect();
    }
    this.printer = null;
  }

  isConnected(): boolean {
    // [FIX] Correctly checks the 'connected' property
    return !!this.printer?.server?.connected;
  }
  
  // [FIX] Added missing method 'getSavedPrinter'
  getSavedPrinter(): { name: string } | null {
    if (this.isConnected() && this.printer?.device.name) {
      return { name: this.printer.device.name };
    }
    return null;
  }

  getConnectedPrinterName(): string | null {
    return this.getSavedPrinter()?.name || null;
  }

  // [FIX] Added missing method 'printText' as an alias for printInvoice
  async printText(text: string): Promise<boolean> {
    return this.printInvoice(text);
  }

  async printInvoice(text: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    return this.printData(data);
  }

  private async printData(data: ArrayBuffer): Promise<boolean> {
    if (!this.isConnected() || !this.printer?.characteristic) {
      toast.error('الطابعة غير متصلة أو غير جاهزة.');
      return false;
    }
    try {
      const chunkSize = 512;
      for (let i = 0; i < data.byteLength; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await this.printer.characteristic.writeValue(chunk);
      }
      return true;
    } catch (error) {
      toast.error('فشل إرسال البيانات للطابعة.');
      return false;
    }
  }

  // [FIX] Added missing method 'printBarcode' using a popup window
  async printBarcode(canvas: HTMLCanvasElement): Promise<boolean> {
    const dataURL = canvas.toDataURL('image/png');
    const printWindow = window.open('', '_blank', 'width=300,height=200');
    if (!printWindow) {
      toast.error('لا يمكن فتح نافذة الطباعة. الرجاء السماح بالنوافذ المنبثقة.');
      return false;
    }
    printWindow.document.write(`<html><body style="margin:0;"><img src="${dataURL}" onload="window.print();window.close()" /></body></html>`);
    printWindow.document.close();
    return true;
  }

  async testPrint(): Promise<void> {
    const testText = `\n--------------------------------\n      Printer Connection Test\n\n      Success ✓\n--------------------------------\n\n\n`;
    toast.info("جاري إرسال صفحة اختبار...");
    if (await this.printInvoice(testText)) {
      toast.success("تم إرسال صفحة الاختبار بنجاح.");
    }
  }

  // [FIX] Added missing method 'generateInvoiceText'
  generateInvoiceText(sale: any, storeInfo: any): string {
    let text = `${storeInfo.name}\n`;
    text += '--------------------------------\n';
    text += `Invoice: ${sale.invoice_number}\n`;
    text += `Date: ${new Date(sale.date).toLocaleString('ar-EG')}\n`;
    text += '--------------------------------\n';
    sale.items.forEach((item: any) => {
      text += `${item.product.name}\n`;
      text += `  ${item.quantity} x ${item.price.toFixed(2)} = ${item.total.toFixed(2)}\n`;
    });
    text += '--------------------------------\n';
    text += `Total: ${sale.total.toFixed(2)} ${storeInfo.currency || 'EGP'}\n`;
    text += '\nThank You!\n\n\n';
    return text;
  }
}

export const bluetoothPrinterService = new BluetoothPrinterService();
