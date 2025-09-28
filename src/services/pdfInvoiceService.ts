import jsPDF from 'jspdf';
import { Sale } from '@/types';

interface StoreInfo {
  name: string;
  address: string;
  phone: string;
  vatNumber: string;
  logo?: string | null;
  website: string;
  footer: string;
  fontSize: string;
  showVat: boolean;
  template: string;
  notes: string;
  paymentInstructions: string;
  logoChoice: string;
  customLogoUrl: string | null;
  currency: string;
}

export const pdfInvoiceService = {
  generatePDF: async (sale: Sale, storeInfo: StoreInfo): Promise<jsPDF> => {
    const doc = new jsPDF();
    
    // Set font encoding for Arabic support
    let yPosition = 20;
    
    // Store Header
    doc.setFontSize(12);
    doc.text(storeInfo.name, 105, yPosition, { align: 'center' });
    yPosition += 8;
    
    if (storeInfo.address) {
      doc.setFontSize(8);
      doc.text(storeInfo.address, 105, yPosition, { align: 'center' });
      yPosition += 6;
    }
    
    if (storeInfo.phone) {
      doc.text(`Phone: ${storeInfo.phone}`, 105, yPosition, { align: 'center' });
      yPosition += 6;
    }
    
    if (storeInfo.website) {
      doc.text(storeInfo.website, 105, yPosition, { align: 'center' });
      yPosition += 6;
    }
    
    if (storeInfo.showVat && storeInfo.vatNumber) {
      doc.text(`VAT: ${storeInfo.vatNumber}`, 105, yPosition, { align: 'center' });
      yPosition += 6;
    }
    
    yPosition += 8;
    
    // Invoice Details
    doc.setFontSize(10);
    doc.text(`Invoice #: ${sale.invoice_number}`, 20, yPosition);
    
    const saleDate = new Date(sale.date);
    const formattedDate = saleDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    doc.text(`Date: ${formattedDate}`, 20, yPosition + 8);
    yPosition += 20;
    
    // Customer Info
    if (sale.customer_name) {
      doc.text(`Customer: ${sale.customer_name}`, 20, yPosition);
      yPosition += 8;
      if (sale.customer_phone) {
        doc.text(`Phone: ${sale.customer_phone}`, 20, yPosition);
        yPosition += 8;
      }
      yPosition += 5;
    }
    
    // Items Table Header
    doc.setFontSize(8);
    doc.text('Item', 20, yPosition);
    doc.text('Qty', 100, yPosition);
    doc.text('Price', 130, yPosition);
    doc.text('Total', 160, yPosition);
    doc.line(20, yPosition + 2, 190, yPosition + 2);
    yPosition += 8;
    
    // Items
    sale.items.forEach((item) => {
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.text(item.product.name, 20, yPosition);
      doc.text(item.weight ? `${item.weight} kg` : item.quantity.toString(), 100, yPosition);
      doc.text(item.price.toFixed(2), 130, yPosition);
      doc.text(`${item.total.toFixed(2)} ${storeInfo.currency}`, 160, yPosition);
      yPosition += 6;
    });
    
    yPosition += 5;
    doc.line(20, yPosition, 190, yPosition);
    yPosition += 8;
    
    // Totals
    doc.setFontSize(10);
    doc.text(`Subtotal: ${sale.subtotal.toFixed(2)} ${storeInfo.currency}`, 130, yPosition);
    yPosition += 6;
    
    if (sale.discount > 0) {
      doc.text(`Discount: -${sale.discount.toFixed(2)} ${storeInfo.currency}`, 130, yPosition);
      yPosition += 6;
    }
    
    doc.setFontSize(12);
    doc.text(`Total: ${sale.total.toFixed(2)} ${storeInfo.currency}`, 130, yPosition);
    yPosition += 12;
    
    // Payment Info
    doc.setFontSize(8);
    const paymentMethod = sale.payment_method === 'cash' ? 'Cash' : 
                         sale.payment_method === 'card' ? 'Card' : 'Mixed';
    doc.text(`Payment Method: ${paymentMethod}`, 20, yPosition);
    yPosition += 8;
    
    if (sale.cash_amount) {
      doc.text(`Cash Amount: ${sale.cash_amount.toFixed(2)} ${storeInfo.currency}`, 20, yPosition);
      yPosition += 8;
    }
    
    if (sale.card_amount) {
      doc.text(`Card Amount: ${sale.card_amount.toFixed(2)} ${storeInfo.currency}`, 20, yPosition);
      yPosition += 8;
    }
    
    // Notes
    if (storeInfo.notes) {
      yPosition += 5;
      doc.text('Notes:', 20, yPosition);
      yPosition += 8;
      doc.text(storeInfo.notes, 20, yPosition);
      yPosition += 8;
    }
    
    // Payment Instructions
    if (storeInfo.paymentInstructions) {
      yPosition += 5;
      doc.text('Payment Instructions:', 20, yPosition);
      yPosition += 8;
      doc.text(storeInfo.paymentInstructions, 20, yPosition);
      yPosition += 8;
    }
    
    // Footer
    yPosition += 10;
    doc.text(storeInfo.footer, 105, yPosition, { align: 'center' });
    
    return doc;
  },

  downloadPDF: async (sale: Sale, storeInfo: StoreInfo): Promise<void> => {
    const doc = await pdfInvoiceService.generatePDF(sale, storeInfo);
    doc.save(`invoice-${sale.invoice_number}.pdf`);
  },

  printPDF: async (sale: Sale, storeInfo: StoreInfo): Promise<void> => {
    const doc = await pdfInvoiceService.generatePDF(sale, storeInfo);
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  },

  sharePDF: async (sale: Sale, storeInfo: StoreInfo): Promise<void> => {
    try {
      const doc = await pdfInvoiceService.generatePDF(sale, storeInfo);
      const pdfBlob = doc.output('blob');
      const file = new File([pdfBlob], `invoice-${sale.invoice_number}.pdf`, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Invoice ${sale.invoice_number}`,
          files: [file]
        });
      } else {
        // Fallback: download the file
        await pdfInvoiceService.downloadPDF(sale, storeInfo);
      }
    } catch (error) {
      console.error('Error sharing PDF:', error);
      // Fallback: download the file
      await pdfInvoiceService.downloadPDF(sale, storeInfo);
    }
  }
};