
import { Order } from "@/types";
import { siteConfig } from "@/config/site";

export function printOrderInvoice(order: Order) {
  if (!order) return;
  
  // Create a new window for printing
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('الرجاء السماح بفتح النوافذ المنبثقة لطباعة الفاتورة');
    return;
  }
  
  // Format date for display
  const orderDate = new Date(order.created_at);
  const formattedDate = orderDate.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  // Calculate totals
  const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shippingCost = 0; // Adjust as needed
  
  // Generate items HTML
  const itemsHtml = order.items.map(item => `
    <tr class="border-b border-dashed">
      <td class="py-2">${item.product_name}</td>
      <td class="text-center py-2">${item.quantity}</td>
      <td class="text-center py-2">${item.price.toFixed(2)}</td>
      <td class="text-left py-2">${(item.price * item.quantity).toFixed(2)} ${siteConfig.currency}</td>
    </tr>
  `).join('');
  
  // Create the invoice HTML content
  const invoiceHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>فاتورة طلب #${order.id.slice(0, 8)}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          direction: rtl;
        }
        .invoice-container {
          max-width: 800px;
          margin: 0 auto;
          border: 1px solid #ddd;
          padding: 20px;
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 1px solid #ddd;
        }
        .header img {
          max-height: 70px;
          margin-bottom: 10px;
        }
        .info-section {
          display: flex;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .info-block {
          flex: 1;
        }
        .info-title {
          font-weight: bold;
          margin-bottom: 5px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        th {
          text-align: right;
          padding: 8px;
          border-bottom: 2px solid #ddd;
        }
        td {
          padding: 8px;
        }
        .totals {
          margin-top: 20px;
          text-align: left;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 5px;
        }
        .grand-total {
          font-weight: bold;
          font-size: 1.2em;
          border-top: 1px solid #ddd;
          padding-top: 5px;
          margin-top: 5px;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 0.9em;
          color: #666;
        }
        @media print {
          body { margin: 0; padding: 10px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="header">
          ${siteConfig.logoUrl ? `<img src="${siteConfig.logoUrl}" alt="${siteConfig.name}">` : ''}
          <h1>${siteConfig.name}</h1>
          <p>${siteConfig.address || ''}</p>
          <p>هاتف: ${siteConfig.phone || ''}</p>
        </div>
        
        <div class="info-section">
          <div class="info-block">
            <div class="info-title">تفاصيل الفاتورة:</div>
            <p>رقم الطلب: #${order.id.slice(0, 8)}</p>
            <p>التاريخ: ${formattedDate}</p>
            <p>حالة الطلب: ${getOrderStatusText(order.status)}</p>
            <p>حالة الدفع: ${getPaymentStatusText(order.payment_status)}</p>
          </div>
          
          <div class="info-block">
            <div class="info-title">بيانات العميل:</div>
            <p>الاسم: ${order.customer_name || 'غير معروف'}</p>
            ${order.customer_phone ? `<p>الهاتف: ${order.customer_phone}</p>` : ''}
            ${order.customer_email ? `<p>البريد الإلكتروني: ${order.customer_email}</p>` : ''}
            ${order.shipping_address ? `<p>العنوان: ${order.shipping_address}</p>` : ''}
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th style="width: 40%;">المنتج</th>
              <th style="width: 20%; text-align: center;">الكمية</th>
              <th style="width: 20%; text-align: center;">السعر</th>
              <th style="width: 20%; text-align: left;">المجموع</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        
        <div class="totals">
          <div class="total-row">
            <span>المجموع الفرعي:</span>
            <span>${subtotal.toFixed(2)} ${siteConfig.currency}</span>
          </div>
          <div class="total-row">
            <span>الشحن:</span>
            <span>${shippingCost.toFixed(2)} ${siteConfig.currency}</span>
          </div>
          <div class="total-row grand-total">
            <span>الإجمالي:</span>
            <span>${order.total.toFixed(2)} ${siteConfig.currency}</span>
          </div>
        </div>
        
        ${order.notes ? `
        <div style="margin-top: 20px; padding: 10px; border: 1px dashed #ddd;">
          <div class="info-title">ملاحظات:</div>
          <p>${order.notes}</p>
        </div>
        ` : ''}
        
        <div class="footer">
          <p>شكراً لتعاملك معنا!</p>
          ${order.delivery_person ? `<p>مندوب التوصيل: ${order.delivery_person}</p>` : ''}
          ${order.tracking_number ? `<p>رقم التتبع: ${order.tracking_number}</p>` : ''}
        </div>
        
        <div class="no-print" style="text-align: center; margin-top: 20px;">
          <button onclick="window.print();" style="padding: 8px 16px; cursor: pointer;">طباعة الفاتورة</button>
        </div>
      </div>
    </body>
    </html>
  `;
  
  // Write to the new window and print
  printWindow.document.open();
  printWindow.document.write(invoiceHtml);
  printWindow.document.close();
  
  // Wait for content to load before printing
  printWindow.onload = function() {
    // Automatically print (optional - can be removed if you prefer manual printing)
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };
}

// Helper functions
function getOrderStatusText(status: string): string {
  switch(status) {
    case 'pending': return 'قيد الانتظار';
    case 'processing': return 'قيد المعالجة';
    case 'ready': return 'جاهز للتوصيل';
    case 'shipped': return 'تم الشحن';
    case 'delivered': return 'تم التسليم';
    case 'cancelled': return 'ملغي';
    default: return 'غير معروف';
  }
}

function getPaymentStatusText(status: string): string {
  switch(status) {
    case 'pending': return 'بانتظار الدفع';
    case 'paid': return 'مدفوع';
    case 'failed': return 'فشل الدفع';
    case 'refunded': return 'تم الاسترجاع';
    default: return 'غير معروف';
  }
}
