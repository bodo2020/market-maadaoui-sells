import { useState, useEffect, useRef, useCallback } from 'react';

interface UseScannerInputOptions {
  onScan: (barcode: string) => void;
  minLength?: number;
  maxDelay?: number;
  enabled?: boolean;
}

export const useScannerInput = ({
  onScan,
  minLength = 3,
  maxDelay = 100,
  enabled = false
}: UseScannerInputOptions) => {
  const [buffer, setBuffer] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const lastInputTimeRef = useRef<number>(0);
  const inputSpeedRef = useRef<number[]>([]);

  const clearBuffer = useCallback(() => {
    setBuffer('');
    setIsScanning(false);
    inputSpeedRef.current = [];
  }, []);

  const processBuffer = useCallback(() => {
    if (buffer.length >= minLength) {
      // Calculate average input speed
      const avgSpeed = inputSpeedRef.current.length > 1 
        ? inputSpeedRef.current.reduce((a, b) => a + b, 0) / inputSpeedRef.current.length
        : 0;

      // If input speed is fast (less than 50ms between characters on average), treat as scanner
      if (avgSpeed < 50 && avgSpeed > 0) {
        console.log('Scanner detected - processing barcode:', buffer);
        onScan(buffer.trim());
      }
    }
    clearBuffer();
  }, [buffer, minLength, onScan, clearBuffer]);

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Ignore if user is typing in an input field (except our hidden scanner input)
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' && !target.classList.contains('scanner-input')) {
      return;
    }
    if (target.tagName === 'TEXTAREA') {
      return;
    }

    const currentTime = Date.now();
    const timeDiff = currentTime - lastInputTimeRef.current;

    if (event.key === 'Enter') {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      processBuffer();
      return;
    }

    // Only process printable characters
    if (event.key.length === 1) {
      // Track input speed for scanner detection
      if (lastInputTimeRef.current > 0 && timeDiff < 200) {
        inputSpeedRef.current.push(timeDiff);
        setIsScanning(true);
      }

      setBuffer(prev => prev + event.key);
      lastInputTimeRef.current = currentTime;

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout to process buffer
      timeoutRef.current = setTimeout(() => {
        processBuffer();
      }, maxDelay);
    }
  }, [enabled, processBuffer, maxDelay]);

  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeyPress);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, handleKeyPress]);

  // Save scanner mode preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bluetoothScannerMode', enabled.toString());
    }
  }, [enabled]);

  return {
    buffer,
    isScanning,
    clearBuffer
  };
};