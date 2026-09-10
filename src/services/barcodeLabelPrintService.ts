import JsBarcode from "jsbarcode";
import { siteConfig } from "@/config/site";

export type BarcodeLabelSize = "25x15" | "30x20" | "40x25" | "50x30";

export type BarcodeLabelPreferences = {
  size: BarcodeLabelSize;
  copies: number;
  showProductName: boolean;
  showPrice: boolean;
  showStoreName: boolean;
  showBarcodeText: boolean;
};

export type BarcodeLabelItem = {
  id: string;
  name: string;
  barcode: string;
  price: number;
  unit?: string | null;
  barcodeType?: string | null;
};

export const BARCODE_LABEL_SIZES: Record<BarcodeLabelSize, { width: number; height: number; label: string }> = {
  "25x15": { width: 25, height: 15, label: "25 × 15 مم" },
  "30x20": { width: 30, height: 20, label: "30 × 20 مم" },
  "40x25": { width: 40, height: 25, label: "40 × 25 مم" },
  "50x30": { width: 50, height: 30, label: "50 × 30 مم" },
};

const STORAGE_KEY = "elmadawy.barcode.label.v2";
const DEFAULTS: BarcodeLabelPreferences = {
  size: "40x25",
  copies: 1,
  showProductName: true,
  showPrice: true,
  showStoreName: true,
  showBarcodeText: true,
};

function clampCopies(value: number) {
  return Math.min(20, Math.max(1, Math.round(Number(value || 1))));
}

export function getBarcodeLabelPreferences(): BarcodeLabelPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<BarcodeLabelPreferences>;
    return {
      size: parsed.size && parsed.size in BARCODE_LABEL_SIZES ? parsed.size : DEFAULTS.size,
      copies: clampCopies(Number(parsed.copies || 1)),
      showProductName: parsed.showProductName ?? true,
      showPrice: parsed.showPrice ?? true,
      showStoreName: parsed.showStoreName ?? true,
      showBarcodeText: parsed.showBarcodeText ?? true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveBarcodeLabelPreferences(input: BarcodeLabelPreferences) {
  const normalized = { ...input, copies: clampCopies(input.copies) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function barcodeDataUrl(value: string, size: BarcodeLabelSize) {
  const dimensions = BARCODE_LABEL_SIZES[size];
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, value, {
    format: "CODE128",
    width: dimensions.width <= 30 ? 1.15 : 1.45,
    height: dimensions.height <= 20 ? 24 : dimensions.height <= 25 ? 34 : 43,
    displayValue: false,
    margin: 0,
    background: "#ffffff",
    lineColor: "#000000",
  });
  return canvas.toDataURL("image/png");
}

export function buildBarcodeLabelsHtml(items: BarcodeLabelItem[], preferences = getBarcodeLabelPreferences()) {
  const size = BARCODE_LABEL_SIZES[preferences.size];
  const labels = items.flatMap(item => {
    if (!item.barcode.trim()) return [];
    let image = "";
    try { image = barcodeDataUrl(item.barcode.trim(), preferences.size); } catch { return []; }
    return Array.from({ length: clampCopies(preferences.copies) }, (_, copyIndex) => `
      <section class="label ${copyIndex === preferences.copies - 1 ? "" : "page-break"}">
        ${preferences.showStoreName ? `<div class="store">${esc(siteConfig.name)}</div>` : ""}
        ${preferences.showProductName ? `<div class="name">${esc(item.name)}</div>` : ""}
        <div class="barcode"><img src="${image}" alt="${esc(item.barcode)}" /></div>
        ${preferences.showBarcodeText ? `<div class="value">${esc(item.barcode)}</div>` : ""}
        ${preferences.showPrice ? `<div class="price">${Number(item.price || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${esc(siteConfig.currency)}${item.unit ? `<small> / ${esc(item.unit)}</small>` : ""}</div>` : ""}
      </section>`);
  }).join("");

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8" /><title>طباعة باركود المنتجات</title><style>
    @page { size: ${size.width}mm ${size.height}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; font-family: Cairo, Tahoma, Arial, sans-serif; }
    .label { width: ${size.width}mm; height: ${size.height}mm; padding: ${size.width <= 30 ? "1mm" : "1.5mm"}; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-after: always; break-after: page; }
    .label:last-child { page-break-after: auto; break-after: auto; }
    .store { font-size: ${size.width <= 30 ? "6px" : "7px"}; font-weight: 800; color: #005931; line-height: 1; margin-bottom: .4mm; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .name { width: 100%; font-size: ${size.width <= 30 ? "6px" : size.width <= 40 ? "8px" : "10px"}; font-weight: 900; line-height: 1.15; margin-bottom: .5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .barcode { width: 100%; min-height: 0; flex: 1; display: flex; align-items: center; justify-content: center; }
    .barcode img { width: 96%; max-height: 100%; object-fit: contain; display: block; }
    .value { font-size: ${size.width <= 30 ? "6px" : "8px"}; letter-spacing: .3px; line-height: 1; margin-top: .3mm; direction: ltr; }
    .price { font-size: ${size.width <= 30 ? "7px" : size.width <= 40 ? "9px" : "11px"}; font-weight: 900; line-height: 1; margin-top: .5mm; }
    .price small { font-size: .72em; font-weight: 700; }
    @media print { body { background: #fff; } }
  </style></head><body>${labels}</body></html>`;
}

export function printBarcodeLabels(items: BarcodeLabelItem[], preferences = getBarcodeLabelPreferences()) {
  const validItems = items.filter(item => item.barcode?.trim());
  if (!validItems.length) return false;
  const normalized = saveBarcodeLabelPreferences(preferences);
  const popup = window.open("", "_blank", "width=640,height=720");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(buildBarcodeLabelsHtml(validItems, normalized));
  popup.document.close();
  popup.focus();
  const trigger = () => { try { popup.print(); } catch { /* browser controlled */ } };
  if (popup.document.readyState === "complete") window.setTimeout(trigger, 250);
  else popup.addEventListener("load", () => window.setTimeout(trigger, 250), { once: true });
  return true;
}
