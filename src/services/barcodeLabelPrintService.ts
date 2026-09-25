import JsBarcode from "jsbarcode";
import { siteConfig } from "@/config/site";
import { isPosNative, posThermalPrinter } from "@/native/posNative";

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
  copies?: number;
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
  return Math.min(99, Math.max(1, Math.round(Number(value || 1))));
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


function drawCenteredText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  weight = 800,
) {
  context.save();
  context.direction = "rtl";
  context.textAlign = "center";
  context.textBaseline = "middle";
  let size = fontSize;
  do {
    context.font = `${weight} ${size}px Cairo, Tahoma, Arial, sans-serif`;
    if (context.measureText(text).width <= maxWidth || size <= 7) break;
    size -= 1;
  } while (size > 7);
  context.fillText(text, x, y, maxWidth);
  context.restore();
}

function nativeLabelDataUrl(item: BarcodeLabelItem, preferences: BarcodeLabelPreferences) {
  const size = BARCODE_LABEL_SIZES[preferences.size];
  const width = Math.round(size.width * 8);
  const height = Math.round(size.height * 8);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذر تجهيز الاستيكر للطباعة.");

  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#000";

  const compact = size.height <= 20;
  const tiny = size.width <= 30;
  const margin = tiny ? 6 : 8;
  const center = width / 2;
  let top = compact ? 5 : 7;
  let bottomReserve = 4;

  if (preferences.showStoreName) {
    drawCenteredText(context, siteConfig.name, center, top + (tiny ? 5 : 6), width - margin * 2, tiny ? 9 : 11, 800);
    top += tiny ? 11 : 14;
  }

  if (preferences.showProductName) {
    drawCenteredText(context, item.name, center, top + (tiny ? 6 : 8), width - margin * 2, tiny ? 10 : size.width <= 40 ? 13 : 15, 900);
    top += tiny ? 14 : 18;
  }

  if (preferences.showPrice) bottomReserve += tiny ? 17 : 22;
  if (preferences.showBarcodeText) bottomReserve += tiny ? 10 : 12;

  const barcodeCanvas = document.createElement("canvas");
  const availableHeight = Math.max(24, height - top - bottomReserve - 4);
  JsBarcode(barcodeCanvas, item.barcode.trim(), {
    format: "CODE128",
    width: tiny ? 1 : 1.3,
    height: Math.max(22, Math.min(availableHeight, compact ? 38 : 54)),
    displayValue: false,
    margin: 0,
    background: "#ffffff",
    lineColor: "#000000",
  });

  const maxBarcodeWidth = width - margin * 2;
  const ratio = Math.min(1, maxBarcodeWidth / Math.max(1, barcodeCanvas.width));
  const barcodeWidth = Math.max(1, Math.round(barcodeCanvas.width * ratio));
  const barcodeHeight = Math.max(1, Math.min(availableHeight, Math.round(barcodeCanvas.height * ratio)));
  const barcodeY = top + Math.max(0, Math.floor((availableHeight - barcodeHeight) / 2));
  context.drawImage(barcodeCanvas, Math.round((width - barcodeWidth) / 2), barcodeY, barcodeWidth, barcodeHeight);

  let cursor = top + availableHeight + 2;
  if (preferences.showBarcodeText) {
    context.save();
    context.direction = "ltr";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `700 ${tiny ? 8 : 10}px monospace`;
    context.fillText(item.barcode, center, cursor + (tiny ? 4 : 5), width - margin * 2);
    context.restore();
    cursor += tiny ? 10 : 12;
  }

  if (preferences.showPrice) {
    const price = `${Number(item.price || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}${item.unit ? ` / ${item.unit}` : ""}`;
    drawCenteredText(context, price, center, Math.min(height - 7, cursor + (tiny ? 6 : 8)), width - margin * 2, tiny ? 11 : size.width <= 40 ? 15 : 18, 900);
  }

  return canvas.toDataURL("image/png");
}

export type BarcodePrintResult = {
  printed: boolean;
  native: boolean;
  totalLabels: number;
  totalMs?: number;
};

export function buildBarcodeLabelsHtml(items: BarcodeLabelItem[], preferences = getBarcodeLabelPreferences()) {
  const size = BARCODE_LABEL_SIZES[preferences.size];
  const labels = items.flatMap(item => {
    if (!item.barcode.trim()) return [];
    let image = "";
    try { image = barcodeDataUrl(item.barcode.trim(), preferences.size); } catch { return []; }
    const copies = clampCopies(Number(item.copies || preferences.copies));
    return Array.from({ length: copies }, (_, copyIndex) => `
      <section class="label ${copyIndex === copies - 1 ? "" : "page-break"}">
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

export async function printBarcodeLabels(items: BarcodeLabelItem[], preferences = getBarcodeLabelPreferences()): Promise<BarcodePrintResult> {
  const validItems = items.filter(item => item.barcode?.trim());
  if (!validItems.length) return { printed: false, native: false, totalLabels: 0 };
  const normalized = saveBarcodeLabelPreferences(preferences);
  const totalLabels = validItems.reduce((sum, item) => sum + clampCopies(Number(item.copies || normalized.copies)), 0);

  if (isPosNative()) {
    const selected = await posThermalPrinter.getSelected();
    if (!selected.address && selected.transport !== "usb") {
      throw new Error("اختار XP-P323B من إعداد الطابعة في التطبيق أولًا.");
    }

    const size = BARCODE_LABEL_SIZES[normalized.size];
    const result = await posThermalPrinter.printLabels({
      operation: "printLabels",
      widthMm: size.width,
      heightMm: size.height,
      gapMm: 2,
      labels: validItems.map(item => ({
        dataUrl: nativeLabelDataUrl(item, normalized),
        copies: clampCopies(Number(item.copies || normalized.copies)),
      })),
    });
    return {
      printed: Boolean(result.printed),
      native: true,
      totalLabels: Number(result.totalCopies || totalLabels),
      totalMs: Number(result.totalMs || 0),
    };
  }

  const popup = window.open("", "_blank", "width=640,height=720");
  if (!popup) return { printed: false, native: false, totalLabels };
  popup.document.open();
  popup.document.write(buildBarcodeLabelsHtml(validItems, normalized));
  popup.document.close();
  popup.focus();
  const trigger = () => { try { popup.print(); } catch { /* browser controlled */ } };
  if (popup.document.readyState === "complete") window.setTimeout(trigger, 250);
  else popup.addEventListener("load", () => window.setTimeout(trigger, 250), { once: true });
  return { printed: true, native: false, totalLabels };
}
