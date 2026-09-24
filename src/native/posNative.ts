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
type ThermalPrinterPlugin = {
  listPaired(options: { operation: 'list' }): Promise<{ devices: PairedPrinter[] }>;
  select(options: { operation: 'save'; address: string; paperSize: '58mm' | '80mm' }): Promise<{ address: string; name: string; paperSize: string }>;
  getSelected(): Promise<{ address: string | null; name: string | null; paperSize: string }>;
  clear(): Promise<void>;
  printHtml(options: { operation: 'print'; html: string }): Promise<{ printed: boolean }>;
};
type DevicePlugin = {
  getInsets(): Promise<{ top?: number; bottom?: number; left?: number; right?: number }>;
  get(options: { branchId: string }): Promise<{ device: string | null }>;
  save(options: { branchId: string; device: string }): Promise<void>;
  remove(options: { branchId: string }): Promise<void>;
};

export const posThermalPrinter = registerPlugin<ThermalPrinterPlugin>('PosThermalPrinter');
export const posDevice = registerPlugin<DevicePlugin>('PosDevice');
