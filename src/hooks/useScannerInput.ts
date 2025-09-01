import { useState, useEffect, useRef, useCallback } from 'react';

interface UseScannerInputOptions {
  onScan: (barcode: string) => void;
  minLength?: number;
  maxDelay?: number;
  enabled?: boolean;
}

export const useScannerInput = ({
  onScan,
  minLength = 8,
  maxDelay = 50,
  enabled = false
}: UseScannerInputOptions) => {
  const [buffer, setBuffer] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const lastInputTimeRef = useRef<number>(0);
  const inputSpeedRef = useRef<number[]>([]);
  const processingRef = useRef(false);

  const clearBuffer = useCallback(() => {
    console.log('Clearing buffer:', buffer);
    setBuffer('');
    setIsScanning(false);
    inputSpeedRef.current = [];
    processingRef.current = false;
  }, [buffer]);

  const processBuffer = useCallback(() => {
    if (processingRef.current || buffer.length < minLength) return;
    
    processingRef.current = true;
    console.log('Processing complete barcode:', buffer);
    onScan(buffer.trim());
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

    console.log('Key pressed:', event.key, 'Current buffer:', buffer + (event.key.length === 1 ? event.key : ''));

    if (event.key === 'Enter') {
      event.preventDefault();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      processBuffer();
      return;
    }

    // Only process printable characters and numbers
    if (event.key.length === 1 && /[0-9a-zA-Z]/.test(event.key)) {
      event.preventDefault();
      
      // If this is the first character or came quickly after previous (scanner behavior)
      if (lastInputTimeRef.current > 0 && timeDiff < 100) {
        inputSpeedRef.current.push(timeDiff);
        setIsScanning(true);
      } else if (lastInputTimeRef.current === 0) {
        // First character
        setIsScanning(true);
      }

      const newBuffer = buffer + event.key;
      setBuffer(newBuffer);
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
  }, [enabled, processBuffer, maxDelay, buffer]);

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