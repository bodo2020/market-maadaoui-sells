import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import NativeBarcodeFab from "./components/NativeBarcodeFab";
import SelfDeviceApproval from "./components/SelfDeviceApproval";
import { installStaffAuthEnhancements } from "./authEnhancer";
import { installNativeAppBridge } from "./nativeAppBridge";
import "./styles.css";
import "./picking.css";
import "./native-safe-area.css";
import "./staff-v05.css";

installStaffAuthEnhancements();
void installNativeAppBridge();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <NativeBarcodeFab />
    <SelfDeviceApproval />
  </React.StrictMode>,
);
