
import React, { useRef, useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Camera, X } from "lucide-react";

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

  // Check if BarcodeDetector is supported
  const isBarcodeDetectorSupported = 'BarcodeDetector' in window;

  useEffect(() => {
    // Initialize BarcodeDetector if supported
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
    } else {
      console.warn("BarcodeDetector API is not supported in this browser.");
    }

    return () => {
      // Clean up scan interval if it exists
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      
      // Stop scanning when dialog is closed
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
        setScanning(false);
      }
    }
    
    return () => {
      stopCamera();
      
      // Clean up scan interval on unmount
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, [isOpen]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', // Use back camera if available
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setHasPermission(true);
        
        // Start scanning automatically after camera is ready
        videoRef.current.onloadedmetadata = () => {
          startBarcodeScanning();
        };
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("لا يمكن الوصول إلى الكاميرا. يرجى التحقق من أذونات الكاميرا.");
      setHasPermission(false);
    }
  };

  const stopCamera = () => {
    // Stop the camera when dialog is closed
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const startBarcodeScanning = () => {
    if (!videoRef.current || !canvasRef.current || !isBarcodeDetectorSupported) return;

    setScanning(true);

    // Start scanning at regular intervals (adjust timing for performance)
    scanIntervalRef.current = window.setInterval(() => {
      scanBarcode();
    }, 200) as unknown as number; // Scan more frequently (every 200ms)
  };

  const scanBarcode = async () => {
    if (!videoRef.current || !canvasRef.current || !barcodeDetectorRef.current) return;

    try {
      // Draw current video frame to canvas for processing
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return;

      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw the current video frame to the canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Detect barcodes in the image
      const barcodes = await barcodeDetectorRef.current.detect(canvas);

      if (barcodes.length > 0) {
        // Stop scanning once a barcode is detected
        if (scanIntervalRef.current) {
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
          setScanning(false);
        }

        // Get the first detected barcode
        const barcode = barcodes[0].rawValue;
        
        // Highlight the detected barcode
        const boundingBox = barcodes[0].boundingBox;
        ctx.strokeStyle = 'lime';
        ctx.lineWidth = 5;
        ctx.strokeRect(
          boundingBox.x, 
          boundingBox.y, 
          boundingBox.width, 
          boundingBox.height
        );
        
        // Delay a bit to show the highlight before closing
        setTimeout(() => {
          onScan(barcode);
          onClose();
        }, 800);
      }
    } catch (err) {
      console.error("Error scanning barcode:", err);
    }
  };

  // Fallback for browsers that don't support BarcodeDetector
  const handleTestScan = () => {
    // Simulating a random barcode
    const randomBarcode = Math.floor(Math.random() * 10000000000000).toString().padStart(13, '0');
    onScan(randomBarcode);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>مسح الباركود</DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          {hasPermission === false ? (
            <div className="text-center p-6 text-destructive">
              <p>{error || "تعذر الوصول إلى الكاميرا"}</p>
            </div>
          ) : (
            <div className="relative aspect-video bg-muted rounded-md overflow-hidden">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
              <canvas 
                ref={canvasRef} 
                className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
              />
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
          
          <p className="text-sm text-muted-foreground mt-4 text-center">
            قم بتوجيه الكاميرا نحو الباركود ليتم مسحه تلقائياً
          </p>
          
          {!isBarcodeDetectorSupported && (
            <p className="text-xs text-amber-600 mt-2 text-center">
              متصفحك لا يدعم قراءة الباركود تلقائياً. استخدم زر "اختبار المسح" أدناه.
            </p>
          )}
        </div>
        
        <DialogFooter className="sm:justify-start flex space-x-2 space-x-reverse">
          <Button 
            type="button" 
            onClick={handleTestScan}
            className="flex-1"
          >
            <Camera className="ml-2 h-4 w-4" />
            اختبار المسح
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            <X className="ml-2 h-4 w-4" />
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BarcodeScanner;
