import React, { useRef, useEffect, useState } from 'react';
import * as JsBarcode from 'jsbarcode';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Printer, QrCode, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { bluetoothPrinterService } from '@/services/bluetoothPrinterService';
import { Product } from '@/types';
import { fetchStoreSettings } from '@/services/supabase/storeService';

interface BarcodeGeneratorProps {
  product: Product;
  storeName?: string;
}

export const BarcodeGenerator: React.FC<BarcodeGeneratorProps> = ({ 
  product, 
  storeName: propStoreName = "متجري" 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const printCanvasRef = useRef<HTMLCanvasElement>(null);
  const [customBarcode, setCustomBarcode] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [storeName, setStoreName] = useState(propStoreName);

  // Fetch store settings when component opens
  useEffect(() => {
    if (isOpen) {
      fetchStoreSettings().then((settings) => {
        if (settings?.name) {
          setStoreName(settings.name);
        }
      });
    }
  }, [isOpen]);

  // Generate barcode for product if it doesn't have one
  const generateProductBarcode = () => {
    if (product.barcode) return product.barcode;
    
    // Generate a simple barcode based on product ID
    const timestamp = Date.now().toString().slice(-6);
    const productCode = product.id.slice(-6);
    return `${timestamp}${productCode}`.slice(0, 12);
  };

  const barcodeValue = customBarcode || product.barcode || generateProductBarcode();

  const generateBarcode = (canvas: HTMLCanvasElement, includeText = true) => {
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size for thermal printer (58mm width)
    const width = 384; // 58mm * 8 pixels/mm (thermal printer resolution)
    const height = includeText ? 200 : 120;
    
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    // Generate barcode
    try {
      // Create temporary canvas for barcode only
      const tempCanvas = document.createElement('canvas');
      JsBarcode(tempCanvas, barcodeValue, {
        format: 'CODE128',
        width: 2,
        height: 60,
        displayValue: true,
        fontSize: 12,
        textAlign: 'center',
        textPosition: 'bottom',
        background: 'white',
        lineColor: 'black',
        margin: 0
      });

      // Draw barcode on main canvas (centered)
      const barcodeX = (width - tempCanvas.width) / 2;
      ctx.drawImage(tempCanvas, barcodeX, 10);

      if (includeText) {
        // Set text properties
        ctx.fillStyle = 'black';
        ctx.textAlign = 'center';
        
        // Product name (Arabic support)
        ctx.font = 'bold 14px Arial, sans-serif';
        const productName = product.name.length > 25 
          ? product.name.substring(0, 25) + '...' 
          : product.name;
        
        ctx.fillText(productName, width / 2, tempCanvas.height + 35);
        
        // Store name
        ctx.font = '12px Arial, sans-serif';
        ctx.fillText(storeName, width / 2, tempCanvas.height + 55);
        
        // Price
        if (product.price) {
          ctx.font = 'bold 12px Arial, sans-serif';
          ctx.fillText(`${product.price} ج.م`, width / 2, tempCanvas.height + 75);
        }
      }
    } catch (error) {
      console.error('Error generating barcode:', error);
      toast.error('خطأ في توليد الباركود');
    }
  };

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      generateBarcode(canvasRef.current, true);
    }
  }, [isOpen, barcodeValue, product, storeName]);

  const handlePrint = async () => {
    if (!printCanvasRef.current) return;

    generateBarcode(printCanvasRef.current, true);
    
    // Try Bluetooth printer first
    if (bluetoothPrinterService.isConnected()) {
      const success = await bluetoothPrinterService.printBarcode(printCanvasRef.current);
      if (success) {
        toast.success('تم الطباعة عبر البلوتوث');
        return;
      }
    }
    
    // Use web-based printing (works on Android Chrome)
    const canvas = printCanvasRef.current;
    const dataURL = canvas.toDataURL('image/png');

    // Create a temporary container for printing
    const printContainer = document.createElement('div');
    printContainer.style.position = 'fixed';
    printContainer.style.left = '-9999px';
    printContainer.style.top = '0';
    
    printContainer.innerHTML = `
      <div id="barcode-print-content" style="
        width: 58mm;
        max-width: 58mm;
        margin: 0;
        padding: 0;
        font-family: Arial, sans-serif;
        direction: rtl;
      ">
        <img src="${dataURL}" alt="Barcode" style="
          width: 100%;
          height: auto;
          display: block;
        " />
      </div>
    `;

    document.body.appendChild(printContainer);

    // Add print styles
    const printStyle = document.createElement('style');
    printStyle.id = 'barcode-print-styles';
    printStyle.textContent = `
      @media print {
        body * {
          visibility: hidden;
        }
        #barcode-print-content,
        #barcode-print-content * {
          visibility: visible;
        }
        #barcode-print-content {
          position: absolute;
          left: 0;
          top: 0;
          width: 58mm !important;
          max-width: 58mm !important;
        }
        @page {
          size: 58mm auto;
          margin: 0;
        }
      }
    `;
    document.head.appendChild(printStyle);

    // Trigger print
    setTimeout(() => {
      window.print();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(printContainer);
        const styleElement = document.getElementById('barcode-print-styles');
        if (styleElement) {
          document.head.removeChild(styleElement);
        }
      }, 100);
      
      toast.success('تم إرسال الباركود للطباعة');
    }, 100);
  };

  const copyBarcode = () => {
    navigator.clipboard.writeText(barcodeValue).then(() => {
      toast.success('تم نسخ رقم الباركود');
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <QrCode className="h-4 w-4 ml-2" />
          إنشاء باركود
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>إنشاء وطباعة باركود</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="product-name">اسم المنتج</Label>
            <Input value={product.name} disabled />
          </div>

          <div>
            <Label htmlFor="barcode-value">رقم الباركود</Label>
            <div className="flex gap-2">
              <Input
                id="barcode-value"
                value={barcodeValue}
                onChange={(e) => setCustomBarcode(e.target.value)}
                placeholder="أدخل رقم الباركود أو اتركه فارغ للتوليد التلقائي"
              />
              <Button variant="outline" size="sm" onClick={copyBarcode}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex justify-center border-2 border-dashed border-gray-200 p-4 rounded-lg">
            <canvas 
              ref={canvasRef}
              className="max-w-full border border-gray-300 rounded"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handlePrint} className="flex-1">
              <Printer className="h-4 w-4 ml-2" />
              طباعة
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setIsOpen(false)}
              className="flex-1"
            >
              إغلاق
            </Button>
          </div>
        </div>

        {/* Hidden canvas for printing */}
        <canvas ref={printCanvasRef} style={{ display: 'none' }} />
      </DialogContent>
    </Dialog>
  );
};