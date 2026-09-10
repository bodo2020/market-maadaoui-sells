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

function invoiceBarcodeDataUrl(invoiceNumber: string, paperSize: InvoicePaperSize) {
  if (!invoiceNumber) return "";
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, invoiceNumber, {
      format: "CODE128",
      width: paperSize === "58mm" ? 1.15 : 1.35,
      height: paperSize === "58mm" ? 30 : 36,
      displayValue: true,
      fontSize: paperSize === "58mm" ? 9 : 10,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
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
  if (Number(item.weight || 0) > 0) {
    return `${Number(item.weight).toLocaleString("ar-EG", { maximumFractionDigits: 3 })} كجم`;
  }
  return Number(item.quantity || 0).toLocaleString("ar-EG", { maximumFractionDigits: 3 });
}

function resolveLogo(overrides?: InvoiceBrandOverrides) {
  const choice = overrides?.logoChoice || siteConfig.invoice.logoChoice || "store";
  if (choice === "none") return null;
  if (choice === "custom") return overrides?.customLogoUrl || siteConfig.invoice.customLogoUrl || null;
  return siteConfig.logoUrl || siteConfig.logo || null;
}

function build58mmItems(sale: Sale, currency: string, compact: boolean) {
  return `
    <div class="items-58 ${compact ? "compact" : ""}">
      <div class="items-heading">الأصناف</div>
      ${sale.items.map((item) => {
        const discount = Number(item.discount || 0);
        return `
          <div class="item-58">
            <div class="item-58-name">${esc(item.product.name)}</div>
            <div class="item-58-calc">
              <span>${esc(quantityLabel(item))} × ${esc(money(item.price, currency))}</span>
              <strong>${esc(money(item.total, currency))}</strong>
            </div>
            ${item.product.barcode || discount > 0 ? `
              <div class="item-58-extra">
                ${item.product.barcode ? `<span>باركود: ${esc(item.product.barcode)}</span>` : ""}
                ${discount > 0 ? `<strong>خصم: ${esc(money(discount, currency))}</strong>` : ""}
              </div>` : ""}
          </div>`;
      }).join("")}
    </div>`;
}

function build80mmItems(sale: Sale, currency: string, compact: boolean) {
  return `
    <table class="items-80 ${compact ? "compact" : ""}">
      <thead>
        <tr>
          <th class="product">الصنف</th>
          <th class="qty">الكمية</th>
          <th class="unit">سعر الوحدة</th>
          <th class="total">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${sale.items.map((item) => {
          const discount = Number(item.discount || 0);
          return `
            <tr>
              <td class="product">
                <strong>${esc(item.product.name)}</strong>
                ${item.product.barcode ? `<small>${esc(item.product.barcode)}</small>` : ""}
                ${discount > 0 ? `<small class="discount">خصم ${esc(money(discount, currency))}</small>` : ""}
              </td>
              <td class="qty">${esc(quantityLabel(item))}</td>
              <td class="unit">${esc(money(item.price, currency))}</td>
              <td class="total"><strong>${esc(money(item.total, currency))}</strong></td>
            </tr>`;
        }).join("")}
      </tbody>
    </table>`;
}

function buildReceiptBody(sale: Sale, preferences: InvoicePrintPreferences, overrides?: InvoiceBrandOverrides) {
  const currency = siteConfig.currency || "ج.م";
  const extra = sale as Sale & Record<string, any>;
  const loyalty = Number(extra.loyalty_voucher_amount || 0);
  const customerFee = Number(extra.customer_payment_fee_amount || 0);
  const amountPaid = Math.max(
    0,
    Number(extra.amount_charged ?? extra.amount_due ?? (Number(sale.total || 0) - loyalty + customerFee)),
  );
  const invoiceDate = new Date(sale.date);
  const date = invoiceDate.toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });
  const time = invoiceDate.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  const logo = resolveLogo(overrides);
  const barcodeUrl = preferences.showInvoiceBarcode ? invoiceBarcodeDataUrl(sale.invoice_number, preferences.paperSize) : "";
  const returns = Array.isArray(extra.invoice_returns) ? extra.invoice_returns : [];
  const is58 = preferences.paperSize === "58mm";

  const itemsMarkup = is58
    ? build58mmItems(sale, currency, preferences.compactItems)
    : build80mmItems(sale, currency, preferences.compactItems);

  return `
    <header class="receipt-head">
      ${preferences.showLogo && logo ? `<img class="logo" src="${esc(logo)}" alt="${esc(siteConfig.name)}" />` : ""}
      <h1>${esc(siteConfig.name)}</h1>
      <div class="tagline">مش مجرد ماركت</div>
      <div class="store-lines">
        ${siteConfig.address ? `<div>${esc(siteConfig.address)}</div>` : ""}
        ${siteConfig.phone ? `<div>هاتف: ${esc(siteConfig.phone)}</div>` : ""}
        ${(overrides?.showVat ?? siteConfig.invoice.showVat) && siteConfig.vatNumber ? `<div>الرقم الضريبي: ${esc(siteConfig.vatNumber)}</div>` : ""}
        ${overrides?.website || siteConfig.invoice.website ? `<div>${esc(overrides?.website || siteConfig.invoice.website)}</div>` : ""}
      </div>
    </header>

    <section class="invoice-identity">
      <div class="identity-label">فاتورة مبيعات</div>
      <div class="invoice-number">#${esc(sale.invoice_number)}</div>
      <div class="paid-status">مدفوعة</div>
    </section>

    <section class="meta-block">
      <div><span>التاريخ</span><strong>${esc(date)}</strong></div>
      <div><span>الوقت</span><strong>${esc(time)}</strong></div>
      <div><span>الكاشير</span><strong>${esc(sale.cashier_name || "—")}</strong></div>
      <div><span>الدفع</span><strong>${esc(paymentLabel(sale))}</strong></div>
    </section>

    ${sale.customer_name || sale.customer_phone ? `
      <section class="customer-line">
        <span>العميل:</span>
        <strong>${esc(sale.customer_name || "عميل عام")}</strong>
        ${sale.customer_phone ? `<bdi>${esc(sale.customer_phone)}</bdi>` : ""}
      </section>` : ""}

    ${itemsMarkup}

    <section class="totals">
      <div><span>المجموع الفرعي</span><strong>${esc(money(sale.subtotal, currency))}</strong></div>
      ${Number(sale.discount || 0) > 0 ? `<div><span>خصومات المنتجات</span><strong>- ${esc(money(sale.discount, currency))}</strong></div>` : ""}
      ${loyalty > 0 ? `<div><span>كوبون / رصيد ولاء</span><strong>- ${esc(money(loyalty, currency))}</strong></div>` : ""}
      ${customerFee > 0 ? `<div><span>رسوم وسيلة الدفع</span><strong>+ ${esc(money(customerFee, currency))}</strong></div>` : ""}
      <div class="grand-total"><span>المدفوع فعليًا</span><strong>${esc(money(amountPaid, currency))}</strong></div>
    </section>

    <section class="payment-block">
      <div><span>طريقة الدفع</span><strong>${esc(paymentLabel(sale))}</strong></div>
      ${extra.payment_reference ? `<div><span>مرجع العملية</span><strong class="reference">${esc(extra.payment_reference)}</strong></div>` : ""}
      ${Number(extra.cash_amount || 0) > 0 && sale.payment_method === "mixed" ? `<div><span>نقدي</span><strong>${esc(money(extra.cash_amount, currency))}</strong></div>` : ""}
      ${Number(extra.card_amount || 0) > 0 && sale.payment_method === "mixed" ? `<div><span>بطاقة / إلكتروني</span><strong>${esc(money(extra.card_amount, currency))}</strong></div>` : ""}
    </section>

    ${returns.length > 0 ? `
      <section class="return-note">
        تنبيه: تحتوي الفاتورة على ${returns.length.toLocaleString("ar-EG")} عملية مرتجع مسجلة.
      </section>` : ""}

    ${overrides?.notes || siteConfig.invoice.notes ? `<section class="note"><strong>ملاحظات:</strong><p>${esc(overrides?.notes || siteConfig.invoice.notes)}</p></section>` : ""}
    ${overrides?.paymentInstructions || siteConfig.invoice.paymentInstructions ? `<section class="note"><strong>تعليمات:</strong><p>${esc(overrides?.paymentInstructions || siteConfig.invoice.paymentInstructions)}</p></section>` : ""}

    ${barcodeUrl ? `<div class="invoice-barcode"><img src="${barcodeUrl}" alt="Invoice barcode" /></div>` : ""}

    <footer class="footer">
      <strong>${esc(overrides?.footer || siteConfig.invoice.footer || "شكرًا لزيارتكم")}</strong>
      <span>احتفظ بالفاتورة للرجوع إليها عند الحاجة</span>
    </footer>`;
}

