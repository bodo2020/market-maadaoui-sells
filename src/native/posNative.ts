import { Capacitor, registerPlugin } from '@capacitor/core';

export const isPosNative = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

type PrintPlugin = {
  printHtml(options: { html: string; title: string; paperSize: '58mm' | '80mm' | 'a4' }): Promise<{ started: boolean }>;
};
type CredentialsPlugin = {
  savePassword(options: { username: string; password: string }): Promise<{ saved: boolean }>;
  getPassword(): Promise<{ username: string; password: string }>;
};

export const posPrint = registerPlugin<PrintPlugin>('PosPrint');
export const posCredentials = registerPlugin<CredentialsPlugin>('PosCredentials');

type PairedPrinter = { address: string; name: string };
type UsbPrinter = { deviceId: number; vendorId: number; productId: number; name: string; permission: boolean };
type SelectedPrinter = {
  address: string | null;
  name: string | null;
  paperSize: string;
  transport?: 'bluetooth' | 'usb';
  usbDeviceId?: number | null;
};
type ThermalPrinterPlugin = {
  listPaired(options: { operation: 'list' }): Promise<{ devices: PairedPrinter[] }>;
  listUsb(): Promise<{ devices: UsbPrinter[] }>;
  select(options: { operation: 'save'; address: string; paperSize: '58mm' | '80mm' }): Promise<SelectedPrinter>;
  selectUsb(options: { deviceId: number; paperSize: '58mm' | '80mm' }): Promise<SelectedPrinter>;
  getSelected(): Promise<SelectedPrinter>;
  clear(): Promise<void>;
  printHtml(options: { operation: 'print'; html: string }): Promise<{ printed: boolean }>;
  printReceipt(options: { operation: 'printReceipt'; receipt: Record<string, unknown> }): Promise<{
    printed: boolean;
    mode?: string;
    prepareMs?: number;
    sendMs?: number;
    totalMs?: number;
    persistentConnection?: boolean;
    transport?: 'bluetooth' | 'usb';
  }>;
  testConnection(options: { operation: 'test' }): Promise<{ sent: boolean; persistent?: boolean; transport?: string }>;
};
type DevicePlugin = {
  getInsets(): Promise<{ top?: number; bottom?: number; left?: number; right?: number }>;
  get(options: { branchId: string }): Promise<{ device: string | null }>;
  save(options: { branchId: string; device: string }): Promise<void>;
  remove(options: { branchId: string }): Promise<void>;
};

export const posThermalPrinter = registerPlugin<ThermalPrinterPlugin>('PosThermalPrinter');
export const posDevice = registerPlugin<DevicePlugin>('PosDevice');
