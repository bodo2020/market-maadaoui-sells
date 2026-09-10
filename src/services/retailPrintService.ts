import JsBarcode from "jsbarcode";
import { siteConfig } from "@/config/site";
import type { Sale } from "@/types";

export type InvoicePaperSize = "58mm" | "80mm" | "a4";

export type InvoicePrintPreferences = {
  paperSize: InvoicePaperSize;
  copies: number;
  showLogo: boolean;
  showInvoiceBarcode: boolean;
  compactItems: boolean;
};

export type InvoiceBrandOverrides = {
  footer?: string;
  website?: string;
  showVat?: boolean;
  notes?: string;
  paymentInstructions?: string;
  logoChoice?: string;
  customLogoUrl?: string | null;
};

const STORAGE_KEY = "elmadawy.invoice.print.v2";

const DEFAULT_PREFERENCES: InvoicePrintPreferences = {
  paperSize: "80mm",
  copies: 1,
  showLogo: true,
  showInvoiceBarcode: true,
  compactItems: false,
};

function clampCopies(value: number) {
  return Math.min(3, Math.max(1, Math.round(Number(value || 1))));
}

export function getInvoicePrintPreferences(): InvoicePrintPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<InvoicePrintPreferences>;
    const paperSize: InvoicePaperSize = parsed.paperSize === "58mm" || parsed.paperSize === "a4" ? parsed.paperSize : "80mm";
    return {
      paperSize,
      copies: clampCopies(Number(parsed.copies || 1)),
      showLogo: parsed.showLogo ?? true,
      showInvoiceBarcode: parsed.showInvoiceBarcode ?? true,
      compactItems: parsed.compactItems ?? false,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function saveInvoicePrintPreferences(preferences: InvoicePrintPreferences) {
  const normalized = { ...preferences, copies: clampCopies(preferences.copies) };
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

function money(value: unknown, currency: string) {
  return `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function invoiceBarcodeDataUrl(invoiceNumber: string) {
  if (!invoiceNumber) return "";
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, invoiceNumber, {
      format: "CODE128",
      width: 1.3,
      height: 34,
      displayValue: true,
      fontSize: 10,
      margin: 0,
      background: "#ffffff",
      lineColor: "#111827",
    });
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

function paymentLabel(sale: Sale) {
  const value = sale as Sale & Record<string, unknown>;
  return String(
    value.payment_method_name ||
      (sale.payment_method === "cash" ? "نقدي" : sale.payment_method === "card" ? "بطاقة بنكية" : "دفع مختلط"),
  );
}

function quantityLabel(item: Sale["items"][number]) {
  if (Number(item.weight || 0) > 0) return `${Number(item.weight).toLocaleString("ar-EG", { maximumFractionDigits: 3 })} كجم`;
  return Number(item.quantity || 0).toLocaleString("ar-EG", { maximumFractionDigits: 3 });
}

function resolveLogo(overrides?: InvoiceBrandOverrides) {
  const choice = overrides?.logoChoice || siteConfig.invoice.logoChoice || "store";
  if (choice === "none") return null;
  if (choice === "custom") return overrides?.customLogoUrl || siteConfig.invoice.customLogoUrl || null;
  return siteConfig.logoUrl || siteConfig.logo || null;
}

function buildReceiptBody(sale: Sale, preferences: InvoicePrintPreferences, overrides?: InvoiceBrandOverrides) {
  const currency = siteConfig.currency || "ج.م";
  const extra = sale as Sale & Record<string, any>;
  const loyalty = Number(extra.loyalty_voucher_amount || 0);
  const customerFee = Number(extra.customer_payment_fee_amount || 0);
  const amountPaid = Math.max(0, Number(extra.amount_charged ?? extra.amount_due ?? (Number(sale.total || 0) - loyalty + customerFee)));
  const invoiceDate = new Date(sale.date);
  const date = invoiceDate.toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });
  const time = invoiceDate.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  const logo = resolveLogo(overrides);
  const barcodeUrl = preferences.showInvoiceBarcode ? invoiceBarcodeDataUrl(sale.invoice_number) : "";
  const returns = Array.isArray(extra.invoice_returns) ? extra.invoice_returns : [];

  const itemRows = sale.items
    .map((item, index) => {
      const discount = Number(item.discount || 0);
      return `
        <tr>
          <td class="index">${index + 1}</td>
          <td class="item-name">
            <strong>${esc(item.product.name)}</strong>
            ${item.product.barcode ? `<small>${esc(item.product.barcode)}</small>` : ""}
            ${discount > 0 ? `<small class="discount">خصم ${money(discount, currency)}</small>` : ""}
          </td>
          <td class="qty">${esc(quantityLabel(item))}</td>
          <td class="price">${esc(money(item.price, currency))}</td>
          <td class="line-total">${esc(money(item.total, currency))}</td>
        </tr>`;
    })
    .join("");

  return `
    <div class="receipt-head">
      ${preferences.showLogo && logo ? `<img class="logo" src="${esc(logo)}" alt="${esc(siteConfig.name)}" />` : ""}
      <h1>${esc(siteConfig.name)}</h1>
      <div class="tagline">مش مجرد ماركت</div>
      ${siteConfig.address ? `<p>${esc(siteConfig.address)}</p>` : ""}
      ${siteConfig.phone ? `<p>هاتف: ${esc(siteConfig.phone)}</p>` : ""}
      ${(overrides?.showVat ?? siteConfig.invoice.showVat) && siteConfig.vatNumber ? `<p>الرقم الضريبي: ${esc(siteConfig.vatNumber)}</p>` : ""}
      ${overrides?.website || siteConfig.invoice.website ? `<p>${esc(overrides?.website || siteConfig.invoice.website)}</p>` : ""}
    </div>

    <div class="document-title">
      <div><span>فاتورة مبيعات</span><strong>#${esc(sale.invoice_number)}</strong></div>
      <span class="status">مدفوعة</span>
    </div>

    <div class="meta-grid">
      <div><span>التاريخ</span><strong>${esc(date)}</strong></div>
      <div><span>الوقت</span><strong>${esc(time)}</strong></div>
      <div><span>الكاشير</span><strong>${esc(sale.cashier_name || "—")}</strong></div>
      <div><span>طريقة الدفع</span><strong>${esc(paymentLabel(sale))}</strong></div>
    </div>

    ${sale.customer_name || sale.customer_phone ? `
      <div class="customer-box">
        <span>العميل</span>
        <strong>${esc(sale.customer_name || "عميل عام")}</strong>
        ${sale.customer_phone ? `<small>${esc(sale.customer_phone)}</small>` : ""}
      </div>` : ""}

    <table class="items ${preferences.compactItems ? "compact" : ""}">
      <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="totals">
      <div><span>المجموع الفرعي</span><strong>${esc(money(sale.subtotal, currency))}</strong></div>
      ${Number(sale.discount || 0) > 0 ? `<div class="minus"><span>خصومات المنتجات</span><strong>- ${esc(money(sale.discount, currency))}</strong></div>` : ""}
      ${loyalty > 0 ? `<div class="minus"><span>كوبون/رصيد ولاء</span><strong>- ${esc(money(loyalty, currency))}</strong></div>` : ""}
      ${customerFee > 0 ? `<div class="fee"><span>رسوم وسيلة الدفع</span><strong>+ ${esc(money(customerFee, currency))}</strong></div>` : ""}
      <div class="grand"><span>المدفوع فعليًا</span><strong>${esc(money(amountPaid, currency))}</strong></div>
    </div>

    <div class="payment-box">
      <div><span>طريقة الدفع</span><strong>${esc(paymentLabel(sale))}</strong></div>
      ${extra.payment_reference ? `<div><span>مرجع العملية</span><strong>${esc(extra.payment_reference)}</strong></div>` : ""}
      ${Number(extra.cash_amount || 0) > 0 && sale.payment_method === "mixed" ? `<div><span>نقدي</span><strong>${esc(money(extra.cash_amount, currency))}</strong></div>` : ""}
      ${Number(extra.card_amount || 0) > 0 && sale.payment_method === "mixed" ? `<div><span>بطاقة</span><strong>${esc(money(extra.card_amount, currency))}</strong></div>` : ""}
    </div>

    ${returns.length > 0 ? `<div class="return-note">تحتوي الفاتورة على ${returns.length.toLocaleString("ar-EG")} عملية مرتجع مسجلة.</div>` : ""}
    ${overrides?.notes || siteConfig.invoice.notes ? `<div class="note"><strong>ملاحظات</strong><p>${esc(overrides?.notes || siteConfig.invoice.notes)}</p></div>` : ""}
    ${overrides?.paymentInstructions || siteConfig.invoice.paymentInstructions ? `<div class="note"><strong>تعليمات</strong><p>${esc(overrides?.paymentInstructions || siteConfig.invoice.paymentInstructions)}</p></div>` : ""}

    ${barcodeUrl ? `<div class="invoice-barcode"><img src="${barcodeUrl}" alt="Invoice barcode" /></div>` : ""}
    <div class="footer">
      <strong>${esc(overrides?.footer || siteConfig.invoice.footer || "شكرًا لزيارتكم")}</strong>
      <span>احتفظ بالفاتورة للرجوع إليها عند الحاجة</span>
    </div>`;
}

export function buildSaleInvoiceHtml(
  sale: Sale,
  preferences: InvoicePrintPreferences = getInvoicePrintPreferences(),
  overrides?: InvoiceBrandOverrides,
) {
  const paperSize = preferences.paperSize;
  const thermal = paperSize !== "a4";
  const width = paperSize === "58mm" ? "58mm" : paperSize === "80mm" ? "80mm" : "auto";
  const copies = Array.from({ length: clampCopies(preferences.copies) }, (_, index) => `
    <section class="receipt ${index < preferences.copies - 1 ? "copy-break" : ""}">${buildReceiptBody(sale, preferences, overrides)}</section>
  `).join("");

  return `<!doctype html>
  <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>فاتورة ${esc(sale.invoice_number)}</title>
      <style>
        @page { size: ${paperSize === "a4" ? "A4 portrait" : `${width} auto`}; margin: ${paperSize === "a4" ? "10mm" : "0"}; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #eef2f0; color: #111827; font-family: Cairo, Tahoma, Arial, sans-serif; direction: rtl; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .receipt { background: #fff; width: ${thermal ? width : "190mm"}; max-width: 100%; margin: ${thermal ? "0 auto" : "8mm auto"}; padding: ${paperSize === "58mm" ? "3mm" : thermal ? "4mm" : "12mm"}; border-radius: ${thermal ? "0" : "5mm"}; box-shadow: ${thermal ? "none" : "0 12px 40px rgba(15,23,42,.08)"}; }
        .copy-break { break-after: page; page-break-after: always; }
        .receipt-head { text-align: center; border-bottom: 2px solid #005931; padding-bottom: 10px; }
        .logo { max-height: ${paperSize === "58mm" ? "34px" : "48px"}; max-width: 70%; object-fit: contain; margin: 0 auto 5px; }
        h1 { font-size: ${paperSize === "58mm" ? "15px" : "20px"}; margin: 0; color: #005931; font-weight: 900; }
        .tagline { font-size: 9px; font-weight: 800; margin-top: 2px; }
        .receipt-head p { margin: 2px 0; color: #64748b; font-size: ${paperSize === "58mm" ? "8px" : "10px"}; }
        .document-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; border-bottom: 1px dashed #cbd5e1; }
        .document-title div { display: grid; gap: 2px; }
        .document-title span { font-size: 9px; color: #64748b; }
        .document-title strong { font-size: ${paperSize === "58mm" ? "11px" : "14px"}; }
        .document-title .status { color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 999px; padding: 3px 7px; font-weight: 800; }
        .meta-grid { display: grid; grid-template-columns: repeat(${paperSize === "58mm" ? 2 : 4}, 1fr); gap: 6px; margin: 9px 0; }
        .meta-grid div, .customer-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px; display: grid; gap: 2px; min-width: 0; }
        .meta-grid span, .customer-box span { font-size: 8px; color: #64748b; }
        .meta-grid strong, .customer-box strong { font-size: 9px; overflow-wrap: anywhere; }
        .customer-box { margin-bottom: 8px; }
        .customer-box small { color: #64748b; font-size: 8px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .items th { color: #475569; font-size: ${paperSize === "58mm" ? "7px" : "9px"}; border-bottom: 1px solid #94a3b8; padding: 6px 2px; text-align: right; }
        .items td { font-size: ${paperSize === "58mm" ? "8px" : "10px"}; padding: ${preferences.compactItems ? "4px 2px" : "7px 2px"}; border-bottom: 1px dashed #e2e8f0; vertical-align: top; }
        .items .index { width: 5%; color: #94a3b8; }
        .items .item-name { width: 39%; }
        .items .qty { width: 18%; text-align: center; }
        .items .price { width: 18%; text-align: center; }
        .items .line-total { width: 20%; text-align: left; font-weight: 800; }
        .item-name strong, .item-name small { display: block; }
        .item-name small { color: #94a3b8; font-size: 7px; margin-top: 2px; }
        .item-name .discount { color: #047857; }
        .totals { margin-top: 10px; border-top: 2px solid #0f172a; padding-top: 7px; display: grid; gap: 5px; }
        .totals > div, .payment-box > div { display: flex; justify-content: space-between; gap: 10px; font-size: ${paperSize === "58mm" ? "9px" : "11px"}; }
        .totals .minus { color: #047857; }
        .totals .fee { color: #b45309; }
        .totals .grand { color: #fff; background: #005931; border-radius: 9px; padding: 8px; margin-top: 3px; font-size: ${paperSize === "58mm" ? "11px" : "14px"}; }
        .payment-box { margin-top: 9px; padding: 8px; border: 1px solid #dbe4e0; background: #f6faf8; border-radius: 9px; display: grid; gap: 5px; }
        .payment-box span { color: #64748b; }
        .return-note { margin-top: 8px; border: 1px solid #fdba74; background: #fff7ed; color: #9a3412; border-radius: 8px; padding: 6px; font-size: 8px; font-weight: 700; text-align: center; }
        .note { margin-top: 9px; border-top: 1px dashed #cbd5e1; padding-top: 7px; font-size: 8px; }
        .note strong { color: #475569; }
        .note p { margin: 3px 0 0; white-space: pre-wrap; }
        .invoice-barcode { text-align: center; margin-top: 12px; }
        .invoice-barcode img { max-width: 90%; height: auto; }
        .footer { text-align: center; border-top: 1px dashed #94a3b8; margin-top: 10px; padding-top: 9px; display: grid; gap: 3px; }
        .footer strong { color: #005931; font-size: ${paperSize === "58mm" ? "9px" : "11px"}; }
        .footer span { color: #94a3b8; font-size: 7px; }
        @media print {
          body { background: #fff; }
          .receipt { margin: 0 auto; box-shadow: none; border-radius: 0; }
        }
      </style>
    </head>
    <body>${copies}</body>
  </html>`;
}

export function printSaleInvoice(
  sale: Sale,
  preferences: InvoicePrintPreferences = getInvoicePrintPreferences(),
  overrides?: InvoiceBrandOverrides,
) {
  const normalized = saveInvoicePrintPreferences(preferences);
  const popup = window.open("", "_blank", "width=920,height=820");
  if (!popup) return false;

  popup.document.open();
  popup.document.write(buildSaleInvoiceHtml(sale, normalized, overrides));
  popup.document.close();
  popup.focus();

  const trigger = () => {
    try { popup.print(); } catch { /* browser may block programmatic printing */ }
  };
  if (popup.document.readyState === "complete") window.setTimeout(trigger, 250);
  else popup.addEventListener("load", () => window.setTimeout(trigger, 250), { once: true });
  return true;
}