export function buildSaleInvoiceHtml(
  sale: Sale,
  preferences: InvoicePrintPreferences = getInvoicePrintPreferences(),
  overrides?: InvoiceBrandOverrides,
) {
  const paperSize = preferences.paperSize;
  const thermal = paperSize !== "a4";
  const width = paperSize === "58mm" ? "58mm" : paperSize === "80mm" ? "80mm" : "auto";
  const bodyClass = paperSize === "58mm" ? "paper-58" : paperSize === "80mm" ? "paper-80" : "paper-a4";
  const copies = Array.from({ length: clampCopies(preferences.copies) }, (_, index) => `
    <section class="receipt ${bodyClass} ${index < preferences.copies - 1 ? "copy-break" : ""}">
      ${buildReceiptBody(sale, preferences, overrides)}
    </section>
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
        html, body { margin: 0; padding: 0; }
        body {
          background: ${thermal ? "#ffffff" : "#f2f2f2"};
          color: #000;
          font-family: Cairo, Tahoma, Arial, sans-serif;
          direction: rtl;
          font-variant-numeric: tabular-nums;
          -webkit-font-smoothing: none;
          text-rendering: geometricPrecision;
        }
        .receipt {
          background: #fff;
          color: #000;
          max-width: 100%;
          margin: ${thermal ? "0 auto" : "8mm auto"};
          overflow: hidden;
        }
        .paper-58 { width: 58mm; padding: 2.2mm 2.4mm 3mm; font-size: 9px; line-height: 1.35; }
        .paper-80 { width: 80mm; padding: 2.8mm 3.2mm 3.5mm; font-size: 10px; line-height: 1.35; }
        .paper-a4 { width: 190mm; padding: 10mm 12mm; border: 1px solid #000; font-size: 12px; line-height: 1.45; }
        .copy-break { break-after: page; page-break-after: always; }

        .receipt-head { text-align: center; padding-bottom: 5px; border-bottom: 1.5px solid #000; }
        .logo {
          display: block;
          max-height: 34px;
          max-width: 55%;
          object-fit: contain;
          margin: 0 auto 3px;
          filter: grayscale(1) contrast(1.85);
          mix-blend-mode: multiply;
        }
        .paper-58 .logo { max-height: 27px; max-width: 50%; }
        .paper-a4 .logo { max-height: 58px; }
        h1 { margin: 0; color: #000; font-size: 18px; line-height: 1.15; font-weight: 900; letter-spacing: -.2px; }
        .paper-58 h1 { font-size: 15px; }
        .paper-a4 h1 { font-size: 24px; }
        .tagline { margin-top: 2px; font-size: 8px; font-weight: 800; }
        .paper-80 .tagline { font-size: 9px; }
        .paper-a4 .tagline { font-size: 11px; }
        .store-lines { margin-top: 4px; font-size: 7.5px; line-height: 1.45; }
        .paper-80 .store-lines { font-size: 8.5px; }
        .paper-a4 .store-lines { font-size: 10px; }

        .invoice-identity { position: relative; text-align: center; padding: 6px 0 5px; border-bottom: 1px dashed #000; }
        .identity-label { font-size: 8px; font-weight: 700; }
        .invoice-number { margin-top: 1px; font-size: 13px; line-height: 1.15; font-weight: 900; overflow-wrap: anywhere; }
        .paper-58 .invoice-number { font-size: 11.5px; }
        .paper-80 .invoice-number { font-size: 14px; }
        .paper-a4 .invoice-number { font-size: 18px; }
        .paid-status { display: inline-block; margin-top: 4px; padding: 1px 6px; border: 1px solid #000; font-size: 7.5px; font-weight: 900; line-height: 1.35; }

        .meta-block { padding: 5px 0; border-bottom: 1px dashed #000; display: grid; grid-template-columns: 1fr 1fr; column-gap: 8px; row-gap: 3px; }
        .paper-80 .meta-block, .paper-a4 .meta-block { grid-template-columns: repeat(4, minmax(0,1fr)); }
        .meta-block div { min-width: 0; }
        .meta-block span { display: block; font-size: 7px; font-weight: 500; }
        .meta-block strong { display: block; margin-top: 1px; font-size: 8.5px; font-weight: 900; overflow-wrap: anywhere; }
        .paper-80 .meta-block span { font-size: 8px; }
        .paper-80 .meta-block strong { font-size: 9px; }
        .paper-a4 .meta-block span { font-size: 9px; }
        .paper-a4 .meta-block strong { font-size: 11px; }

        .customer-line { padding: 4px 0; border-bottom: 1px dashed #000; display: flex; flex-wrap: wrap; align-items: baseline; gap: 3px 5px; font-size: 8px; }
        .customer-line strong { font-size: 9px; }
        .customer-line bdi { direction: ltr; font-weight: 700; }

        .items-heading { padding: 5px 0 3px; border-bottom: 1.5px solid #000; text-align: center; font-size: 8px; font-weight: 900; }
        .item-58 { padding: 5px 0; border-bottom: 1px dashed #000; break-inside: avoid; page-break-inside: avoid; }
        .items-58.compact .item-58 { padding: 3px 0; }
        .item-58-name { font-size: 9px; line-height: 1.35; font-weight: 900; overflow-wrap: anywhere; }
        .item-58-calc { margin-top: 2px; display: flex; align-items: baseline; justify-content: space-between; gap: 6px; direction: rtl; }
        .item-58-calc span { font-size: 7.7px; white-space: nowrap; }
        .item-58-calc strong { font-size: 9.2px; white-space: nowrap; }
        .item-58-extra { margin-top: 2px; display: flex; justify-content: space-between; gap: 5px; font-size: 6.8px; line-height: 1.3; overflow-wrap: anywhere; }
        .item-58-extra strong { font-weight: 900; }

        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .items-80 { margin-top: 4px; }
        .items-80 th { padding: 4px 2px; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; font-size: 7.8px; font-weight: 900; text-align: right; }
        .items-80 td { padding: 5px 2px; border-bottom: 1px dashed #000; vertical-align: top; font-size: 8.5px; break-inside: avoid; page-break-inside: avoid; }
        .items-80.compact td { padding-top: 3px; padding-bottom: 3px; }
        .items-80 .product { width: 43%; text-align: right; }
        .items-80 .qty { width: 16%; text-align: center; }
        .items-80 .unit { width: 19%; text-align: center; }
        .items-80 .total { width: 22%; text-align: left; }
        .items-80 .product strong { display: block; font-size: 8.8px; line-height: 1.3; overflow-wrap: anywhere; }
        .items-80 .product small { display: block; margin-top: 1px; font-size: 6.7px; line-height: 1.25; overflow-wrap: anywhere; }
        .items-80 .product .discount { font-weight: 800; }
        .paper-a4 .items-80 th { font-size: 10px; }
        .paper-a4 .items-80 td { font-size: 11px; }
        .paper-a4 .items-80 .product strong { font-size: 11px; }
        .paper-a4 .items-80 .product small { font-size: 8px; }

        .totals { margin-top: 5px; padding-top: 4px; border-top: 1.5px solid #000; display: grid; gap: 3px; }
        .totals > div { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 8.5px; }
        .paper-80 .totals > div { font-size: 9.5px; }
        .paper-a4 .totals > div { font-size: 12px; }
        .totals > div strong { white-space: nowrap; }
        .grand-total { margin-top: 3px; padding: 5px 0 4px; border-top: 3px double #000; border-bottom: 3px double #000; font-size: 11px !important; font-weight: 900; }
        .grand-total span { font-weight: 900; }
        .grand-total strong { font-size: 12px; }
        .paper-80 .grand-total { font-size: 13px !important; }
        .paper-80 .grand-total strong { font-size: 14px; }
        .paper-a4 .grand-total { font-size: 16px !important; }
        .paper-a4 .grand-total strong { font-size: 18px; }

        .payment-block { margin-top: 5px; padding: 4px 0; border-bottom: 1px dashed #000; display: grid; gap: 2px; }
        .payment-block > div { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 8px; }
        .paper-80 .payment-block > div { font-size: 9px; }
        .paper-a4 .payment-block > div { font-size: 11px; }
        .payment-block strong { text-align: left; overflow-wrap: anywhere; }
        .payment-block .reference { direction: ltr; unicode-bidi: plaintext; font-size: .92em; }

        .return-note { margin-top: 5px; padding: 4px; border-top: 3px double #000; border-bottom: 3px double #000; text-align: center; font-size: 7.5px; line-height: 1.4; font-weight: 900; }
        .paper-80 .return-note { font-size: 8.5px; }
        .paper-a4 .return-note { font-size: 10px; }
        .note { margin-top: 5px; padding-top: 4px; border-top: 1px dashed #000; font-size: 7.5px; line-height: 1.45; }
        .paper-80 .note { font-size: 8.5px; }
        .paper-a4 .note { font-size: 10px; }
        .note p { margin: 2px 0 0; white-space: pre-wrap; }

        .invoice-barcode { margin-top: 7px; text-align: center; break-inside: avoid; page-break-inside: avoid; }
        .invoice-barcode img { display: block; max-width: 92%; height: auto; margin: 0 auto; filter: grayscale(1) contrast(2); }
        .paper-58 .invoice-barcode img { max-width: 96%; }
        .footer { margin-top: 6px; padding-top: 5px; border-top: 1.5px solid #000; text-align: center; display: grid; gap: 2px; }
        .footer strong { color: #000; font-size: 9px; font-weight: 900; }
        .paper-80 .footer strong { font-size: 10px; }
        .paper-a4 .footer strong { font-size: 12px; }
        .footer span { color: #000; font-size: 6.8px; }
        .paper-80 .footer span { font-size: 7.5px; }
        .paper-a4 .footer span { font-size: 9px; }

        @media print {
          html, body { width: ${paperSize === "a4" ? "auto" : width}; min-width: 0; background: #fff !important; color: #000 !important; }
          body { margin: 0 !important; padding: 0 !important; }
          .receipt { margin: 0 auto !important; background: #fff !important; color: #000 !important; box-shadow: none !important; border-radius: 0 !important; }
          .paper-58, .paper-80 { border: 0 !important; }
          * { color: #000 !important; background-color: transparent !important; box-shadow: none !important; text-shadow: none !important; }
          .logo, .invoice-barcode img { filter: grayscale(1) contrast(2) !important; }
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
    try {
      popup.print();
    } catch {
      // Browser may block programmatic printing.
    }
  };
  if (popup.document.readyState === "complete") window.setTimeout(trigger, 250);
  else popup.addEventListener("load", () => window.setTimeout(trigger, 250), { once: true });
  return true;
}
