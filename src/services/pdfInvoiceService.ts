import jsPDF from 'jspdf';
import { Sale } from '@/types';

interface StoreInfo {
  name: string;
  address: string;
  phone: string;
  vatNumber?: string;
  logo?: string | null;
  website?: string;
  footer?: string;
  fontSize?: string;
  showVat?: boolean;
  template?: string;
  notes?: string;
  paymentInstructions?: string;
  logoChoice?: string;
  customLogoUrl?: string | null;
  currency: string;
}

export class PDFInvoiceService {
  private doc: jsPDF;

  constructor() {
    this.doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
  }

  async generateInvoicePDF(sale: Sale, storeInfo: StoreInfo): Promise<string> {
    // Reset the document
    this.doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Set RTL text direction and Arabic font support
    this.doc.setLanguage('ar');
    
    let yPosition = 20;
    const pageWidth = this.doc.internal.pageSize.width;
    const margin = 20;

    // Store Header
    this.doc.setFontSize(20);
    this.doc.setFont('helvetica', 'bold');
    const storeName = this.reverseArabicText(storeInfo.name);
    this.doc.text(storeName, pageWidth - margin, yPosition, { align: 'right' });
    yPosition += 10;

    if (storeInfo.address) {
      this.doc.setFontSize(12);
      this.doc.setFont('helvetica', 'normal');
      const address = this.reverseArabicText(storeInfo.address);
      this.doc.text(address, pageWidth - margin, yPosition, { align: 'right' });
      yPosition += 8;
    }

    if (storeInfo.phone) {
      this.doc.setFontSize(12);
      const phone = `هاتف: ${storeInfo.phone}`;
      const phoneText = this.reverseArabicText(phone);
      this.doc.text(phoneText, pageWidth - margin, yPosition, { align: 'right' });
      yPosition += 8;
    }

    if (storeInfo.website) {
      this.doc.setFontSize(12);
      const website = this.reverseArabicText(storeInfo.website);
      this.doc.text(website, pageWidth - margin, yPosition, { align: 'right' });
      yPosition += 8;
    }

    if (storeInfo.showVat && storeInfo.vatNumber) {
      this.doc.setFontSize(12);
      const vatText = `الرقم الضريبي: ${storeInfo.vatNumber}`;
      const vat = this.reverseArabicText(vatText);
      this.doc.text(vat, pageWidth - margin, yPosition, { align: 'right' });
      yPosition += 8;
    }

    yPosition += 15;

    // Invoice Details
    this.doc.setFontSize(14);
    this.doc.setFont('helvetica', 'bold');
    
    // Invoice Number
    const invoiceText = `رقم الفاتورة: ${sale.invoice_number}`;
    const invoiceNumber = this.reverseArabicText(invoiceText);
    this.doc.text(invoiceNumber, pageWidth - margin, yPosition, { align: 'right' });
    yPosition += 10;

    // Date
    const saleDate = new Date(sale.date);
    const formattedDate = saleDate.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const dateText = `التاريخ: ${formattedDate}`;
    const dateFormatted = this.reverseArabicText(dateText);
    this.doc.text(dateFormatted, pageWidth - margin, yPosition, { align: 'right' });
    yPosition += 15;

    // Customer Info
    if (sale.customer_name) {
      this.doc.setFontSize(12);
      this.doc.setFont('helvetica', 'bold');
      const customerText = `العميل: ${sale.customer_name}`;
      const customer = this.reverseArabicText(customerText);
      this.doc.text(customer, pageWidth - margin, yPosition, { align: 'right' });
      yPosition += 8;

      if (sale.customer_phone) {
        this.doc.setFont('helvetica', 'normal');
        const phoneText = `هاتف: ${sale.customer_phone}`;
        const phone = this.reverseArabicText(phoneText);
        this.doc.text(phone, pageWidth - margin, yPosition, { align: 'right' });
        yPosition += 8;
      }
      yPosition += 10;
    }

    // Items Table Header
    this.doc.setFontSize(12);
    this.doc.setFont('helvetica', 'bold');
    
    const headerY = yPosition;
    this.doc.line(margin, headerY, pageWidth - margin, headerY); // Top line
    yPosition += 8;

    // Table headers (right to left)
    const col1 = pageWidth - margin - 5; // Product name
    const col2 = col1 - 60; // Quantity
    const col3 = col2 - 30; // Price
    const col4 = col3 - 30; // Total

    this.doc.text(this.reverseArabicText('الصنف'), col1, yPosition, { align: 'right' });
    this.doc.text(this.reverseArabicText('الكمية'), col2, yPosition, { align: 'center' });
    this.doc.text(this.reverseArabicText('السعر'), col3, yPosition, { align: 'center' });
    this.doc.text(this.reverseArabicText('المجموع'), col4, yPosition, { align: 'center' });

    yPosition += 5;
    this.doc.line(margin, yPosition, pageWidth - margin, yPosition); // Header bottom line
    yPosition += 8;

    // Items
    this.doc.setFont('helvetica', 'normal');
    sale.items.forEach((item) => {
      const productName = this.reverseArabicText(item.product.name);
      const quantity = item.weight ? `${item.weight} كجم` : item.quantity.toString();
      const price = item.price.toFixed(2);
      const total = `${item.total.toFixed(2)} ${storeInfo.currency}`;

      this.doc.text(productName, col1, yPosition, { align: 'right' });
      this.doc.text(this.reverseArabicText(quantity), col2, yPosition, { align: 'center' });
      this.doc.text(price, col3, yPosition, { align: 'center' });
      this.doc.text(this.reverseArabicText(total), col4, yPosition, { align: 'center' });

      yPosition += 8;
    });

    // Bottom line of table
    this.doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 15;

    // Totals
    this.doc.setFont('helvetica', 'bold');
    
    // Subtotal
    const subtotalText = `المجموع الفرعي: ${sale.subtotal.toFixed(2)} ${storeInfo.currency}`;
    this.doc.text(this.reverseArabicText(subtotalText), pageWidth - margin, yPosition, { align: 'right' });
    yPosition += 8;

    // Discount
    if (sale.discount > 0) {
      const discountText = `الخصم: -${sale.discount.toFixed(2)} ${storeInfo.currency}`;
      this.doc.text(this.reverseArabicText(discountText), pageWidth - margin, yPosition, { align: 'right' });
      yPosition += 8;
    }

    // Total
    this.doc.setFontSize(14);
    const totalText = `الإجمالي: ${sale.total.toFixed(2)} ${storeInfo.currency}`;
    this.doc.text(this.reverseArabicText(totalText), pageWidth - margin, yPosition, { align: 'right' });
    yPosition += 15;

    // Payment Info
    this.doc.setFontSize(12);
    this.doc.setFont('helvetica', 'normal');
    
    const paymentMethod = sale.payment_method === 'cash' ? 'نقدي' : 
                         sale.payment_method === 'card' ? 'بطاقة' : 'مختلط';
    const paymentText = `طريقة الدفع: ${paymentMethod}`;
    this.doc.text(this.reverseArabicText(paymentText), pageWidth - margin, yPosition, { align: 'right' });
    yPosition += 8;

    if (sale.cash_amount) {
      const cashText = `المبلغ النقدي: ${sale.cash_amount.toFixed(2)} ${storeInfo.currency}`;
      this.doc.text(this.reverseArabicText(cashText), pageWidth - margin, yPosition, { align: 'right' });
      yPosition += 8;
    }

    if (sale.card_amount) {
      const cardText = `مبلغ البطاقة: ${sale.card_amount.toFixed(2)} ${storeInfo.currency}`;
      this.doc.text(this.reverseArabicText(cardText), pageWidth - margin, yPosition, { align: 'right' });
      yPosition += 8;
    }

    // Notes
    if (storeInfo.notes) {
      yPosition += 10;
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(this.reverseArabicText('ملاحظات:'), pageWidth - margin, yPosition, { align: 'right' });
      yPosition += 8;
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(this.reverseArabicText(storeInfo.notes), pageWidth - margin, yPosition, { align: 'right' });
      yPosition += 8;
    }

    // Payment Instructions
    if (storeInfo.paymentInstructions) {
      yPosition += 5;
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(this.reverseArabicText('تعليمات الدفع:'), pageWidth - margin, yPosition, { align: 'right' });
      yPosition += 8;
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(this.reverseArabicText(storeInfo.paymentInstructions), pageWidth - margin, yPosition, { align: 'right' });
      yPosition += 8;
    }

    // Footer
    yPosition += 20;
    this.doc.setFontSize(12);
    this.doc.setFont('helvetica', 'normal');
    const footer = storeInfo.footer || "شكراً لزيارتكم!";
    this.doc.text(this.reverseArabicText(footer), pageWidth / 2, yPosition, { align: 'center' });

    // Return the PDF as base64 string
    return this.doc.output('datauristring');
  }

