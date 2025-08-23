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
      if (success) return;
    }
    
    // Fallback to regular print window
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('لا يمكن فتح نافذة الطباعة');
      return;
    }

    const canvas = printCanvasRef.current;
    const dataURL = canvas.toDataURL('image/png');

    printWindow.document.write(`
      <html>
        <head>
          <title>طباعة باركود - ${product.name}</title>
          <style>
            body {
              margin: 0;
              padding: 10px;
              text-align: center;
              font-family: Arial, sans-serif;
            }
            img {
              max-width: 100%;
              height: auto;
            }
            @media print {
              body { margin: 0; padding: 0; }
              img { 
                width: 58mm; 
                height: auto;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <img src="${dataURL}" alt="Barcode for ${product.name}" />
        </body>
      </html>
    `);

    printWindow.document.close();
    
    // Wait for image to load then print
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);

    toast.success('تم إرسال الباركود للطباعة');
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