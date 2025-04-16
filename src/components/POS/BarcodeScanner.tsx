
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
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
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
          }
        } catch (err) {
          console.error("Error accessing camera:", err);
          setError("لا يمكن الوصول إلى الكاميرا. يرجى التحقق من أذونات الكاميرا.");
          setHasPermission(false);
        }
      };
      
      startCamera();
    } else {
      // Stop the camera when dialog is closed
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    }
    
    return () => {
      // Clean up camera on unmount
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, [isOpen]);

  // Simulate a scan for demonstration purposes
  // In a real app, you would implement actual barcode detection here
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
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="border-2 border-primary w-2/3 h-1/3 rounded-md"></div>
              </div>
            </div>
          )}
          
          <p className="text-sm text-muted-foreground mt-4 text-center">
            قم بتوجيه الكاميرا نحو الباركود ليتم مسحه تلقائياً
          </p>
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
