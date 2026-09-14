import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.elmadawy.staff",
  appName: "المعداوي Staff",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: "LIGHT",
      backgroundColor: "#005931",
    },
  },
};

export default config;