  private reverseArabicText(text: string): string {
    // Simple Arabic text reversal for better RTL display
    // This is a basic implementation - for complex text, consider using a proper RTL library
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F]/;
    if (arabicRegex.test(text)) {
      return text.split('').reverse().join('');
    }
    return text;
  }

  downloadPDF(sale: Sale, storeInfo: StoreInfo): void {
    this.generateInvoicePDF(sale, storeInfo).then((pdfData) => {
      // Create a download link
      const link = document.createElement('a');
      link.href = pdfData;
      link.download = `invoice-${sale.invoice_number}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  async printPDF(sale: Sale, storeInfo: StoreInfo): Promise<void> {
    const pdfData = await this.generateInvoicePDF(sale, storeInfo);
    
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Invoice ${sale.invoice_number}</title>
          </head>
          <body style="margin: 0; padding: 0;">
            <iframe src="${pdfData}" width="100%" height="100%" style="border: none;"></iframe>
          </body>
        </html>
      `);
      printWindow.document.close();
      
      // Wait for the PDF to load then print
      setTimeout(() => {
        printWindow.print();
      }, 1000);
    }
  }

  async sharePDF(sale: Sale, storeInfo: StoreInfo): Promise<void> {
    try {
      const pdfDataUri = await this.generateInvoicePDF(sale, storeInfo);
      
      // Convert data URI to blob
      const byteCharacters = atob(pdfDataUri.split(',')[1]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      
      const file = new File([blob], `invoice-${sale.invoice_number}.pdf`, { type: 'application/pdf' });
      
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `فاتورة رقم ${sale.invoice_number}`,
          text: `فاتورة من ${storeInfo.name}`,
          files: [file]
        });
      } else {
        // Fallback: download the file
        this.downloadPDF(sale, storeInfo);
      }
    } catch (error) {
      console.error('Error sharing PDF:', error);
      // Fallback: download the file
      this.downloadPDF(sale, storeInfo);
    }
  }
}

export const pdfInvoiceService = new PDFInvoiceService();