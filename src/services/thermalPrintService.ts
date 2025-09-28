import { Sale, Product } from "@/types";
import { siteConfig } from "@/config/site";

export interface ThermalPrintSettings {
  width?: '58mm' | '80mm';
  fontSize?: 'small' | 'normal' | 'large';
  showLogo?: boolean;
  paperSaving?: boolean;
}

export class ThermalPrintService {
  private static instance: ThermalPrintService;
  
  public static getInstance(): ThermalPrintService {
    if (!ThermalPrintService.instance) {
      ThermalPrintService.instance = new ThermalPrintService();
    }
    return ThermalPrintService.instance;
  }

  /**
   * Generate thermal invoice HTML for 58mm paper
   */
  public generateThermalInvoiceHTML(
    sale: Sale, 
    storeInfo: any, 
    settings: ThermalPrintSettings = {}
  ): string {
    const { width = '80mm', fontSize = 'small', showLogo = true, paperSaving = true } = settings;
    
    const saleDate = new Date(sale.date);
    const formattedDate = saleDate.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Font sizes for thermal printing
    const fontSizes = {
      small: { base: '8pt', header: '12pt', title: '9pt', total: '10pt' },
      normal: { base: '9pt', header: '14pt', title: '10pt', total: '11pt' },
      large: { base: '10pt', header: '16pt', title: '11pt', total: '12pt' }
    };
    
    const fonts = fontSizes[fontSize];
    const paperWidth = width === '58mm' ? '58mm' : '80mm';
    const contentWidth = width === '58mm' ? '54mm' : '76mm';

    return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>إيصال حراري - ${sale.invoice_number}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Arial', 'Tahoma', sans-serif;
      width: ${paperWidth};
      max-width: ${paperWidth};
      margin: 0;
      padding: 2mm;
      font-size: ${fonts.base};
      line-height: 1.2;
      color: #000;
      background: #fff;
      direction: rtl;
      text-align: right;
    }
    
    .receipt-container {
      width: 100%;
      max-width: ${contentWidth};
    }
    
    .header {
      text-align: center;
      margin-bottom: ${paperSaving ? '2mm' : '4mm'};
    }
    
    .logo {
      max-width: 30mm;
      max-height: 15mm;
      margin-bottom: 2mm;
    }
    
    .store-name {
      font-size: ${fonts.header};
      font-weight: bold;
      margin-bottom: 1mm;
    }
    
    .store-info {
      font-size: ${fonts.base};
      line-height: 1.1;
      margin-bottom: 1mm;
    }
    
    .divider {
      border-top: 1px dashed #000;
      margin: 2mm 0;
    }
    
    .receipt-details {
      font-size: ${fonts.base};
      margin-bottom: 2mm;
    }
    
    .receipt-details div {
      margin-bottom: 0.5mm;
    }
    
    .items-section {
      margin: 2mm 0;
    }
    
    .item {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1mm;
      padding-bottom: 1mm;
      border-bottom: 1px dotted #ccc;
    }
    
    .item:last-child {
      border-bottom: none;
    }
    
    .item-details {
      flex: 1;
      padding-left: 2mm;
    }
    
    .item-name {
      font-weight: bold;
      margin-bottom: 0.5mm;
    }
    
    .item-info {
      font-size: calc(${fonts.base} - 1pt);
      color: #666;
    }
    
    .item-total {
      font-weight: bold;
      white-space: nowrap;
    }
    
    .totals {
      margin-top: 3mm;
      padding-top: 2mm;
      border-top: 1px solid #000;
    }
    
    .total-line {
      display: flex;
      justify-content: space-between;
      margin-bottom: 1mm;
    }
    
    .grand-total {
      font-size: ${fonts.total};
      font-weight: bold;
      border-top: 1px solid #000;
      padding-top: 2mm;
      margin-top: 2mm;
    }
    
    .payment-info {
      margin-top: 2mm;
      font-size: calc(${fonts.base} - 0.5pt);
      text-align: center;
    }
    
