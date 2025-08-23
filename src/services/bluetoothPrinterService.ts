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
    connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>; // Get all services
  }
  interface BluetoothRemoteGATTService {
    uuid: string;
    getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>; // Get all characteristics
  }
  interface BluetoothRemoteGATTCharacteristic {
    uuid: string;
    properties: BluetoothCharacteristicProperties;
    writeValue(data: ArrayBuffer): Promise<void>;
  }
  interface BluetoothCharacteristicProperties {
    write: boolean;
    writeWithoutResponse: boolean;
  }
}

interface BluetoothPrinter {
  device: BluetoothDevice;
  server: BluetoothRemoteGATTServer;
  characteristic: BluetoothRemoteGATTCharacteristic;
}

class BluetoothPrinterService {
  private printer: BluetoothPrinter | null = null;

  /**
   * [THE FIX] This is a more robust connection method.
   * It connects to the device first, then searches for any writable characteristic.
   */
  async connectPrinter(): Promise<boolean> {
    if (!navigator.bluetooth) {
      toast.error('المتصفح لا يدعم بلوتوث الويب.');
      return false;
    }
    try {
      toast.info("الرجاء اختيار الطابعة من القائمة...");
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true, // We accept any device
        // We don't specify optionalServices to discover everything
      });

      if (!device.gatt) {
        toast.error("لا يمكن الاتصال بهذا الجهاز.");
        return false;
      }

      toast.loading(`جاري الاتصال بـ ${device.name || 'طابعة'}...`);
      const server = await device.gatt.connect();

      // Search for a writable characteristic
      const services = await server.getPrimaryServices();
      let writableCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const characteristic of characteristics) {
          if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
            writableCharacteristic = characteristic;
            break; // Found a writable characteristic
          }
        }
        if (writableCharacteristic) break; // Exit the outer loop as well
      }

      if (!writableCharacteristic) {
        toast.error("لم يتم العثور على خدمة طباعة متوافقة في هذا الجهاز.");
        server.disconnect();
        return false;
      }

      this.printer = { device, server, characteristic: writableCharacteristic };

      device.addEventListener('gattserverdisconnected', () => {
        this.printer = null;
        toast.warning("تم فصل اتصال الطابعة.");
      });

      toast.success(`تم الاتصال بنجاح بـ: ${device.name || 'طابعة بلوتوث'}`);
      return true;

    } catch (error: any) {
      if (error.name !== 'NotFoundError') {
        toast.error('فشل الاتصال، يرجى التأكد من اتباع خطوات التحقق.');
        console.error('Bluetooth connection error:', error);
      }
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
    return !!this.printer?.server?.connected;
  }

  getSavedPrinter(): { name: string } | null {
    if (this.isConnected() && this.printer?.device.name) {
      return { name: this.printer.device.name };
    }
    return null;
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

  async testPrint(): Promise<void> {
    const testText = `\n--------------------------------\n      Printer Connection Test\n\n      Success ✓\n--------------------------------\n\n\n`;
    toast.info("جاري إرسال صفحة اختبار...");
    if (await this.printInvoice(testText)) {
      toast.success("تم إرسال صفحة الاختبار بنجاح.");
    }
  }
}

export const bluetoothPrinterService = new BluetoothPrinterService();
