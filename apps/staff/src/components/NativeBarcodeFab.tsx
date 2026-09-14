import { useEffect, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerAndroidScanningLibrary,
  CapacitorBarcodeScannerCameraDirection,
  CapacitorBarcodeScannerScanOrientation,
  CapacitorBarcodeScannerTypeHintALLOption,
} from "@capacitor/barcode-scanner";

function writeReactInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.focus();
}

export default function NativeBarcodeFab() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPath((current) => current === window.location.pathname ? current : window.location.pathname);
    }, 300);
    return () => window.clearInterval(timer);
  }, []);

  const visible = Capacitor.isNativePlatform() && /^\/operations\/[^/]+$/.test(path);
  if (!visible) return null;

  const scan = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHintALLOption.ALL,
        scanInstructions: "وجّه الكاميرا نحو باركود المنتج",
        scanText: "مسح الباركود",
        cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
        scanOrientation: CapacitorBarcodeScannerScanOrientation.PORTRAIT,
        android: {
          scanningLibrary: CapacitorBarcodeScannerAndroidScanningLibrary.ZXING,
        },
      });

      const code = result.ScanResult?.trim();
      if (!code) return;
      const input = document.querySelector<HTMLInputElement>('input[placeholder="Barcode"]');
      if (!input) return;
      writeReactInput(input, code);
      window.setTimeout(() => input.closest("form")?.requestSubmit(), 180);
    } catch (error) {
      console.warn("Native barcode scan cancelled or failed", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      aria-label="مسح الباركود بالكاميرا"
      onClick={() => void scan()}
      disabled={busy}
      style={{
        position: "fixed",
        left: 18,
        bottom: 92,
        zIndex: 1000,
        width: 58,
        height: 58,
        border: 0,
        borderRadius: 20,
        display: "grid",
        placeItems: "center",
        background: "#005931",
        color: "white",
        boxShadow: "0 10px 30px rgba(0,0,0,.22)",
      }}
    >
      {busy ? <Loader2 size={27} className="spin" /> : <Camera size={27} />}
    </button>
  );
}
