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
    addEventListener(
      type: "gattserverdisconnected",
      listener: (this: this, ev: Event) => any
    ): void;
  }
  interface BluetoothRemoteGATTServer {
    connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>;
  }
  interface BluetoothRemoteGATTService {
    uuid: string;
    getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
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
   * دالة بسيطة لعكس النص العربي (علشان الطابعة تطبعه من اليمين لليسار)
   */
  private reshapeArabic(text: string): string {
    return text.split("").reverse().join("");
  }

  async connectPrinter(): Promise<boolean> {
    if (!navigator.bluetooth) {
      toast.error("المتصفح لا يدعم بلوتوث الويب.");
      return false;
    }
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
      });
      if (!device.gatt) return false;
      toast.loading(`جاري الاتصال بـ ${device.name || "طابعة"}...`);
      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();
      let writableCharacteristic: BluetoothRemoteGATTCharacteristic | null =
        null;
      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        const characteristic = characteristics.find(
          (c) => c.properties.write || c.properties.writeWithoutResponse
        );
        if (characteristic) {
          writableCharacteristic = characteristic;
          break;
        }
      }
      if (!writableCharacteristic) {
        toast.error("لم يتم العثور على خدمة طباعة متوافقة.");
        server.disconnect();
        return false;
      }
      this.printer = { device, server, characteristic: writableCharacteristic };
      device.addEventListener("gattserverdisconnected", () => {
        this.printer = null;
        toast.warning("تم فصل اتصال الطابعة.");
      });
      toast.success(`تم الاتصال بنجاح بـ: ${device.name || "طابعة بلوتوث"}`);
      return true;
    } catch (error: any) {
      if (error.name !== "NotFoundError") {
        toast.error("فشل الاتصال، تأكد من إلغاء الاقتران القديم.");
      }
      return false;
    }
  }

  disconnectPrinter(): void {
    if (this.printer?.server?.connected) this.printer.server.disconnect();
    this.printer = null;
  }

  isConnected(): boolean {
    return !!this.printer?.server?.connected;
  }

  getConnectedPrinterName(): string | null {
    return this.printer?.device.name || null;
  }

  async printInvoice(text: string): Promise<boolean> {
    // [1] Initialize
    const init = new Uint8Array([0x1B, 0x40]);

    // [2] اختيار Arabic Code Page (PC864 = 22)
    const selectArabic = new Uint8Array([0x1B, 0x74, 22]);

    // [3] reshaping للنص العربي
    const reshaped = this.reshapeArabic(text);

    // [4] تحويل النص لـ UTF-8
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(reshaped + "\n\n");

    // [5] دمج الأوامر
    const fullData = new Uint8Array(
      init.length + selectArabic.length + encodedText.length
    );
    fullData.set(init);
    fullData.set(selectArabic, init.length);
    fullData.set(encodedText, init.length + selectArabic.length);

    return this.printData(fullData);
  }

  private async printData(data: ArrayBuffer): Promise<boolean> {
    if (!this.isConnected() || !this.printer?.characteristic) {
      toast.error("الطابعة غير متصلة أو غير جاهزة.");
      return false;
    }
    try {
      const chunkSize = 128;
      for (let i = 0; i < data.byteLength; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await this.printer.characteristic.writeValue(chunk);
      }
      return true;
    } catch (error) {
      toast.error("فشل إرسال البيانات للطابعة.");
      return false;
    }
  }

  async testPrint(): Promise<void> {
    const testText = `
--------------------------------
اختبار الطابعة - Printer Test
نجاح ✓
--------------------------------
`;
    toast.info("جاري إرسال صفحة اختبار...");
    if (await this.printInvoice(testText)) {
      toast.success("تم إرسال صفحة الاختبار بنجاح.");
    }
  }
}

export const bluetoothPrinterService = new BluetoothPrinterService();
