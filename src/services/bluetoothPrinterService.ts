import { toast } from "sonner";

// Type declarations for Web Bluetooth API
// These ensure TypeScript understands the browser's Bluetooth functions.
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

// Interface for our printer object
interface BluetoothPrinter {
  device: BluetoothDevice;
  server?: BluetoothRemoteGATTServer;
  characteristic?: BluetoothRemoteGATTCharacteristic;
}

class BluetoothPrinterService {
  private printer: BluetoothPrinter | null = null;
  
  // Standard UUIDs for Serial Port Profile (SPP) which most thermal printers use.
  private readonly SERVICE_UUID = '00001101-0000-1000-8000-00805f9b34fb';
  private readonly CHARACTERISTIC_UUID = '00001101-0000-1000-8000-00805f9b34fb';

  /**
   * Scans for and connects to a Bluetooth printer.
   */
  async connectPrinter(): Promise<boolean> {
    if (!navigator.bluetooth) {
      toast.error('المتصفح لا يدعم بلوتوث الويب.');
      toast.info('جرب استخدام Chrome أو Edge على جهاز كمبيوتر أو Android.');
      return false;
    }

    try {
      toast.info("جاري البحث عن طابعات، الرجاء اختيار طابعتك...");
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [this.SERVICE_UUID],
      });

      if (!device.gatt) {
        toast.error("لا يمكن الاتصال بهذا الجهاز.");
        return false;
      }

      toast.loading(`جاري الاتصال بـ ${device.name || 'طابعة غير معروفة'}...`);
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(this.SERVICE_UUID);
      const characteristic = await service.getCharacteristic(this.CHARACTERISTIC_UUID);

      this.printer = { device, server, characteristic };

      device.addEventListener('gattserverdisconnected', () => {
        toast.warning("تم فصل اتصال الطابعة.");
        this.printer = null;
      });

      toast.success(`تم الاتصال بنجاح بـ: ${device.name || 'طابعة بلوتوث'}`);
      return true;

    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        toast.error('تم إلغاء اختيار الطابعة.');
      } else {
        toast.error('فشل الاتصال، تأكد أن الطابعة في وضع الاقتران.');
        console.error('Bluetooth connection error:', error);
      }
      return false;
    }
  }

  /**
   * Disconnects from the currently connected printer.
   */
  disconnectPrinter(): void {
    if (this.printer?.server) {
      this.printer.server.disconnect();
      toast.success('تم فصل الطابعة بنجاح.');
    }
    this.printer = null;
  }

  /**
   * Checks if a printer is currently connected.
   */
  isConnected(): boolean {
    return !!this.printer?.server?.connected;
  }
  
  /**
   * Gets the name of the connected printer.
   */
  getSavedPrinter(): { name: string } | null {
      if (this.isConnected() && this.printer?.device.name) {
          return { name: this.printer.device.name };
      }
      return null;
  }

  /**
   * [FIX] This is the missing method. It prints text-based content like invoices.
   * It now correctly calls the internal printData method.
   */
  async printInvoice(text: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    return this.printData(data);
  }

  /**
   * A private helper method to send data chunks to the printer.
   */
  private async printData(data: ArrayBuffer): Promise<boolean> {
    if (!this.isConnected() || !this.printer?.characteristic) {
      toast.error('الطابعة غير متصلة أو غير جاهزة للطباعة.');
      return false;
    }

    try {
      // Sending data in chunks is crucial for reliability.
      const chunkSize = 512;
      for (let i = 0; i < data.byteLength; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await this.printer.characteristic.writeValue(chunk);
      }
      return true;
    } catch (error) {
      console.error('Failed to write to printer:', error);
      toast.error('فشل إرسال البيانات للطابعة.');
      return false;
    }
  }

  /**
   * Runs a simple test print.
   */
  async testPrint(): Promise<boolean> {
    const testText = `
--------------------------------
      Printer Connection Test
      اختبار الاتصال بالطابعة

Date: ${new Date().toLocaleDateString('ar-EG')}
Time: ${new Date().toLocaleTimeString('ar-EG')}

      Success ✓
--------------------------------
\n\n\n`;
    
    toast.info("جاري إرسال صفحة اختبار...");
    const success = await this.printInvoice(testText);
    if(success) {
        toast.success("تم إرسال صفحة الاختبار بنجاح.");
    }
    return success;
  }
}

export const bluetoothPrinterService = new BluetoothPrinterService();
