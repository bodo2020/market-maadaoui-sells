import { supabase } from "@/integrations/supabase/client";
import { Sale, CartItem } from "@/types";

export async function createSale(sale: Omit<Sale, "id" | "created_at" | "updated_at">) {
  // Ensure the date is a string when sending to Supabase
  // and properly stringify the items array to make it compatible with Supabase Json type
  const saleData = {
    ...sale,
    date: typeof sale.date === 'object' ? (sale.date as Date).toISOString() : sale.date,
    // Convert CartItem[] to Json by stringifying it first then parsing it
    // This removes the complex object references and creates a plain object
    items: JSON.parse(JSON.stringify(sale.items))
  };

  const { data, error } = await supabase
    .from("sales")
    .insert(saleData)
    .select("*")
    .single();

  if (error) {
    console.error("Error creating sale:", error);
    throw error;
  }

  // Convert the returned data to match our Sale type
  return {
    ...data,
    items: data.items as unknown as CartItem[]
  } as Sale;
}

export async function fetchSales() {
  const { data, error } = await supabase
    .from("sales")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    console.error("Error fetching sales:", error);
    throw error;
  }

  // Convert all items in the array to match our Sale type
  return data.map(sale => ({
    ...sale,
    items: sale.items as unknown as CartItem[]
  })) as Sale[];
}

export async function fetchSaleById(id: string) {
  const { data, error } = await supabase
    .from("sales")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching sale:", error);
    throw error;
  }

  // Convert the returned data to match our Sale type
  return {
    ...data,
    items: data.items as unknown as CartItem[]
  } as Sale;
}

export async function generateInvoiceNumber() {
  // Get current date
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  
  // Get count of today's invoices to increment
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  
  const { count, error } = await supabase
    .from("sales")
    .select("*", { count: 'exact', head: true })
    .gte("date", startOfDay)
    .lt("date", endOfDay);
    
  if (error) {
    console.error("Error counting today's invoices:", error);
    throw error;
  }
  
  // Format: YYMMDD-XXXX where XXXX is the sequential number for the day
  const sequentialNumber = ((count || 0) + 1).toString().padStart(4, '0');
  return `${year}${month}${day}-${sequentialNumber}`;
}

/**
 * Creates a printable invoice for a sale
 * @param sale The sale to generate an invoice for
 * @returns HTML string of the invoice
 */
