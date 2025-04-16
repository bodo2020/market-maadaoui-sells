
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { Sale } from "@/types";
import { Printer, Save, FileText } from "lucide-react";
import { printInvoice } from '@/services/supabase/saleService';

interface InvoiceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
}

const InvoiceDialog: React.FC<InvoiceDialogProps> = ({ isOpen, onClose, sale }) => {
  if (!sale) return null;

  const handlePrint = () => {
    // Get store info from site config
    const storeInfo = {
      name: siteConfig.name,
      address: siteConfig.address || "العنوان غير متوفر",
      phone: siteConfig.phone || "الهاتف غير متوفر",
      vatNumber: siteConfig.vatNumber || "", // Use default empty string if not available
      logo: siteConfig.logo || siteConfig.logoUrl // Use logoUrl as fallback
    };
    
    // Print the invoice
    printInvoice(sale, storeInfo);
  };

  // Format sale date
  const saleDate = new Date(sale.date);
  const formattedDate = saleDate.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>فاتورة المبيعات</DialogTitle>
        </DialogHeader>
        
        <div className="invoice-preview p-4 border rounded-md bg-gray-50">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold">{siteConfig.name}</h2>
            {siteConfig.address && <p className="text-sm text-muted-foreground">{siteConfig.address}</p>}
            {siteConfig.phone && <p className="text-sm text-muted-foreground">هاتف: {siteConfig.phone}</p>}
          </div>
          
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="font-medium">رقم الفاتورة:</p>
              <p className="text-lg font-bold">{sale.invoice_number}</p>
            </div>
            <div className="text-left">
              <p className="font-medium">التاريخ:</p>
              <p>{formattedDate}</p>
            </div>
          </div>
          
          {sale.customer_name && (
            <div className="mb-4">
              <p className="font-medium">العميل:</p>
              <p>{sale.customer_name}</p>
              {sale.customer_phone && <p>هاتف: {sale.customer_phone}</p>}
            </div>
          )}
          
          <div className="border-t border-b py-2 my-4">
            <table className="w-full">
              <thead className="text-sm font-medium">
                <tr className="border-b">
                  <th className="text-right py-2 w-1/2">الصنف</th>
                  <th className="text-center py-2">الكمية</th>
                  <th className="text-center py-2">السعر</th>
                  <th className="text-left py-2">المجموع</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {sale.items.map((item, index) => (
                  <tr key={index} className="border-b border-dashed">
                    <td className="py-2">{item.product.name}</td>
                    <td className="text-center py-2">
                      {item.weight ? `${item.weight} كجم` : item.quantity}
                    </td>
                    <td className="text-center py-2">{item.price.toFixed(2)}</td>
                    <td className="text-left py-2">{item.total.toFixed(2)} {siteConfig.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="text-left space-y-1 mt-4">
            <div className="flex justify-between">
              <span className="font-medium">المجموع الفرعي:</span>
              <span>{sale.subtotal.toFixed(2)} {siteConfig.currency}</span>
            </div>
            {sale.discount > 0 && (
              <div className="flex justify-between text-primary">
                <span className="font-medium">الخصم:</span>
                <span>- {sale.discount.toFixed(2)} {siteConfig.currency}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg pt-2 border-t">
              <span>الإجمالي:</span>
              <span>{sale.total.toFixed(2)} {siteConfig.currency}</span>
            </div>
            
            <div className="mt-4 text-sm text-muted-foreground">
              <p>طريقة الدفع: {
                sale.payment_method === 'cash' ? 'نقدي' : 
                sale.payment_method === 'card' ? 'بطاقة' : 'مختلط'
              }</p>
              {sale.cash_amount && <p>المبلغ النقدي: {sale.cash_amount.toFixed(2)} {siteConfig.currency}</p>}
              {sale.card_amount && <p>مبلغ البطاقة: {sale.card_amount.toFixed(2)} {siteConfig.currency}</p>}
            </div>
          </div>
          
          <div className="text-center text-sm text-muted-foreground mt-8 pt-4 border-t">
            <p>شكراً لزيارتكم!</p>
          </div>
        </div>
        
        <DialogFooter className="sm:justify-start">
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" />
            طباعة الفاتورة
          </Button>
          <Button variant="outline" onClick={onClose}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceDialog;
