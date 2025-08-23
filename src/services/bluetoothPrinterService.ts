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
    getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>;
  }
  interface BluetoothRemoteGATTService {
    getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
  }
  interface BluetoothRemoteGATTCharacteristic {
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

  private encodeArabicToCp1256(text: string): Uint8Array {
    const cp1256Map: { [key: string]: number } = {
      '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
      'ˆ': 0x88, '‰': 0x89, '‹': 0x8B, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94,
      '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99, '›': 0x9B, ' ': 0xA0, '،': 0xAC,
      '؟': 0xBF, 'ء': 0xC1, 'آ': 0xC2, 'أ': 0xC3, 'ؤ': 0xC4, 'إ': 0xC5, 'ئ': 0xC6,
      'ا': 0xC7, 'ب': 0xC8, 'ة': 0xC9, 'ت': 0xCA, 'ث': 0xCB, 'ج': 0xCC, 'ح': 0xCD,
      'خ': 0xCE, 'د': 0xCF, 'ذ': 0xD0, 'ر': 0xD1, 'ز': 0xD2, 'س': 0xD3, 'ش': 0xD4,
      'ص': 0xD5, 'ض': 0xD6, 'ط': 0xD7, 'ظ': 0xD8, 'ع': 0xD9, 'غ': 0xDA, 'ـ': 0xDC,
      'ف': 0xE1, 'ق': 0xE2, 'ك': 0xE3, 'ل': 0xE4, 'م': 0xE5, 'ن': 0xE6, 'ه': 0xE7,
      'و': 0xE8, 'ى': 0xE9, 'ي': 0xEA, 'ً': 0xEB, 'ٌ': 0xEC, 'ٍ': 0xED, 'َ': 0xEE,
      'ُ': 0xEF, 'ِ': 0xF0, 'ّ': 0xF1, 'ْ': 0xF2,
    };
    const buffer = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      buffer[i] = cp1256Map[char] || char.charCodeAt(0);
    }
    return buffer;
  }

  async connectPrinter(): Promise<boolean> { if (!navigator.bluetooth) { toast.error('المتصفح لا يدعم بلوتوث الويب.'); return false; } try { const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true }); if (!device.gatt) return false; toast.loading(`جاري الاتصال بـ ${device.name || 'طابعة'}...`); const server = await device.gatt.connect(); const services = await server.getPrimaryServices(); let writableCharacteristic: BluetoothRemoteGATTCharacteristic | null = null; for (const service of services) { const characteristics = await service.getCharacteristics(); const characteristic = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse); if (characteristic) { writableCharacteristic = characteristic; break; } } if (!writableCharacteristic) { toast.error("لم يتم العثور على خدمة طباعة متوافقة."); server.disconnect(); return false; } this.printer = { device, server, characteristic: writableCharacteristic }; device.addEventListener('gattserverdisconnected', () => { this.printer = null; toast.warning("تم فصل اتصال الطابعة."); }); toast.success(`تم الاتصال بنجاح بـ: ${device.name || 'طابعة بلوتوث'}`); return true; } catch (error: any) { if (error.name !== 'NotFoundError') { toast.error('فشل الاتصال، تأكد من إلغاء الاقتران القديم.'); } return false; } }
  disconnectPrinter(): void { if (this.printer?.server?.connected) this.printer.server.disconnect(); this.printer = null; }
  isConnected(): boolean { return !!this.printer?.server?.connected; }
  getConnectedPrinterName(): string | null { return this.printer?.device.name || null; }
  
  private async printData(data: ArrayBuffer): Promise<boolean> {
    if (!this.isConnected() || !this.printer?.characteristic) {
      toast.error('الطابعة غير متصلة أو غير جاهزة.');
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
      toast.error('فشل إرسال البيانات للطابعة.');
      return false;
    }
  }

  async printInvoice(text: string, withInit: boolean = true): Promise<boolean> {
    const commands = [];
    if (withInit) {
      commands.push(new Uint8Array([0x1B, 0x40])); // Init printer
    }
    commands.push(new Uint8Array([0x1B, 0x74, 21])); // Select Arabic codepage
    commands.push(this.encodeArabicToCp1256(text));

    const totalLength = commands.reduce((p, c) => p + c.length, 0);
    const fullData = new Uint8Array(totalLength);
    let offset = 0;
    for (const cmd of commands) {
      fullData.set(cmd, offset);
      offset += cmd.length;
    }
    
    return this.printData(fullData);
  }

  /**
   * [NEW] Prints a raster image (like a logo).
   */
  async printImage(imageElement: HTMLImageElement): Promise<boolean> {
    if (!this.isConnected()) {
      toast.error("الطابعة غير متصلة لطباعة الصورة.");
      return false;
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return false;

    // Resize image to a reasonable width for thermal printers (e.g., 384px)
    const maxWidth = 384;
    const scale = maxWidth / imageElement.width;
    canvas.width = maxWidth;
    canvas.height = imageElement.height * scale;
    context.drawImage(imageElement, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const data = new Uint8Array(canvas.width * canvas.height / 8);
    let dataIndex = 0;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x += 8) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const pixelIndex = (y * canvas.width + x + bit) * 4;
          const r = pixels[pixelIndex];
          const g = pixels[pixelIndex + 1];
          const b = pixels[pixelIndex + 2];
          // Convert to grayscale and check threshold for black/white
          if ((r + g + b) / 3 < 128) {
            byte |= (1 << (7 - bit));
          }
        }
        data[dataIndex++] = byte;
      }
    }

    const widthBytes = canvas.width / 8;
    const heightPixels = canvas.height;
    
    // ESC/POS command to print a raster bit image: GS v 0
    const command = new Uint8Array([
      0x1D, 0x76, 0x30, 0, // GS v 0 m
      widthBytes % 256,    // xL
      Math.floor(widthBytes / 256), // xH
      heightPixels % 256,  // yL
      Math.floor(heightPixels / 256) // yH
    ]);

    const fullData = new Uint8Array(command.length + data.length);
    fullData.set(command);
    fullData.set(data, command.length);

    return this.printData(fullData);
  }

  async testPrint(): Promise<void> {
    const testText = `\n--------------------------------\nPrinter Test - اختبار الطابعة\n\nتم الاتصال بنجاح ✓\n--------------------------------\n\n\n`;
    await this.printInvoice(testText);
  }
}

export const bluetoothPrinterService = new BluetoothPrinterService();
