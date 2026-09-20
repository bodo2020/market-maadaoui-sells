import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elmadawy.business',
  appName: 'المعداوي للأعمال',
  webDir: 'dist',
  backgroundColor: '#F6F8F7',
  loggingBehavior: 'debug',
  android: {
    backgroundColor: '#F6F8F7',
    allowMixedContent: false,
  },
};

export default config;
