import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { Order } from "@/types";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface OnlineOrderInvoiceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
}

interface EnrichedOrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  total: number;
  image_url?: string;
  barcode?: string;
  is_bulk?: boolean;
  is_weight_based?: boolean;
  bulk_quantity?: number;
}

const OnlineOrderInvoiceDialog: React.FC<OnlineOrderInvoiceDialogProps> = ({ 
  isOpen, 
  onClose, 
  order
}) => {
  // Move early return BEFORE any hooks to follow Rules of Hooks
  if (!order) return null;

  const [enrichedItems, setEnrichedItems] = useState<EnrichedOrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch product names from database
  useEffect(() => {
    const fetchProductNames = async () => {
      if (!order?.items || order.items.length === 0) return;
      
      setIsLoading(true);
      try {
        const productIds = order.items.map(item => item.product_id);
        
        const { data: products, error } = await supabase
          .from('products')
          .select('id, name')
          .in('id', productIds);

        if (error) {
          console.error('Error fetching product names:', error);
        setEnrichedItems(order.items.map(item => ({
          ...item,
          product_name: (item as any).name || item.product_name || 'منتج غير محدد'
        })));
          return;
        }

        // Create a map of product_id to product_name
        const productNameMap = new Map(products.map(p => [p.id, p.name]));

        // Enrich order items with database product names - use (item as any).name to access raw data
        const enriched = order.items.map(item => ({
          ...item,
          product_name: productNameMap.get(item.product_id) || (item as any).name || item.product_name || 'منتج غير محدد'
        }));

        setEnrichedItems(enriched);
      } catch (error) {
        console.error('Error enriching order items:', error);
        setEnrichedItems(order.items.map(item => ({
          ...item,
          product_name: (item as any).name || item.product_name || 'منتج غير محدد'
        })));
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen && order) {
      fetchProductNames();
    }
  }, [isOpen, order]);

  const handlePrint = () => {
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Generate the HTML for the invoice using enriched items
    const invoiceHTML = generateInvoiceHTML(order, enrichedItems);
    
    printWindow.document.write(invoiceHTML);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const generateInvoiceHTML = (order: Order, items: EnrichedOrderItem[]) => {
    const orderDate = new Date(order.created_at);
    const formattedDate = orderDate.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const paymentStatusText = {
      'pending': 'في الانتظار',
      'paid': 'مدفوع',
      'failed': 'فشل الدفع'
    }[order.payment_status] || order.payment_status;

    const statusText = {
      'waiting': 'في الانتظار',
      'processing': 'قيد المعالجة',
      'shipped': 'تم الشحن',
      'done': 'مكتمل',
      'cancelled': 'ملغي'
    }[order.status] || order.status;

    return `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>فاتورة طلب إلكتروني - ${order.id.slice(0, 8)}</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            direction: rtl;
            margin: 0;
            padding: 20px;
            font-size: 14px;
            line-height: 1.6;
          }
          .invoice-container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            overflow: hidden;
          }
          .header {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            border-bottom: 2px solid #e9ecef;
          }
          .header h1 {
            margin: 0 0 10px 0;
            color: #333;
            font-size: 24px;
          }
          .header p {
            margin: 5px 0;
            color: #666;
          }
          .content {
            padding: 20px;
          }
          .order-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            flex-wrap: wrap;
          }
          .order-info div {
            margin-bottom: 10px;
          }
          .customer-info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
          }
          .customer-info h3 {
            margin: 0 0 10px 0;
            color: #333;
            font-size: 16px;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          .items-table th,
          .items-table td {
            padding: 12px;
            text-align: center;
            border-bottom: 1px solid #ddd;
          }
          .items-table th {
            background: #f8f9fa;
            font-weight: bold;
            color: #333;
          }
          .items-table tr:nth-child(even) {
            background: #f8f9fa;
          }
          .total-section {
            text-align: left;
            margin-top: 20px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            padding: 5px 0;
          }
          .total-row.final {
            border-top: 2px solid #333;
            font-weight: bold;
            font-size: 18px;
            margin-top: 15px;
            padding-top: 10px;
          }
          .status-info {
            background: #e3f2fd;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
          }
          .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            margin-right: 10px;
          }
          .status-pending { background: #fff3cd; color: #856404; }
          .status-paid { background: #d4edda; color: #155724; }
          .status-failed { background: #f8d7da; color: #721c24; }
          .status-waiting { background: #fff3cd; color: #856404; }
          .status-processing { background: #cce5ff; color: #004085; }
          .status-shipped { background: #d1ecf1; color: #0c5460; }
          .status-done { background: #d4edda; color: #155724; }
          .status-cancelled { background: #f8d7da; color: #721c24; }
          .footer {
            text-align: center;
            padding: 20px;
            border-top: 1px solid #ddd;
            background: #f8f9fa;
            color: #666;
          }
          @media print {
            body { padding: 0; }
            .invoice-container { border: none; }
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="header">
            <h1>${siteConfig.name}</h1>
            ${siteConfig.address ? `<p>${siteConfig.address}</p>` : ''}
            ${siteConfig.phone ? `<p>هاتف: ${siteConfig.phone}</p>` : ''}
            ${siteConfig.email ? `<p>البريد الإلكتروني: ${siteConfig.email}</p>` : ''}
          </div>
          
          <div class="content">
            <div class="order-info">
              <div>
                <strong>رقم الطلب:</strong> #${order.id.slice(0, 8)}<br>
                <strong>تاريخ الطلب:</strong> ${formattedDate}
              </div>
              <div>
                <strong>طريقة الدفع:</strong> ${order.payment_method || 'غير محدد'}<br>
                <strong>تكلفة الشحن:</strong> ${(order.shipping_cost || 0).toFixed(2)} ${siteConfig.currency}
              </div>
            </div>

            <div class="status-info">
              <div>
                <strong>حالة الطلب:</strong>
                <span class="status-badge status-${order.status}">${statusText}</span>
              </div>
              <div style="margin-top: 10px;">
                <strong>حالة الدفع:</strong>
                <span class="status-badge status-${order.payment_status}">${paymentStatusText}</span>
              </div>
            </div>

            <div class="customer-info">
              <h3>بيانات العميل</h3>
              <p><strong>الاسم:</strong> ${order.customer_name || 'غير محدد'}</p>
              ${order.customer_phone ? `<p><strong>رقم الهاتف:</strong> ${order.customer_phone}</p>` : ''}
              ${order.customer_email ? `<p><strong>البريد الإلكتروني:</strong> ${order.customer_email}</p>` : ''}
              ${order.shipping_address ? `<p><strong>عنوان التوصيل:</strong> ${order.shipping_address}</p>` : ''}
              ${order.governorate ? `<p><strong>المحافظة:</strong> ${order.governorate}</p>` : ''}
              ${order.city ? `<p><strong>المدينة:</strong> ${order.city}</p>` : ''}
              ${order.area ? `<p><strong>المنطقة:</strong> ${order.area}</p>` : ''}
              ${order.neighborhood ? `<p><strong>الحي:</strong> ${order.neighborhood}</p>` : ''}
            </div>

            <table class="items-table">
              <thead>
                <tr>
                  <th>المنتج</th>
                  <th>الكمية</th>
                  <th>السعر</th>
                  <th>المجموع</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(item => `
                  <tr>
                    <td>${item.product_name}</td>
                    <td>${item.quantity}</td>
                    <td>${(item.price || 0).toFixed(2)} ${siteConfig.currency}</td>
                    <td>${((item.price || 0) * (item.quantity || 0)).toFixed(2)} ${siteConfig.currency}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="total-section">
              <div class="total-row">
                <span>المجموع الفرعي:</span>
                <span>${((order.total || 0) - (order.shipping_cost || 0)).toFixed(2)} ${siteConfig.currency}</span>
              </div>
              ${order.shipping_cost ? `
                <div class="total-row">
                  <span>تكلفة الشحن:</span>
                  <span>${order.shipping_cost.toFixed(2)} ${siteConfig.currency}</span>
                </div>
              ` : ''}
              <div class="total-row final">
                <span>الإجمالي:</span>
                <span>${(order.total || 0).toFixed(2)} ${siteConfig.currency}</span>
              </div>
            </div>

            ${order.notes ? `
              <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 6px;">
                <strong>ملاحظات:</strong>
                <p style="margin: 10px 0 0 0;">${order.notes}</p>
              </div>
            ` : ''}
          </div>

          <div class="footer">
            <p>شكراً لاختياركم متجرنا</p>
            <p>تم إنشاء هذه الفاتورة في ${new Date().toLocaleDateString('ar-EG')}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  // Format order date for preview
  const orderDate = new Date(order.created_at);
  const formattedDate = orderDate.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const paymentStatusText = {
    'pending': 'في الانتظار',
    'paid': 'مدفوع',
    'failed': 'فشل الدفع'
  }[order.payment_status] || order.payment_status;

  const statusText = {
    'waiting': 'في الانتظار',
    'processing': 'قيد المعالجة',
    'shipped': 'تم الشحن',
    'done': 'مكتمل',
    'cancelled': 'ملغي'
  }[order.status] || order.status;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>فاتورة الطلب الإلكتروني #{order.id.slice(0, 8)}</DialogTitle>
        </DialogHeader>
        
        <div className="invoice-preview p-4 border rounded-md bg-gray-50">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold">{siteConfig.name}</h2>
            {siteConfig.address && <p className="text-sm text-muted-foreground">{siteConfig.address}</p>}
            {siteConfig.phone && <p className="text-sm text-muted-foreground">هاتف: {siteConfig.phone}</p>}
          </div>
          
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="font-medium">رقم الطلب:</p>
              <p className="text-lg font-bold">#{order.id.slice(0, 8)}</p>
            </div>
            <div className="text-left">
              <p className="font-medium">التاريخ:</p>
              <p>{formattedDate}</p>
            </div>
          </div>

          <div className="mb-4 p-3 bg-blue-50 rounded">
            <div className="flex justify-between items-center">
              <div>
                <span className="font-medium">حالة الطلب: </span>
                <span className="font-bold text-blue-700">{statusText}</span>
              </div>
              <div>
                <span className="font-medium">حالة الدفع: </span>
                <span className={`font-bold ${order.payment_status === 'paid' ? 'text-green-700' : 'text-orange-700'}`}>
                  {paymentStatusText}
                </span>
              </div>
            </div>
          </div>
          
          <div className="mb-4 p-3 bg-gray-100 rounded">
            <h3 className="font-medium mb-2">بيانات العميل</h3>
            <p><strong>الاسم:</strong> {order.customer_name || 'غير محدد'}</p>
            {order.customer_phone && <p><strong>الهاتف:</strong> {order.customer_phone}</p>}
            {order.customer_email && <p><strong>البريد الإلكتروني:</strong> {order.customer_email}</p>}
            {order.shipping_address && <p><strong>العنوان:</strong> {order.shipping_address}</p>}
            {order.governorate && <p><strong>المحافظة:</strong> {order.governorate}</p>}
            {order.city && <p><strong>المدينة:</strong> {order.city}</p>}
            {order.area && <p><strong>المنطقة:</strong> {order.area}</p>}
            {order.neighborhood && <p><strong>الحي:</strong> {order.neighborhood}</p>}
          </div>
          
          <div className="border-t border-b py-2 my-4">
            <table className="w-full">
              <thead className="text-sm font-medium">
                <tr className="border-b">
                  <th className="text-right py-2">المنتج</th>
                  <th className="text-center py-2">الكمية</th>
                  <th className="text-center py-2">السعر</th>
                  <th className="text-left py-2">المجموع</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {enrichedItems.map((item, index) => (
                  <tr key={index} className="border-b border-dashed">
                    <td className="py-2">{item.product_name}</td>
                    <td className="text-center py-2">{item.quantity}</td>
                    <td className="text-center py-2">{(item.price || 0).toFixed(2)}</td>
                    <td className="text-left py-2">{((item.price || 0) * (item.quantity || 0)).toFixed(2)} {siteConfig.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="text-left space-y-1 mt-4">
            <div className="flex justify-between">
              <span className="font-medium">المجموع الفرعي:</span>
              <span>{((order.total || 0) - (order.shipping_cost || 0)).toFixed(2)} {siteConfig.currency}</span>
            </div>
            {order.shipping_cost && order.shipping_cost > 0 && (
              <div className="flex justify-between">
                <span className="font-medium">تكلفة الشحن:</span>
                <span>{order.shipping_cost.toFixed(2)} {siteConfig.currency}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg pt-2 border-t">
              <span>الإجمالي:</span>
              <span>{(order.total || 0).toFixed(2)} {siteConfig.currency}</span>
            </div>
            
            <div className="mt-4 text-sm text-muted-foreground">
              <p>طريقة الدفع: {order.payment_method || 'غير محدد'}</p>
            </div>
          </div>
          
          {order.notes && (
            <div className="text-sm mt-4 pt-2 border-t">
              <p className="font-medium">ملاحظات:</p>
              <p>{order.notes}</p>
            </div>
          )}
          
          <div className="text-center text-sm text-muted-foreground mt-8 pt-4 border-t">
            <p>شكراً لاختياركم متجرنا</p>
          </div>
        </div>
        
        <DialogFooter className="sm:justify-start">
          <Button 
            onClick={handlePrint} 
            className="gap-2" 
            disabled={isLoading || enrichedItems.length === 0}
          >
            <Printer className="h-4 w-4" />
            {isLoading ? 'جاري التحميل...' : 'طباعة الفاتورة'}
          </Button>
          <Button variant="outline" onClick={onClose}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OnlineOrderInvoiceDialog;