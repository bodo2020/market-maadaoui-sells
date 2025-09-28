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
  currency?: string;
}

export async function generateInvoicePDF(sale: Sale, storeInfo: StoreInfo): Promise<Blob> {
  // Create new PDF document - A4 size for mobile compatibility
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Add Arabic font support
  doc.setLanguage("ar");
  
  // Set up margins and positioning
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let currentY = 20;

  // Helper function to add text with proper alignment
  const addText = (text: string, x: number, y: number, options: any = {}) => {
    doc.setFontSize(options.fontSize || 10);
    if (options.bold) {
      doc.setFont(undefined, 'bold');
    } else {
      doc.setFont(undefined, 'normal');
    }
    doc.text(text, x, y, { align: options.align || 'right', ...options });
  };

  // Add logo if available
  if (storeInfo.logoChoice === 'store' && storeInfo.logo) {
    try {
      // You might need to implement logo loading here
      // For now, we'll skip it to avoid complexity
    } catch (error) {
      console.warn('Could not load logo:', error);
    }
  }

  // Store header
  addText(storeInfo.name, pageWidth - margin, currentY, { 
    fontSize: 16, 
    bold: true, 
    align: 'center' 
  });
  currentY += 8;

  addText(storeInfo.address, pageWidth - margin, currentY, { 
    fontSize: 10, 
    align: 'center' 
  });
  currentY += 6;

  addText(`هاتف: ${storeInfo.phone}`, pageWidth - margin, currentY, { 
    fontSize: 10, 
    align: 'center' 
  });
  currentY += 6;

  if (storeInfo.website) {
    addText(storeInfo.website, pageWidth - margin, currentY, { 
      fontSize: 10, 
      align: 'center' 
    });
    currentY += 6;
  }

  if (storeInfo.showVat && storeInfo.vatNumber) {
    addText(`الرقم الضريبي: ${storeInfo.vatNumber}`, pageWidth - margin, currentY, { 
      fontSize: 10, 
      align: 'center' 
    });
    currentY += 6;
  }

  // Add separator line
  currentY += 10;
  doc.setLineWidth(0.5);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 10;

  // Invoice details
  const saleDate = new Date(sale.date);
  const formattedDate = saleDate.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  addText(`رقم الفاتورة: ${sale.invoice_number}`, pageWidth - margin, currentY, { 
    fontSize: 12, 
    bold: true 
  });
  currentY += 8;

  addText(`التاريخ: ${formattedDate}`, pageWidth - margin, currentY, { 
    fontSize: 10 
  });
  currentY += 6;

  if (sale.customer_name) {
    addText(`العميل: ${sale.customer_name}`, pageWidth - margin, currentY, { 
      fontSize: 10 
    });
    currentY += 6;
  }

  if (sale.customer_phone) {
    addText(`هاتف: ${sale.customer_phone}`, pageWidth - margin, currentY, { 
      fontSize: 10 
    });
    currentY += 6;
  }

  // Add separator line
  currentY += 5;
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 10;

  // Items table header
  const tableHeaders = ['المجموع', 'السعر', 'الكمية', 'الصنف'];
  const colWidths = [30, 30, 25, 85];
  let startX = pageWidth - margin;

  addText('الصنف', startX - colWidths[0] - colWidths[1] - colWidths[2], currentY, { 
    fontSize: 10, 
    bold: true 
  });
  addText('الكمية', startX - colWidths[0] - colWidths[1], currentY, { 
    fontSize: 10, 
    bold: true, 
    align: 'center' 
  });
  addText('السعر', startX - colWidths[0], currentY, { 
    fontSize: 10, 
    bold: true, 
    align: 'center' 
  });
  addText('المجموع', startX, currentY, { 
    fontSize: 10, 
    bold: true, 
    align: 'left' 
  });
  
  currentY += 6;
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 8;

  // Items
  for (const item of sale.items) {
    const quantity = item.weight ? `${item.weight} كجم` : item.quantity.toString();
    
    addText(item.product.name, startX - colWidths[0] - colWidths[1] - colWidths[2], currentY, { 
      fontSize: 9 
    });
    addText(quantity, startX - colWidths[0] - colWidths[1], currentY, { 
      fontSize: 9, 
      align: 'center' 
    });
    addText(item.price.toFixed(2), startX - colWidths[0], currentY, { 
      fontSize: 9, 
      align: 'center' 
    });
    addText(`${item.total.toFixed(2)} ${storeInfo.currency || 'ج.م'}`, startX, currentY, { 
      fontSize: 9, 
      align: 'left' 
    });
    
    currentY += 6;
  }

  // Add separator line
  currentY += 5;
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 10;

  // Totals
  addText(`المجموع الفرعي: ${sale.subtotal.toFixed(2)} ${storeInfo.currency || 'ج.م'}`, pageWidth - margin, currentY);
  currentY += 6;

  if (sale.discount > 0) {
    addText(`الخصم: ${sale.discount.toFixed(2)} ${storeInfo.currency || 'ج.م'}`, pageWidth - margin, currentY);
    currentY += 6;
  }

  addText(`الإجمالي: ${sale.total.toFixed(2)} ${storeInfo.currency || 'ج.م'}`, pageWidth - margin, currentY, { 
    fontSize: 12, 
    bold: true 
  });
  currentY += 10;

  // Payment method
  const paymentText = sale.payment_method === 'cash' ? 'نقدي' : 
                     sale.payment_method === 'card' ? 'بطاقة' : 'مختلط';
  addText(`طريقة الدفع: ${paymentText}`, pageWidth - margin, currentY);
  currentY += 6;

  if (sale.cash_amount) {
    addText(`المبلغ النقدي: ${sale.cash_amount.toFixed(2)} ${storeInfo.currency || 'ج.م'}`, pageWidth - margin, currentY);
    currentY += 6;
  }

  if (sale.card_amount) {
    addText(`مبلغ البطاقة: ${sale.card_amount.toFixed(2)} ${storeInfo.currency || 'ج.م'}`, pageWidth - margin, currentY);
    currentY += 6;
  }

  // Notes
  if (storeInfo.notes) {
    currentY += 10;
    addText('ملاحظات:', pageWidth - margin, currentY, { bold: true });
    currentY += 6;
    addText(storeInfo.notes, pageWidth - margin, currentY);
    currentY += 8;
  }

  // Payment instructions
  if (storeInfo.paymentInstructions) {
    addText('تعليمات الدفع:', pageWidth - margin, currentY, { bold: true });
    currentY += 6;
    addText(storeInfo.paymentInstructions, pageWidth - margin, currentY);
    currentY += 8;
  }

  // Footer
  currentY += 20;
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 10;
  addText(storeInfo.footer || "شكراً لزيارتكم!", pageWidth / 2, currentY, { 
    align: 'center' 
  });

  // Return PDF as blob
  return doc.output('blob');
}

export async function downloadInvoicePDF(sale: Sale, storeInfo: StoreInfo) {
  try {
    const pdfBlob = await generateInvoicePDF(sale, storeInfo);
    
    // Create download link
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoice-${sale.invoice_number}.pdf`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up
    URL.revokeObjectURL(url);
    
    return pdfBlob;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

export async function printInvoicePDF(sale: Sale, storeInfo: StoreInfo) {
  try {
    const pdfBlob = await generateInvoicePDF(sale, storeInfo);
    
    // Create blob URL and open in new window for printing
    const url = URL.createObjectURL(pdfBlob);
    const printWindow = window.open(url, '_blank');
    
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
        // Clean up after printing
        setTimeout(() => {
          printWindow.close();
          URL.revokeObjectURL(url);
        }, 1000);
      };
    }
    
    return pdfBlob;
  } catch (error) {
    console.error('Error printing PDF:', error);
    throw error;
  }
}