export function generateInvoiceHTML(sale: Sale, storeInfo: {
  name: string;
  address: string;
  phone: string;
  vatNumber?: string;
  logo?: string;
  website?: string;
  footer?: string;
  fontSize?: string;
  showVat?: boolean;
  template?: string;
  notes?: string;
  paymentInstructions?: string;
}) {
  // Get formatted date
  const saleDate = new Date(sale.date);
  const formattedDate = saleDate.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  // Set font size based on settings
  let fontSizeBase = "9pt";
  let fontSizeHeader = "16pt";
  let fontSizeTitle = "10pt";
  let fontSizeTotal = "12pt";
  
  if (storeInfo.fontSize === "small") {
    fontSizeBase = "8pt";
    fontSizeHeader = "14pt";
    fontSizeTitle = "9pt";
    fontSizeTotal = "10pt";
  } else if (storeInfo.fontSize === "large") {
    fontSizeBase = "11pt";
    fontSizeHeader = "18pt";
    fontSizeTitle = "12pt";
    fontSizeTotal = "14pt";
  }
  
  // Generate HTML
  const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>فاتورة ${sale.invoice_number}</title>
      <style>
        body {
          font-family: 'Arial', sans-serif;
          margin: 0;
          padding: 0;
          direction: rtl;
          font-size: ${fontSizeBase};
        }
        .invoice-container {
          width: 80mm;
          max-width: 80mm;
          margin: 0 auto;
          padding: 5mm;
        }
        .header {
          text-align: center;
          margin-bottom: 5mm;
        }
        .logo {
          max-width: 60mm;
          height: auto;
          margin-bottom: 3mm;
        }
        .store-name {
          font-size: ${fontSizeHeader};
          font-weight: bold;
          margin: 2mm 0;
        }
        .store-info {
          font-size: ${fontSizeBase};
          margin-bottom: 3mm;
        }
        .invoice-details {
          margin: 5mm 0;
          padding: 2mm 0;
          border-top: 1px dashed #000;
          border-bottom: 1px dashed #000;
          font-size: ${fontSizeTitle};
        }
        .invoice-number {
          font-weight: bold;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin: 5mm 0;
          font-size: ${fontSizeBase};
        }
        .items-table th {
          text-align: right;
          border-bottom: 1px solid #000;
          padding: 1mm 0;
        }
        .items-table td {
          padding: 1mm 0;
          vertical-align: top;
        }
        .item-total {
          text-align: left;
        }
        .totals {
          margin-top: 5mm;
          font-size: ${fontSizeTitle};
          text-align: left;
        }
        .grand-total {
          font-size: ${fontSizeTotal};
          font-weight: bold;
          margin-top: 2mm;
          border-top: 1px solid #000;
          padding-top: 2mm;
        }
        .notes {
          margin-top: 4mm;
          padding-top: 2mm;
          border-top: 1px dashed #000;
        }
        .footer {
          margin-top: 8mm;
          text-align: center;
          font-size: ${fontSizeBase};
          border-top: 1px dashed #000;
          padding-top: 3mm;
        }
        @media print {
          body {
            width: 80mm;
            margin: 0;
            padding: 0;
          }
          .no-print {
            display: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="header">
          ${storeInfo.logo ? `<img src="${storeInfo.logo}" class="logo" alt="شعار المتجر">` : ''}
          <div class="store-name">${storeInfo.name}</div>
          <div class="store-info">
            ${storeInfo.address}<br>
            هاتف: ${storeInfo.phone}
            ${storeInfo.website ? `<br>${storeInfo.website}` : ''}
            ${(storeInfo.showVat && storeInfo.vatNumber) ? `<br>الرقم الضريبي: ${storeInfo.vatNumber}` : ''}
          </div>
        </div>
        
        <div class="invoice-details">
          <div>رقم الفاتورة: <span class="invoice-number">${sale.invoice_number}</span></div>
          <div>التاريخ: ${formattedDate}</div>
          ${sale.customer_name ? `<div>العميل: ${sale.customer_name}</div>` : ''}
          ${sale.customer_phone ? `<div>هاتف: ${sale.customer_phone}</div>` : ''}
        </div>
        
        <table class="items-table">
          <thead>
            <tr>
              <th>الوصف</th>
              <th>الكمية</th>
              <th>السعر</th>
              <th>المجموع</th>
            </tr>
          </thead>
          <tbody>
            ${sale.items.map(item => `
              <tr>
                <td>${item.product.name}</td>
                <td>${item.weight ? `${item.weight} كجم` : item.quantity}</td>
                <td>${item.price.toFixed(2)}</td>
                <td class="item-total">${item.total.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="totals">
          <div>المجموع الفرعي: ${sale.subtotal.toFixed(2)}</div>
          ${sale.discount > 0 ? `<div>الخصم: ${sale.discount.toFixed(2)}</div>` : ''}
          <div class="grand-total">الإجمالي: ${sale.total.toFixed(2)}</div>
          
          <div style="margin-top: 3mm; font-size: ${fontSizeBase};">
            طريقة الدفع: 
            ${sale.payment_method === 'cash' ? 'نقدي' : 
              sale.payment_method === 'card' ? 'بطاقة' : 'مختلط'}
            ${sale.cash_amount ? `<br>المبلغ النقدي: ${sale.cash_amount.toFixed(2)}` : ''}
            ${sale.card_amount ? `<br>مبلغ البطاقة: ${sale.card_amount.toFixed(2)}` : ''}
          </div>
        </div>
        
        ${storeInfo.notes ? `
        <div class="notes">
          <div style="font-weight: bold;">ملاحظات:</div>
          <div>${storeInfo.notes}</div>
        </div>
        ` : ''}
        
        ${storeInfo.paymentInstructions ? `
        <div class="notes" style="border-top: none; padding-top: 0;">
          <div style="font-weight: bold;">تعليمات الدفع:</div>
          <div>${storeInfo.paymentInstructions}</div>
        </div>
        ` : ''}
        
        <div class="footer">
          ${storeInfo.footer || "شكراً لزيارتكم!"}
        </div>
      </div>
      
      <div class="no-print" style="text-align: center; margin-top: 20px;">
        <button onclick="window.print()">طباعة الفاتورة</button>
        <button onclick="window.close()">إغلاق</button>
      </div>
    </body>
    </html>
  `;
  
  return html;
}

/**
 * Opens a new window with the invoice for printing
 */
export function printInvoice(sale: Sale, storeInfo: {
  name: string;
  address: string;
  phone: string;
  vatNumber?: string;
  logo?: string;
  website?: string;
  footer?: string;
  fontSize?: string;
  showVat?: boolean;
  template?: string;
  notes?: string;
  paymentInstructions?: string;
}) {
  const invoiceHTML = generateInvoiceHTML(sale, storeInfo);
  
  // Open a new window with the invoice
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(invoiceHTML);
    printWindow.document.close();
    
    // Automatically print when loaded
    printWindow.onload = function() {
      printWindow.print();
    };
  }
  
  return invoiceHTML;
}
