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
