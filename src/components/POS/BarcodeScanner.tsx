import React, { useRef, useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Camera, X, Smartphone } from "lucide-react";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ isOpen, onClose, onScan }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanIntervalRef = useRef<number | null>(null);
  const barcodeDetectorRef = useRef<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const isBarcodeDetectorSupported = 'BarcodeDetector' in window;

  useEffect(() => {
    if (isBarcodeDetectorSupported) {
      try {
        // @ts-ignore - TypeScript doesn't know about BarcodeDetector yet
        barcodeDetectorRef.current = new BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_39', 'code_128', 'qr_code', 'upc_a', 'upc_e'],
        });
      } catch (err) {
        console.error("Error initializing BarcodeDetector:", err);
        setError("لا يمكن تهيئة قارئ الباركود.");
      }
    }

    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsProcessing(false);
      void startCamera();
    } else {
      stopCamera();
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
        setScanning(false);
      }
      setIsProcessing(false);
    }

    return () => {
      stopCamera();
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      setIsProcessing(false);
    };
  }, [isOpen]);

  const emitScan = (barcode: string) => {
    const loyaltyEvent = new CustomEvent<{ barcode: string }>('pos:camera-barcode', {
      detail: { barcode },
      cancelable: true,
    });
    window.dispatchEvent(loyaltyEvent);
    if (!loyaltyEvent.defaultPrevented) onScan(barcode);
    onClose();
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setHasPermission(true);
        videoRef.current.onloadedmetadata = () => startBarcodeScanning();
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("لا يمكن الوصول إلى الكاميرا. يرجى التحقق من أذونات الكاميرا.");
      setHasPermission(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const startBarcodeScanning = () => {
    if (!videoRef.current || !canvasRef.current || !isBarcodeDetectorSupported) return;
    setScanning(true);
    scanIntervalRef.current = window.setInterval(() => void scanBarcode(), 200) as unknown as number;
  };

  const scanBarcode = async () => {
    if (!videoRef.current || !canvasRef.current || !barcodeDetectorRef.current || isProcessing) return;

    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const barcodes = await barcodeDetectorRef.current.detect(canvas);
      if (barcodes.length > 0 && !isProcessing) {
        setIsProcessing(true);
        if (scanIntervalRef.current) {
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
          setScanning(false);
        }

        const barcode = barcodes[0].rawValue;
        const boundingBox = barcodes[0].boundingBox;
        ctx.strokeStyle = 'lime';
        ctx.lineWidth = 5;
        ctx.strokeRect(boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height);
        emitScan(barcode);
      }
    } catch (err) {
      console.error("Error scanning barcode:", err);
    }
  };

  const handleTestScan = () => {
    const randomBarcode = Math.floor(Math.random() * 10000000000000).toString().padStart(13, '0');
    emitScan(randomBarcode);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>مسح الباركود</DialogTitle>
          <DialogDescription>
            يمكنك استخدام ماسح الباركود الخارجي مباشرة أو استخدام كاميرا الهاتف
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {hasPermission === false ? (
            <div className="text-center p-6 text-destructive">
              <p>{error || "تعذر الوصول إلى الكاميرا"}</p>
            </div>
          ) : (
            <div className="relative aspect-video bg-muted rounded-md overflow-hidden">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-0 pointer-events-none" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="border-2 border-primary w-2/3 h-1/3 rounded-md"></div>
              </div>
              {scanning && (
                <div className="absolute top-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-xs">
                  جاري البحث عن باركود...
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 mt-4">
            <p className="text-sm text-muted-foreground text-center">
              قم بتوجيه الكاميرا نحو الباركود ليتم مسحه تلقائياً
            </p>
            <div className="bg-muted/30 p-3 rounded-md flex items-center gap-2 text-sm border border-muted">
              <Smartphone className="h-4 w-4 text-primary" />
              <p>الماسح الضوئي الخارجي: قم بتوصيل الماسح وسيتم التقاط الباركود تلقائياً</p>
            </div>
            {!isBarcodeDetectorSupported && (
              <p className="text-xs text-amber-600 text-center">
                متصفحك لا يدعم قراءة الباركود تلقائياً. استخدم زر "اختبار المسح" أدناه.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="sm:justify-start flex space-x-2 space-x-reverse">
          <Button type="button" onClick={handleTestScan} className="flex-1">
            <Camera className="ml-2 h-4 w-4" />
            اختبار المسح
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            <X className="ml-2 h-4 w-4" />
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BarcodeScanner;
