import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bluetooth, Printer, Check, X, Loader2 } from "lucide-react";
import { bluetoothPrinterService } from '@/services/bluetoothPrinterService';

interface PrinterManagerProps {
  onPrinterConnected?: (printerName: string) => void;
}

const PrinterManager: React.FC<PrinterManagerProps> = ({ onPrinterConnected }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [savedPrinter, setSavedPrinter] = useState<{ name: string; id: string } | null>(null);

  useEffect(() => {
    // Check if there's a saved printer
    const saved = bluetoothPrinterService.getSavedPrinter();
    setSavedPrinter(saved);
    setIsConnected(bluetoothPrinterService.isConnected());
  }, []);

  const handleConnectPrinter = async () => {
    setIsConnecting(true);
    try {
      const success = await bluetoothPrinterService.connectPrinter();
      
      if (success) {
        const saved = bluetoothPrinterService.getSavedPrinter();
        setSavedPrinter(saved);
        setIsConnected(true);
        
        if (saved && onPrinterConnected) {
          onPrinterConnected(saved.name);
        }
        
        toast.success('تم ربط الطابعة بنجاح - تعمل للفواتير والباركود معاً');
      }
    } catch (error) {
      console.error('Error connecting printer:', error);
      toast.error('فشل في الاتصال بالطابعة');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectPrinter = async () => {
    await bluetoothPrinterService.disconnectPrinter();
    setSavedPrinter(null);
    setIsConnected(false);
    toast.success('تم فصل الطابعة');
  };

  const handleTestPrint = async () => {
    if (!isConnected) {
      toast.error('الطابعة غير متصلة');
      return;
    }

    const testText = `
================================
         اختبار طباعة
================================

التاريخ: ${new Date().toLocaleDateString('ar-EG')}
الوقت: ${new Date().toLocaleTimeString('ar-EG')}

هذه رسالة اختبار للتأكد من عمل
الطابعة بشكل صحيح.

================================
       تم بنجاح ✓
================================

`;

    const success = await bluetoothPrinterService.printText(testText);
    if (success) {
      toast.success('تم إرسال اختبار الطباعة');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bluetooth className="h-5 w-5" />
          طابعة البلوتوث
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          <p>طابعة واحدة تعمل للفواتير والباركود معاً</p>
        </div>

        {savedPrinter ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <Bluetooth className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="font-medium">{savedPrinter.name}</p>
                  <p className="text-sm text-muted-foreground">طابعة بلوتوث</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Badge variant={isConnected ? 'default' : 'secondary'}>
                  {isConnected ? 'متصلة' : 'غير متصلة'}
                </Badge>
                
                {isConnected && (
                  <Button variant="outline" size="sm" onClick={handleTestPrint}>
                    <Printer className="h-4 w-4 mr-2" />
                    اختبار
                  </Button>
                )}
                
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleDisconnectPrinter}
                >
                  <X className="h-4 w-4 mr-2" />
                  فصل
                </Button>
              </div>
            </div>
            
            {isConnected && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-800">
                  <Check className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    الطابعة جاهزة للفواتير والباركود
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-6">
            <Bluetooth className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground mb-4">لا توجد طابعة مربوطة</p>
            
            <Button 
              onClick={handleConnectPrinter} 
              disabled={isConnecting}
              className="gap-2"
            >
              {isConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bluetooth className="h-4 w-4" />
              )}
              ربط طابعة بلوتوث
            </Button>
          </div>
        )}

        <div className="text-xs text-muted-foreground space-y-1">
          <p>• تأكد من تشغيل البلوتوث في جهازك</p>
          <p>• اجعل الطابعة في وضع الاكتشاف</p>
          <p>• ستطبع الفواتير تلقائياً بعد كل عملية بيع</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PrinterManager;