    .footer {
      text-align: center;
      margin-top: ${paperSaving ? '3mm' : '5mm'};
      font-size: calc(${fonts.base} - 0.5pt);
      border-top: 1px dashed #000;
      padding-top: 2mm;
    }
    
    @media print {
      body {
        width: ${paperWidth};
        margin: 0;
        padding: 1mm;
      }
      
      .no-print {
        display: none !important;
      }
      
      @page {
        size: ${paperWidth} auto;
        margin: 0;
      }
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="header">
      ${showLogo && storeInfo.logo ? `<img src="${storeInfo.logo}" class="logo" alt="شعار المتجر">` : ''}
      <div class="store-name">${storeInfo.name}</div>
      <div class="store-info">
        ${storeInfo.phone ? `هاتف: ${storeInfo.phone}` : ''}
        ${storeInfo.address ? `<br>${storeInfo.address}` : ''}
        ${storeInfo.website ? `<br>${storeInfo.website}` : ''}
      </div>
    </div>
    
    <div class="divider"></div>
    
    <div class="receipt-details">
      <div><strong>رقم الإيصال:</strong> ${sale.invoice_number}</div>
      <div><strong>التاريخ:</strong> ${formattedDate}</div>
      ${sale.cashier_name ? `<div><strong>البائع:</strong> ${sale.cashier_name}</div>` : ''}
      ${sale.customer_name ? `<div><strong>العميل:</strong> ${sale.customer_name}</div>` : ''}
    </div>
    
    <div class="divider"></div>
    
    <div class="items-section">
      ${sale.items.map(item => `
        <div class="item">
          <div class="item-details">
            <div class="item-name">${item.product.name}</div>
            <div class="item-info">
              ${item.weight ? `${item.weight} كجم` : `الكمية: ${item.quantity}`} × ${item.price.toFixed(2)}
            </div>
          </div>
          <div class="item-total">${item.total.toFixed(2)}</div>
        </div>
      `).join('')}
    </div>
    
    <div class="totals">
      <div class="total-line">
        <span>المجموع الفرعي:</span>
        <span>${sale.subtotal.toFixed(2)}</span>
      </div>
      ${sale.discount > 0 ? `
      <div class="total-line">
        <span>الخصم:</span>
        <span>- ${sale.discount.toFixed(2)}</span>
      </div>
      ` : ''}
      <div class="total-line grand-total">
        <span>الإجمالي:</span>
        <span>${sale.total.toFixed(2)} ${storeInfo.currency || 'ج.م'}</span>
      </div>
    </div>
    
    <div class="payment-info">
      طريقة الدفع: ${this.getPaymentMethodText(sale.payment_method)}
      ${sale.cash_amount ? `<br>نقدي: ${sale.cash_amount.toFixed(2)}` : ''}
      ${sale.card_amount ? `<br>بطاقة: ${sale.card_amount.toFixed(2)}` : ''}
    </div>
    
    ${storeInfo.notes ? `
    <div class="divider"></div>
    <div style="text-align: center; font-size: calc(${fonts.base} - 0.5pt);">
      ${storeInfo.notes}
    </div>
    ` : ''}
    
    <div class="footer">
      ${storeInfo.footer || "شكراً لزيارتكم!"}
    </div>
  </div>
  
  <div class="no-print" style="text-align: center; margin-top: 10mm; direction: ltr;">
    <button onclick="window.print()" style="padding: 5mm; margin: 2mm;">طباعة</button>
    <button onclick="window.close()" style="padding: 5mm; margin: 2mm;">إغلاق</button>
  </div>
</body>
</html>`;
  }

  /**
   * Generate thermal barcode HTML for 58mm paper
   */
  public generateThermalBarcodeHTML(
    barcode: string,
    productName: string,
    price?: number,
    storeName?: string,
    settings: ThermalPrintSettings = {}
  ): string {
    const { width = '80mm' } = settings;
    const paperWidth = width === '58mm' ? '58mm' : '80mm';

    return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>باركود حراري - ${productName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Arial', 'Tahoma', sans-serif;
      width: ${paperWidth};
      max-width: ${paperWidth};
      margin: 0;
      padding: 2mm;
      background: #fff;
      direction: rtl;
      text-align: center;
    }
    
    .barcode-container {
      width: 100%;
      padding: 1mm;
    }
    
    .barcode-canvas {
      margin: 2mm 0;
      max-width: 100%;
    }
    
    .product-name {
      font-size: 10pt;
      font-weight: bold;
      margin: 2mm 0;
      word-wrap: break-word;
    }
    
    .store-name {
      font-size: 8pt;
      margin: 1mm 0;
    }
    
    .price {
      font-size: 12pt;
      font-weight: bold;
      margin: 2mm 0;
    }
    
    .barcode-number {
      font-size: 8pt;
      margin: 1mm 0;
    }
    
    @media print {
      body {
        width: ${paperWidth};
        margin: 0;
        padding: 1mm;
      }
      
      .no-print {
        display: none !important;
      }
      
      @page {
        size: ${paperWidth} auto;
        margin: 0;
      }
    }
  </style>
</head>
<body>
  <div class="barcode-container">
    <div class="store-name">${storeName || siteConfig.name}</div>
    <canvas id="barcodeCanvas" class="barcode-canvas"></canvas>
    <div class="product-name">${productName}</div>
    <div class="barcode-number">${barcode}</div>
    ${price ? `<div class="price">${price.toFixed(2)} ج.م</div>` : ''}
  </div>
  
  <div class="no-print" style="text-align: center; margin-top: 5mm;">
    <button onclick="window.print()" style="padding: 3mm; margin: 1mm;">طباعة</button>
    <button onclick="window.close()" style="padding: 3mm; margin: 1mm;">إغلاق</button>
  </div>
</body>
</html>`;
  }

