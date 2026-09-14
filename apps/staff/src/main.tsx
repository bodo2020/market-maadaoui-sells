import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import NativeBarcodeFab from "./components/NativeBarcodeFab";
import { installStaffAuthEnhancements } from "./authEnhancer";
import { installNativeAppBridge } from "./nativeAppBridge";
import "./styles.css";
import "./picking.css";
import "./native-safe-area.css";

installStaffAuthEnhancements();
void installNativeAppBridge();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <NativeBarcodeFab />
  </React.StrictMode>,
);