  /**
   * Print thermal invoice
   */
  public printThermalInvoice(
    sale: Sale, 
    storeInfo: any, 
    settings: ThermalPrintSettings = {}
  ): void {
    const html = this.generateThermalInvoiceHTML(sale, storeInfo, settings);
    this.openPrintWindow(html, `إيصال-${sale.invoice_number}`);
  }

  /**
   * Print thermal barcode
   */
  public printThermalBarcode(
    barcode: string,
    productName: string,
    price?: number,
    storeName?: string,
    settings: ThermalPrintSettings = {}
  ): Promise<void> {
    return new Promise((resolve) => {
      const html = this.generateThermalBarcodeHTML(barcode, productName, price, storeName, settings);
      const printWindow = this.openPrintWindow(html, `باركود-${productName}`);
      
      if (printWindow) {
        printWindow.onload = () => {
          // Wait for the page to load then generate barcode
          setTimeout(() => {
            const canvas = printWindow.document.getElementById('barcodeCanvas') as HTMLCanvasElement;
            if (canvas && (window as any).JsBarcode) {
              try {
                (window as any).JsBarcode(canvas, barcode, {
                  format: 'CODE128',
                  width: 1.5,
                  height: 40,
                  displayValue: false,
                  margin: 0,
                  background: 'white',
                  lineColor: 'black'
                });
              } catch (error) {
                console.error('Error generating barcode:', error);
              }
            }
            resolve();
          }, 100);
        };
      } else {
        resolve();
      }
    });
  }

  /**
   * Create PDF blob for thermal receipt
   */
  public async generateThermalPDF(
    sale: Sale, 
    storeInfo: any, 
    settings: ThermalPrintSettings = {}
  ): Promise<Blob> {
    // This would require jsPDF integration
    // For now, we'll create a simple text-based PDF alternative
    const html = this.generateThermalInvoiceHTML(sale, storeInfo, settings);
    const blob = new Blob([html], { type: 'text/html' });
    return blob;
  }

  private openPrintWindow(html: string, title: string): Window | null {
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.document.title = title;
      
      // Auto print after a short delay
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }
    
    return printWindow;
  }

  private getPaymentMethodText(method: string): string {
    switch (method) {
      case 'cash': return 'نقدي';
      case 'card': return 'بطاقة';
      case 'mixed': return 'مختلط';
      default: return 'نقدي';
    }
  }
}

export const thermalPrintService = ThermalPrintService.getInstance();